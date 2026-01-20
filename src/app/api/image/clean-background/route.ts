import { NextRequest, NextResponse } from 'next/server';
import { fal } from '@fal-ai/client';
import sharp from 'sharp';

export const runtime = 'nodejs';
export const maxDuration = 120; // 120秒超时（inpainting 可能需要更长时间）

interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface CleanBackgroundRequest {
  imageUrl: string;
  textBoxes: BoundingBox[];
  imageSize: { width: number; height: number };
}

interface CleanBackgroundResponse {
  success: boolean;
  imageUrl: string;
  error?: string;
}

/**
 * 背景清理 API - 使用 inpainting 移除文本/图形区域
 *
 * 使用 fal.ai 的 inpaint API (fal-ai/inpaint)
 * - 价格: ~$0.02/张图（1 megapixel）
 * - 基于 Stable Diffusion，效果稳定
 * - 支持 data URL 和 HTTP URL 输入
 *
 * 用于生成干净的 PPT 背景图（移除文字后填充背景）
 */
export async function POST(request: NextRequest): Promise<NextResponse<CleanBackgroundResponse>> {
  console.log('[CLEAN-BG] ========== 开始处理背景清理请求 ==========');

  // 先解析请求体，保存以便后续使用
  let requestBody: CleanBackgroundRequest;
  try {
    requestBody = await request.json() as CleanBackgroundRequest;
    console.log('[CLEAN-BG] 请求体解析成功');
  } catch (parseError) {
    console.error('[CLEAN-BG] ❌ 请求体解析失败:', parseError);
    return NextResponse.json(
      {
        success: false,
        imageUrl: '',
        error: '请求体解析失败',
      },
      { status: 400 }
    );
  }

  const { imageUrl, textBoxes, imageSize } = requestBody;

  console.log('[CLEAN-BG] 输入参数:', {
    imageUrlLength: imageUrl?.length || 0,
    imageUrlPreview: imageUrl?.substring(0, 80),
    textBoxesCount: textBoxes?.length || 0,
    imageSize,
  });

  try {
    if (!imageUrl) {
      console.error('[CLEAN-BG] ❌ 未提供图片 URL');
      return NextResponse.json(
        {
          success: false,
          imageUrl: '',
          error: '未提供图片 URL',
        },
        { status: 400 }
      );
    }

    // 如果没有文本框，直接返回原图
    if (!textBoxes || textBoxes.length === 0) {
      console.log('[CLEAN-BG] ⚠️ 没有文本框需要清理，返回原图');
      return NextResponse.json({
        success: true,
        imageUrl: imageUrl,
      });
    }

    // 检查 FAL API Key
    const falKey = process.env.FAL_KEY;
    if (!falKey) {
      console.error('[CLEAN-BG] ❌ FAL_KEY 未配置');
      return NextResponse.json(
        {
          success: false,
          imageUrl: imageUrl,
          error: 'FAL_KEY 未配置，使用原图',
        },
        { status: 500 }
      );
    }

    // 配置 fal.ai
    fal.config({
      credentials: falKey,
    });

    console.log(`[CLEAN-BG] ✅ 开始清理背景，需要移除 ${textBoxes.length} 个区域...`);
    console.log(`[CLEAN-BG] 图片尺寸: ${imageSize.width}x${imageSize.height}`);
    console.log(`[CLEAN-BG] 区域详情:`, textBoxes.slice(0, 3).map((box, i) => ({
      index: i,
      x: Math.round(box.x),
      y: Math.round(box.y),
      width: Math.round(box.width),
      height: Math.round(box.height),
    })));

    // 生成 PNG 格式的 mask 图像（黑色背景，白色表示要移除的区域）
    console.log('[CLEAN-BG] 正在生成 PNG mask...');
    const maskDataUrl = await generatePngMask(textBoxes, imageSize);
    console.log('[CLEAN-BG] ✅ PNG Mask 生成完成');
    console.log('[CLEAN-BG] Mask 数据 URL 长度:', maskDataUrl.length);

    // 使用 fal.ai inpaint API
    // 文档: https://fal.ai/models/fal-ai/inpaint/api
    // 价格: ~$0.02/megapixel
    console.log('[CLEAN-BG] 正在调用 fal.ai inpaint API...');

    const startTime = Date.now();

    const result = await fal.subscribe('fal-ai/inpaint', {
      input: {
        image_url: imageUrl,
        mask_url: maskDataUrl,
        // 使用描述性 prompt，让模型填充与背景一致的内容
        // 注意：fal-ai/inpaint 模型会根据 mask 和周围像素进行填充
        prompt: 'clean background, seamless fill, consistent lighting, natural texture continuation',
        // 使用较高的推理步数确保质量
        num_inference_steps: 30,
        // 引导强度 - 控制模型遵循 prompt 的程度
        guidance_scale: 7.5,
      },
      logs: true,
      onQueueUpdate: (update) => {
        if (update.status === 'IN_PROGRESS' && update.logs) {
          update.logs.forEach((log) => console.log(`[CLEAN-BG] fal.ai: ${log.message}`));
        }
      },
    }) as any;

    const duration = Date.now() - startTime;
    console.log(`[CLEAN-BG] ✅ fal.ai 调用完成，耗时: ${duration}ms`);
    console.log('[CLEAN-BG] 输出结果:', JSON.stringify(result, null, 2).substring(0, 500));

    // fal.ai inpaint 返回格式: { images: [{ url: "..." }] }
    let resultUrl: string;
    if (result?.images && Array.isArray(result.images) && result.images.length > 0) {
      resultUrl = result.images[0].url;
      console.log('[CLEAN-BG] 输出格式: images 数组');
    } else if (result?.image?.url) {
      resultUrl = result.image.url;
      console.log('[CLEAN-BG] 输出格式: image 对象');
    } else if (typeof result === 'string') {
      resultUrl = result;
      console.log('[CLEAN-BG] 输出格式: 字符串');
    } else {
      console.error('[CLEAN-BG] ❌ 意外的输出格式:', JSON.stringify(result));
      throw new Error('fal.ai 返回了意外的输出格式');
    }

    console.log('[CLEAN-BG] ✅ 成功！');
    console.log('[CLEAN-BG] 结果 URL:', resultUrl);
    console.log('[CLEAN-BG] ========== 背景清理请求处理完成 ==========');

    return NextResponse.json({
      success: true,
      imageUrl: resultUrl,
    });
  } catch (error) {
    console.error('[CLEAN-BG] ❌ 错误:', error);
    console.error('[CLEAN-BG] 错误类型:', error instanceof Error ? error.constructor.name : typeof error);
    console.error('[CLEAN-BG] 错误消息:', error instanceof Error ? error.message : String(error));
    console.error('[CLEAN-BG] 错误堆栈:', error instanceof Error ? error.stack : '无堆栈');

    // 优雅降级：失败时返回原图，但明确标记失败
    return NextResponse.json({
      success: false,
      imageUrl: requestBody.imageUrl || '',
      error: error instanceof Error ? error.message : '背景清理失败，使用原图',
    });
  }
}

/**
 * 生成 PNG 格式的 mask 图像
 * 使用 sharp 将 SVG 转换为 PNG
 * 白色 = 移除/重绘区域，黑色 = 保留区域
 */
async function generatePngMask(
  textBoxes: BoundingBox[],
  imageSize: { width: number; height: number }
): Promise<string> {
  // 为每个区域添加边距（15%）以确保完全覆盖内容及其阴影
  const paddingPercent = 0.15;

  // 确保尺寸为正整数
  const width = Math.max(1, Math.round(imageSize.width));
  const height = Math.max(1, Math.round(imageSize.height));

  // 创建 SVG mask（黑色背景，白色表示要移除的区域）
  const svgMask = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="black"/>
      ${textBoxes.map(box => {
        // 添加边距
        const paddingX = box.width * paddingPercent;
        const paddingY = box.height * paddingPercent;
        const x = Math.max(0, Math.round(box.x - paddingX / 2));
        const y = Math.max(0, Math.round(box.y - paddingY / 2));
        const w = Math.min(width - x, Math.round(box.width + paddingX));
        const h = Math.min(height - y, Math.round(box.height + paddingY));
        // 使用圆角矩形，减少锐利边缘
        return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="white" rx="8" ry="8"/>`;
      }).join('\n      ')}
    </svg>
  `.trim();

  console.log('[CLEAN-BG] SVG Mask 内容预览:', svgMask.substring(0, 200) + '...');

  // 使用 sharp 将 SVG 转换为 PNG
  const pngBuffer = await sharp(Buffer.from(svgMask))
    .png()
    .toBuffer();

  console.log('[CLEAN-BG] PNG 转换完成，大小:', pngBuffer.length, 'bytes');

  // 返回 PNG 格式的 data URL
  return `data:image/png;base64,${pngBuffer.toString('base64')}`;
}

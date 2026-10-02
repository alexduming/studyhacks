import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';

export const runtime = 'nodejs';
export const maxDuration = 30;

interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface InpaintRequest {
  imageUrl: string;
  textBoxes: BoundingBox[];
  imageSize: { width: number; height: number };
}

interface InpaintResponse {
  success: boolean;
  imageUrl: string;
  error?: string;
  duration?: number;
}

/**
 * 纯 Node.js/Sharp 实现的背景文字擦除 API
 *
 * 原理：
 * 1. 对原图应用高斯模糊
 * 2. 创建文字区域的 mask
 * 3. 将模糊区域合成到原图的文字位置
 *
 * 优势：
 * - 纯 Node.js，无需外部 API
 * - 在 Vercel 上完全可用
 * - 速度快（< 1秒）
 * - 零成本
 *
 * 适用场景：
 * - PPT 背景文字擦除（因为文字框会覆盖在上层）
 * - 简单背景的文字移除
 */
export async function POST(request: NextRequest): Promise<NextResponse<InpaintResponse>> {
  console.log('[INPAINT-BLUR] ========== 开始 Sharp 背景清理 ==========');
  const startTime = Date.now();

  let requestBody: InpaintRequest;
  try {
    requestBody = await request.json() as InpaintRequest;
  } catch (parseError) {
    console.error('[INPAINT-BLUR] ❌ 请求体解析失败:', parseError);
    return NextResponse.json({
      success: false,
      imageUrl: '',
      error: '请求体解析失败',
    }, { status: 400 });
  }

  const { imageUrl, textBoxes, imageSize } = requestBody;

  console.log('[INPAINT-BLUR] 输入参数:', {
    imageUrlLength: imageUrl?.length || 0,
    imageUrlPreview: imageUrl?.substring(0, 80),
    textBoxesCount: textBoxes?.length || 0,
    imageSize,
  });

  try {
    if (!imageUrl) {
      return NextResponse.json({
        success: false,
        imageUrl: '',
        error: '未提供图片 URL',
      }, { status: 400 });
    }

    // 如果没有文本框，直接返回原图
    if (!textBoxes || textBoxes.length === 0) {
      console.log('[INPAINT-BLUR] ⚠️ 没有文本框，返回原图');
      return NextResponse.json({
        success: true,
        imageUrl: imageUrl,
        duration: Date.now() - startTime,
      });
    }

    console.log(`[INPAINT-BLUR] ✅ 开始处理 ${textBoxes.length} 个文本区域...`);

    // 1. 下载原图
    let imageBuffer: Buffer;
    if (imageUrl.startsWith('data:')) {
      const base64Data = imageUrl.split(',')[1];
      imageBuffer = Buffer.from(base64Data, 'base64');
    } else {
      const response = await fetch(imageUrl);
      if (!response.ok) {
        throw new Error(`下载图片失败: HTTP ${response.status}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      imageBuffer = Buffer.from(arrayBuffer);
    }

    console.log('[INPAINT-BLUR] ✅ 图片下载完成，大小:', imageBuffer.length, 'bytes');

    // 2. 获取图片元数据
    const metadata = await sharp(imageBuffer).metadata();
    const width = metadata.width || imageSize.width;
    const height = metadata.height || imageSize.height;
    console.log(`[INPAINT-BLUR] 图片尺寸: ${width}x${height}`);

    // 3. 创建模糊版本（用于填充文字区域）
    // 使用较大的 sigma 值产生更强的模糊效果
    const blurredBuffer = await sharp(imageBuffer)
      .blur(30) // sigma = 30，产生明显模糊
      .toBuffer();

    console.log('[INPAINT-BLUR] ✅ 模糊版本生成完成');

    // 4. 为每个文字区域创建 mask 并合成
    // 边距扩展 20%
    const paddingPercent = 0.20;

    // 创建合成层数组
    const composites: sharp.OverlayOptions[] = [];

    for (let i = 0; i < textBoxes.length; i++) {
      const box = textBoxes[i];

      // 计算带边距的区域
      const paddingX = Math.round(box.width * paddingPercent);
      const paddingY = Math.round(box.height * paddingPercent);

      const left = Math.max(0, Math.round(box.x - paddingX / 2));
      const top = Math.max(0, Math.round(box.y - paddingY / 2));
      const boxWidth = Math.min(width - left, Math.round(box.width + paddingX));
      const boxHeight = Math.min(height - top, Math.round(box.height + paddingY));

      if (boxWidth <= 0 || boxHeight <= 0) continue;

      try {
        // 从模糊图中提取对应区域
        const blurredRegion = await sharp(blurredBuffer)
          .extract({ left, top, width: boxWidth, height: boxHeight })
          .toBuffer();

        // 创建渐变 mask（边缘羽化）
        // 使用 SVG 创建带羽化效果的 mask
        const featherSize = Math.min(20, Math.min(boxWidth, boxHeight) / 4);
        const maskSvg = `
          <svg width="${boxWidth}" height="${boxHeight}" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="fadeLeft" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" style="stop-color:black;stop-opacity:1" />
                <stop offset="${(featherSize / boxWidth) * 100}%" style="stop-color:white;stop-opacity:1" />
                <stop offset="${100 - (featherSize / boxWidth) * 100}%" style="stop-color:white;stop-opacity:1" />
                <stop offset="100%" style="stop-color:black;stop-opacity:1" />
              </linearGradient>
              <linearGradient id="fadeTop" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" style="stop-color:black;stop-opacity:1" />
                <stop offset="${(featherSize / boxHeight) * 100}%" style="stop-color:white;stop-opacity:1" />
                <stop offset="${100 - (featherSize / boxHeight) * 100}%" style="stop-color:white;stop-opacity:1" />
                <stop offset="100%" style="stop-color:black;stop-opacity:1" />
              </linearGradient>
              <mask id="fadeMask">
                <rect width="100%" height="100%" fill="url(#fadeLeft)"/>
                <rect width="100%" height="100%" fill="url(#fadeTop)" style="mix-blend-mode:multiply"/>
              </mask>
            </defs>
            <rect width="100%" height="100%" fill="white" mask="url(#fadeMask)"/>
          </svg>
        `.trim();

        const maskBuffer = await sharp(Buffer.from(maskSvg))
          .resize(boxWidth, boxHeight)
          .grayscale()
          .toBuffer();

        // 将 mask 应用到模糊区域（作为 alpha 通道）
        const blurredWithAlpha = await sharp(blurredRegion)
          .ensureAlpha()
          .joinChannel(maskBuffer)
          .toBuffer();

        composites.push({
          input: blurredWithAlpha,
          left,
          top,
          blend: 'over' as const,
        });
      } catch (regionError) {
        console.warn(`[INPAINT-BLUR] 区域 ${i} 处理失败:`, regionError);
      }
    }

    console.log(`[INPAINT-BLUR] ✅ 准备合成 ${composites.length} 个区域`);

    // 5. 合成所有模糊区域到原图
    let resultBuffer: Buffer;
    if (composites.length > 0) {
      resultBuffer = await sharp(imageBuffer)
        .composite(composites)
        .png()
        .toBuffer();
    } else {
      resultBuffer = await sharp(imageBuffer).png().toBuffer();
    }

    console.log('[INPAINT-BLUR] ✅ 合成完成，结果大小:', resultBuffer.length, 'bytes');

    // 6. 转换为 data URL
    const resultDataUrl = `data:image/png;base64,${resultBuffer.toString('base64')}`;

    const duration = Date.now() - startTime;
    console.log(`[INPAINT-BLUR] ✅ 处理完成，耗时: ${duration}ms`);
    console.log('[INPAINT-BLUR] ========== 背景清理完成 ==========');

    return NextResponse.json({
      success: true,
      imageUrl: resultDataUrl,
      duration,
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('[INPAINT-BLUR] ❌ 错误:', error);
    console.error('[INPAINT-BLUR] 错误详情:', error instanceof Error ? error.message : String(error));

    // 优雅降级：返回原图
    return NextResponse.json({
      success: false,
      imageUrl: requestBody.imageUrl || '',
      error: error instanceof Error ? error.message : '背景清理失败',
      duration,
    });
  }
}

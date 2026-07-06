import { NextRequest, NextResponse } from 'next/server';
import { fal } from '@fal-ai/client';
import sharp from 'sharp';

export const runtime = 'nodejs';
export const maxDuration = 60;

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
 * 精确背景清理 API (基于 FAL LaMa)
 * 
 * 工作流程:
 * 1. 接收图片 URL 和 OCR 识别的文本框坐标
 * 2. 使用 sharp 生成 PNG 格式的 Mask 遮罩图
 * 3. 调用 FAL AI 的 LaMa 模型进行内容感知填充 (Inpainting)
 */
export async function POST(
  request: NextRequest
): Promise<NextResponse<InpaintResponse>> {
  const startTime = Date.now();
  console.log('[PRECISE-INPAINT] ========== 开始背景清理请求 ==========');

  let requestBody: InpaintRequest;
  try {
    requestBody = (await request.json()) as InpaintRequest;
  } catch (parseError) {
    return NextResponse.json({ success: false, imageUrl: '', error: '请求体解析失败' }, { status: 400 });
  }

  const { imageUrl, textBoxes, imageSize } = requestBody;

  try {
    if (!imageUrl) {
      return NextResponse.json({ success: false, imageUrl: '', error: '未提供图片 URL' }, { status: 400 });
    }

    if (!textBoxes || textBoxes.length === 0) {
      return NextResponse.json({ success: true, imageUrl: imageUrl });
    }

    const falKey = process.env.FAL_KEY;
    if (!falKey) {
      return NextResponse.json({ success: false, imageUrl: imageUrl, error: 'FAL_KEY 未配置' }, { status: 500 });
    }

    fal.config({ credentials: falKey });

    // 1. 生成 PNG Mask (白色是要重绘的部分，黑色是保留部分)
    console.log('[PRECISE-INPAINT] 正在生成遮罩图...');
    const maskDataUrl = await generatePngMask(textBoxes, imageSize);

    // 2. 调用 FAL LaMa 端点 (添加重试逻辑)
    console.log('[PRECISE-INPAINT] 正在调用 FAL LaMa...');
    
    let result: any;
    let retries = 2;
    while (retries > 0) {
      try {
        result = await fal.subscribe('fal-ai/lama', {
          input: {
            image_url: imageUrl,
            mask_image_url: maskDataUrl,
          },
        });
        break; // 成功则跳出
      } catch (err: any) {
        retries--;
        const isNetworkError = err.message?.includes('fetch failed') || err.code === 'ECONNRESET';
        if (retries > 0 && isNetworkError) {
          console.warn(`[PRECISE-INPAINT] 网络抖动，正在重试... (剩余次数: ${retries})`);
          await new Promise(r => setTimeout(r, 1000));
          continue;
        }
        throw err;
      }
    }

    const duration = Date.now() - startTime;
    console.log(`[PRECISE-INPAINT] ✅ 处理完成，耗时: ${duration}ms`);

    // 解析返回 URL
    let resultUrl: string = '';
    if (result?.image?.url) {
      resultUrl = result.image.url;
    } else if (result?.url) {
      resultUrl = result.url;
    } else {
      // 深度搜索 URL
      const findUrl = (obj: any): string | null => {
        if (!obj) return null;
        for (const key in obj) {
          if (typeof obj[key] === 'string' && obj[key].startsWith('http')) return obj[key];
          if (typeof obj[key] === 'object' && obj[key] !== null) {
            const nested = findUrl(obj[key]);
            if (nested) return nested;
          }
        }
        return null;
      };
      resultUrl = findUrl(result) || '';
    }

    if (!resultUrl) throw new Error('API 返回成功但未找到图片 URL');

    return NextResponse.json({
      success: true,
      imageUrl: resultUrl,
      duration,
    });
  } catch (error) {
    console.error('[PRECISE-INPAINT] ❌ 错误:', error);
    return NextResponse.json({
      success: false,
      imageUrl: requestBody.imageUrl || '',
      error: error instanceof Error ? error.message : '背景清理失败',
      duration: Date.now() - startTime,
    });
  }
}

/**
 * 辅助函数：根据 Bbox 生成 PNG Mask
 */
async function generatePngMask(
  textBoxes: BoundingBox[],
  imageSize: { width: number; height: number }
): Promise<string> {
  const paddingPercent = 0.20; // 20% 边距，确保文字阴影也被清理
  const width = Math.max(1, Math.round(imageSize.width));
  const height = Math.max(1, Math.round(imageSize.height));

  const svgMask = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="black"/>
      ${textBoxes
        .map((box) => {
          const paddingX = box.width * paddingPercent;
          const paddingY = box.height * paddingPercent;
          const x = Math.max(0, Math.round(box.x - paddingX / 2));
          const y = Math.max(0, Math.round(box.y - paddingY / 2));
          const w = Math.min(width - x, Math.round(box.width + paddingX));
          const h = Math.min(height - y, Math.round(box.height + paddingY));
          return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="white" rx="4" ry="4"/>`;
        })
        .join('\n      ')}
    </svg>
  `.trim();

  const pngBuffer = await sharp(Buffer.from(svgMask)).png().toBuffer();
  return `data:image/png;base64,${pngBuffer.toString('base64')}`;
}

import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 30;

interface CropRequest {
  imageUrl: string;
  bbox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  imageSize: {
    width: number;
    height: number;
  };
}

interface CropResponse {
  success: boolean;
  croppedImageUrl: string;
  error?: string;
}

/**
 * 图形裁剪 API - 从原图中裁剪指定区域
 * 用于提取图标、图形等元素作为独立图层
 */
export async function POST(request: NextRequest): Promise<NextResponse<CropResponse>> {
  try {
    const { imageUrl, bbox, imageSize } = await request.json() as CropRequest;

    if (!imageUrl) {
      return NextResponse.json(
        {
          success: false,
          croppedImageUrl: '',
          error: '未提供图片 URL',
        },
        { status: 400 }
      );
    }

    if (!bbox || typeof bbox.x !== 'number') {
      return NextResponse.json(
        {
          success: false,
          croppedImageUrl: '',
          error: '未提供有效的裁剪区域',
        },
        { status: 400 }
      );
    }

    console.log(`[CROP-IMAGE] 裁剪区域: x=${bbox.x}, y=${bbox.y}, w=${bbox.width}, h=${bbox.height}`);

    // 使用 Canvas API 进行裁剪（在客户端执行更高效）
    // 这里我们返回裁剪参数，让客户端执行实际裁剪
    // 或者使用 sharp 库进行服务端裁剪

    // 尝试使用 sharp 进行裁剪（如果可用）
    try {
      const sharp = (await import('sharp')).default;

      // 获取原图
      let imageBuffer: Buffer;
      if (imageUrl.startsWith('data:')) {
        // Base64 数据
        const base64Data = imageUrl.split(',')[1];
        imageBuffer = Buffer.from(base64Data, 'base64');
      } else {
        // URL
        const response = await fetch(imageUrl);
        const arrayBuffer = await response.arrayBuffer();
        imageBuffer = Buffer.from(arrayBuffer);
      }

      // 裁剪图片
      const croppedBuffer = await sharp(imageBuffer)
        .extract({
          left: Math.max(0, Math.round(bbox.x)),
          top: Math.max(0, Math.round(bbox.y)),
          width: Math.round(bbox.width),
          height: Math.round(bbox.height),
        })
        .png()
        .toBuffer();

      // 转换为 base64
      const base64 = croppedBuffer.toString('base64');
      const croppedImageUrl = `data:image/png;base64,${base64}`;

      console.log(`[CROP-IMAGE] 裁剪成功，输出大小: ${croppedBuffer.length} bytes`);

      return NextResponse.json({
        success: true,
        croppedImageUrl,
      });
    } catch (sharpError) {
      console.warn('[CROP-IMAGE] sharp 不可用，返回裁剪参数供客户端处理:', sharpError);

      // 如果 sharp 不可用，返回裁剪参数
      return NextResponse.json({
        success: false,
        croppedImageUrl: '',
        error: '服务端裁剪不可用，请在客户端处理',
      });
    }
  } catch (error) {
    console.error('[CROP-IMAGE] 错误:', error);

    return NextResponse.json(
      {
        success: false,
        croppedImageUrl: '',
        error: error instanceof Error ? error.message : '裁剪失败',
      },
      { status: 500 }
    );
  }
}

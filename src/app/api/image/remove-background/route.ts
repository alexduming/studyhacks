import { NextRequest, NextResponse } from 'next/server';
import Replicate from 'replicate';

export const runtime = 'nodejs';
export const maxDuration = 60; // 60秒超时

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN!,
});

interface BackgroundRemovalResponse {
  success: boolean;
  imageUrl: string;
  error?: string;
}

/**
 * 背景移除 API - 使用 Replicate RMBG 模型
 * 成本：~$0.001/图片
 */
export async function POST(request: NextRequest): Promise<NextResponse<BackgroundRemovalResponse>> {
  try {
    const { imageUrl } = await request.json();

    if (!imageUrl) {
      return NextResponse.json(
        {
          success: false,
          imageUrl: '',
          error: '未提供图片 URL',
        },
        { status: 400 }
      );
    }

    if (!process.env.REPLICATE_API_TOKEN) {
      console.error('[BG-REMOVAL] Replicate API Token 未配置');
      return NextResponse.json(
        {
          success: false,
          imageUrl: imageUrl,
          error: 'Replicate API Token 未配置，使用原图',
        },
        { status: 500 }
      );
    }

    console.log('[BG-REMOVAL] 开始使用 Replicate RMBG 移除背景...');
    console.log('[BG-REMOVAL] 图片 URL:', imageUrl);

    // 使用 Replicate RMBG 模型
    // 模型: cjwbw/rembg (成本约 $0.001/图片)
    const output = await replicate.run(
      'cjwbw/rembg:fb8af171cfa1616ddcf1242c093f9c46bcada5ad4cf6f2fbe8b81b330ec5c003',
      {
        input: {
          image: imageUrl,
        },
      }
    );

    console.log('[BG-REMOVAL] 背景移除成功');
    console.log('[BG-REMOVAL] 输出类型:', typeof output);

    // Replicate 返回的可能是 URL 字符串或 URL 数组
    let resultUrl: string;
    if (typeof output === 'string') {
      resultUrl = output;
    } else if (Array.isArray(output) && output.length > 0) {
      resultUrl = output[0];
    } else {
      throw new Error('Replicate 返回了意外的输出格式');
    }

    return NextResponse.json({
      success: true,
      imageUrl: resultUrl,
    });
  } catch (error) {
    console.error('[BG-REMOVAL] 错误:', error);

    // 优雅降级：失败时返回原图
    const { imageUrl } = await request.json();
    return NextResponse.json({
      success: false,
      imageUrl: imageUrl || '',
      error: error instanceof Error ? error.message : '背景移除失败，使用原图',
    });
  }
}

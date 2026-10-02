import { NextResponse } from 'next/server';
import OpenRouterService from '@/shared/services/openrouter';

export const maxDuration = 60; // OCR 可能较慢

export async function POST(request: Request) {
  try {
    const { image } = await request.json();

    if (!image) {
      return NextResponse.json(
        { success: false, error: 'Image data is required' },
        { status: 400 }
      );
    }

    const aiService = OpenRouterService.getInstance();
    // 假设 image 是 base64 字符串或 URL
    // 如果是 base64，确保格式正确（带 data:image/png;base64,... 前缀）
    const text = await aiService.ocrImage(image);

    return NextResponse.json({
      success: true,
      text: text,
    });
  } catch (error: any) {
    console.error('OCR API Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to perform OCR',
      },
      { status: 500 }
    );
  }
}


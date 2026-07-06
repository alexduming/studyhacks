import { NextResponse } from 'next/server';
import { envConfigs } from '@/config';
import { ListenHubProvider } from '@/extensions/ai';

export const dynamic = 'force-dynamic';

/**
 * 获取音色列表接口
 * GET /api/ai/podcast/speakers?language=zh
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const language = searchParams.get('language') || 'zh';

    // 检查 ListenHub 是否已启用
    if (envConfigs.listenhub_enabled !== 'true') {
      return NextResponse.json(
        {
          success: false,
          error: 'Podcast feature is not enabled',
          notEnabled: true,
        },
        { status: 503 }
      );
    }

    // 检查 API Key 是否已配置
    if (!envConfigs.listenhub_api_key) {
      return NextResponse.json(
        {
          success: false,
          error: 'ListenHub API key is not configured',
          notConfigured: true,
        },
        { status: 503 }
      );
    }

    // 初始化 ListenHub Provider
    const listenHubProvider = new ListenHubProvider({
      apiKey: envConfigs.listenhub_api_key,
      baseUrl: envConfigs.listenhub_base_url,
    });

    // 获取音色列表
    const speakers = await listenHubProvider.getSpeakers(language);

    return NextResponse.json({
      success: true,
      speakers,
    });
  } catch (error: any) {
    console.error('API /api/ai/podcast/speakers error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to fetch speakers',
        speakers: [],
      },
      { status: 500 }
    );
  }
}


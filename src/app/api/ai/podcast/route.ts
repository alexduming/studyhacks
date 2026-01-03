import { NextResponse } from 'next/server';

import { getUserInfo } from '@/shared/models/user';
import { consumeCredits, getRemainingCredits } from '@/shared/models/credit';
import { envConfigs } from '@/config';
import { ListenHubProvider, PodcastGenerateOptions, AIMediaType } from '@/extensions/ai';

/**
 * 非程序员解释：
 * - 这个接口负责调用 ListenHub API 生成播客
 * - 支持三种模式：速听(quick)、深度(deep)、辩论(debate)
 * - 支持多种语言和音色选择
 * - 支持文本、文件URL、网页链接三种输入方式
 * - ListenHub API Key 只在服务器端读取，前端永远看不到
 */

// Vercel 配置：设置最大执行时间为 60 秒（需要 Pro 计划）
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/**
 * 生成播客接口
 * POST /api/ai/podcast
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();

    /**
     * 期望的入参结构：
     * {
     *   mode: 'quick' | 'deep' | 'debate';        // 播客模式
     *   language?: string;                         // 语言（默认 'auto' 自动检测）
     *   voices?: {                                 // 音色配置
     *     speaker_1: string;                       // 第一个说话者
     *     speaker_2?: string;                      // 第二个说话者（可选，用于双人播客）
     *   };
     *   content?: string;                          // 文本内容
     *   file_url?: string;                         // 文件URL
     *   link?: string;                             // 网页链接
     * }
     */
    const { mode, language, voices, content, file_url, link } = body || {};

    // 验证必填参数
    if (!mode || !['quick', 'deep', 'debate'].includes(mode)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid mode. Must be one of: quick, deep, debate',
        },
        { status: 400 }
      );
    }

    // 验证至少提供一种内容来源
    if (!content && !file_url && !link) {
      return NextResponse.json(
        {
          success: false,
          error: 'Must provide at least one of: content, file_url, or link',
        },
        { status: 400 }
      );
    }

    // 检查 ListenHub 是否已启用
    if (envConfigs.listenhub_enabled !== 'true') {
      return NextResponse.json(
        {
          success: false,
          error: 'Podcast feature is not enabled. Please contact administrator.',
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
          error: 'ListenHub API key is not configured. Please add LISTENHUB_API_KEY to .env.local',
          notConfigured: true,
        },
        { status: 503 }
      );
    }

    // 用户认证和积分验证
    const user = await getUserInfo();
    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: 'Please sign in to use podcast features',
        },
        { status: 401 }
      );
    }

    // 根据模式设置积分消耗
    // quick: 5积分, deep: 8积分, debate: 10积分
    const creditCosts = {
      quick: 5,
      deep: 8,
      debate: 10,
    };
    const requiredCredits = creditCosts[mode as keyof typeof creditCosts] || 8;

    const remainingCredits = await getRemainingCredits(user.id);
    if (remainingCredits < requiredCredits) {
      return NextResponse.json(
        {
          success: false,
          error: `Insufficient credits. Required: ${requiredCredits}, Available: ${remainingCredits}`,
          insufficientCredits: true,
          requiredCredits,
          remainingCredits,
        },
        { status: 402 }
      );
    }

    // 消耗积分
    try {
      await consumeCredits({
        userId: user.id,
        credits: requiredCredits,
        scene: 'ai_podcast',
        description: `AI Podcast - ${mode} mode`,
        metadata: JSON.stringify({ mode, language, hasContent: !!content, hasFileUrl: !!file_url, hasLink: !!link }),
      });
    } catch (creditError: any) {
      console.error('Failed to consume credits:', creditError);
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to consume credits. Please try again.',
        },
        { status: 500 }
      );
    }

    // 初始化 ListenHub Provider
    const listenHubProvider = new ListenHubProvider({
      apiKey: envConfigs.listenhub_api_key,
      baseUrl: envConfigs.listenhub_base_url,
    });

    // 准备说话者数组（根据 ListenHub 官方 API 格式）
    const speakers = [];
    if (voices?.speaker_1) {
      speakers.push({ speakerId: voices.speaker_1 });
    }
    if (voices?.speaker_2) {
      speakers.push({ speakerId: voices.speaker_2 });
    }

    // 如果没有选择音色，使用默认音色
    if (speakers.length === 0) {
      speakers.push({ speakerId: 'CN-Man-Beijing-V2' }); // 默认中文男声
    }

    // 准备查询内容（合并 content, link, file_url 为 query）
    let query = '';
    if (content) {
      query = content;
    } else if (link) {
      query = link;
    } else if (file_url) {
      query = file_url;
    }

    // 准备生成参数（严格按照官方 API 格式）
    const generateOptions: PodcastGenerateOptions = {
      mode,
      language: language || 'zh',
      speakers,
      query,
    };

    // 调用 ListenHub API 生成播客
    console.log('🎙️ 开始生成播客:', {
      mode,
      language: language || 'auto',
      userId: user.id,
      hasVoices: !!voices,
    });

    const result = await listenHubProvider.generate({
      params: {
        mediaType: AIMediaType.SPEECH,
        prompt: content || link || file_url || '',
        options: generateOptions,
      },
    });

    // 返回任务结果
    return NextResponse.json({
      success: result.taskStatus !== 'failed',
      taskId: result.taskId,
      taskStatus: result.taskStatus,
      episodeId: result.taskId, // episode_id 即为 taskId
      taskInfo: result.taskInfo,
      creditsUsed: requiredCredits,
      remainingCredits: remainingCredits - requiredCredits,
    });

  } catch (error: any) {
    console.error('API /api/ai/podcast error:', error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to generate podcast. Please try again later.',
      },
      { status: 500 }
    );
  }
}

/**
 * 查询播客生成状态接口
 * GET /api/ai/podcast?episodeId=xxx
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const episodeId = searchParams.get('episodeId');

    if (!episodeId) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing episodeId parameter',
        },
        { status: 400 }
      );
    }

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

    // 用户认证
    const user = await getUserInfo();
    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: 'Please sign in to query podcast status',
        },
        { status: 401 }
      );
    }

    // 初始化 ListenHub Provider
    const listenHubProvider = new ListenHubProvider({
      apiKey: envConfigs.listenhub_api_key,
      baseUrl: envConfigs.listenhub_base_url,
    });

    // 查询任务状态
    console.log('🔍 查询播客状态:', { episodeId, userId: user.id });

    const result = await listenHubProvider.query({ taskId: episodeId });

    // 详细日志
    console.log('📊 查询结果:', {
      taskStatus: result.taskStatus,
      hasAudioUrl: !!result.taskResult?.audioUrl,
      errorMessage: result.taskInfo?.errorMessage,
    });

    // 返回查询结果
    return NextResponse.json({
      success: result.taskStatus === 'success',
      taskId: episodeId,
      taskStatus: result.taskStatus,
      taskInfo: result.taskInfo,
      taskResult: result.taskResult,
    });

  } catch (error: any) {
    console.error('API /api/ai/podcast GET error:', error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to query podcast status. Please try again later.',
      },
      { status: 500 }
    );
  }
}

import { NextResponse } from 'next/server';

import { AIMediaType, AITaskStatus } from '@/extensions/ai';
import { createAITaskRecordOnly } from '@/shared/models/ai_task';
import OpenRouterService from '@/shared/services/openrouter';
import { getUserInfo } from '@/shared/models/user';
import { consumeCredits, getRemainingCredits } from '@/shared/models/credit';

/**
 * 非程序员解释：
 * - 这个接口负责根据一段学习内容，调用 OpenRouter 生成一组「闪卡」。
 * - 前端只需要把文字内容发到 /api/ai/flashcards，就能拿到 JSON 结构化的卡片列表。
 * - 真正的 OPENROUTER_API_KEY 仍然只存在于服务器，不会暴露给浏览器。
 */

// Vercel 配置：设置最大执行时间为 60 秒（需要 Pro 计划）
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();

    /**
     * 期望的入参结构：
     * {
     *   content: string;            // 用于生成闪卡的文本
     *   count?: number;            // 希望生成多少张卡片，默认 10
     *   outputLanguage?: string;   // 'auto' | 'zh' | 'en' | 其他语言编码
     * }
     */
    const { content, count, outputLanguage } = body || {};

    if (!content || typeof content !== 'string') {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing or invalid content field',
          flashcards: [],
        },
        { status: 400 }
      );
    }

    // 积分验证和消耗
    const user = await getUserInfo();
    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: 'Please sign in to use AI features',
          flashcards: [],
        },
        { status: 401 }
      );
    }

    const remainingCredits = await getRemainingCredits(user.id);
    const requiredCredits = 3;

    if (remainingCredits < requiredCredits) {
      return NextResponse.json(
        {
          success: false,
          error: `Insufficient credits. Required: ${requiredCredits}, Available: ${remainingCredits}`,
          insufficientCredits: true,
          requiredCredits,
          remainingCredits,
          flashcards: [],
        },
        { status: 402 }
      );
    }

    // 消耗积分
    let consumedCredit;
    try {
      consumedCredit = await consumeCredits({
        userId: user.id,
        credits: requiredCredits,
        scene: 'ai_flashcards',
        description: `AI Flashcards - Generate ${count || 10} flashcards`,
        metadata: JSON.stringify({ count, outputLanguage }),
      });
    } catch (creditError: any) {
      console.error('Failed to consume credits:', creditError);
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to consume credits. Please try again.',
          flashcards: [],
        },
        { status: 500 }
      );
    }

    const aiService = OpenRouterService.getInstance();

    const result = await aiService.generateFlashcards(
      content,
      typeof count === 'number' ? count : 10,
      outputLanguage ?? 'auto'
    );

    if (result.success) {
      try {
        await createAITaskRecordOnly({
          userId: user.id,
          mediaType: AIMediaType.TEXT,
          provider: 'OpenRouter',
          model: 'openrouter',
          prompt: `AI Flashcards preview: ${content.slice(0, 120)}`,
          options: JSON.stringify({
            count: typeof count === 'number' ? count : 10,
            outputLanguage: outputLanguage ?? 'auto',
          }),
          scene: 'ai_flashcards',
          costCredits: requiredCredits,
          creditId: consumedCredit?.id,
          status: AITaskStatus.SUCCESS,
          taskInfo: JSON.stringify({ status: 'SUCCESS' }),
          taskResult: JSON.stringify({
            flashcards: result.flashcards,
            metadata: result.metadata,
          }),
        });
      } catch (logError) {
        console.error('[Flashcards] Failed to record history:', logError);
      }
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('API /api/ai/flashcards error:', error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to generate flashcards. Please try again later.',
        flashcards: [],
      },
      { status: 500 }
    );
  }
}



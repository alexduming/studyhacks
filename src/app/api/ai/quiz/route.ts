import { NextResponse } from 'next/server';

import OpenRouterService from '@/shared/services/openrouter';
import { getUserInfo } from '@/shared/models/user';
import { consumeCredits, getRemainingCredits } from '@/shared/models/credit';

/**
 * 非程序员解释：
 * - 这个接口负责把一段学习内容，转换成一组可以练习的「测验题」。
 * - 前端只需要把文本和题目数量发到 /api/ai/quiz，就能拿到 JSON 形式的问题列表。
 * - OpenRouter 的密钥仍然只在服务器端，通过 OPENROUTER_API_KEY 读取。
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
     *   content: string;        // 用于出题的原始内容
     *   questionCount?: number; // 希望生成多少道题，默认 5
     *   questionTypes?: string[]; // 题型选择，如 ['multiple-choice', 'true-false']
     * }
     */
    const { content, questionCount, questionTypes } = body || {};

    if (!content || typeof content !== 'string') {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing or invalid content field',
          questions: [],
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
          questions: [],
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
          questions: [],
        },
        { status: 402 }
      );
    }

    // 消耗积分
    try {
      await consumeCredits({
        userId: user.id,
        credits: requiredCredits,
        scene: 'ai_quiz',
        description: `AI Quiz - Generate ${questionCount || 5} questions`,
        metadata: JSON.stringify({ questionCount }),
      });
    } catch (creditError: any) {
      console.error('Failed to consume credits:', creditError);
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to consume credits. Please try again.',
          questions: [],
        },
        { status: 500 }
      );
    }

    const aiService = OpenRouterService.getInstance();

    const result = await aiService.generateQuiz(
      content,
      typeof questionCount === 'number' ? questionCount : 5,
      Array.isArray(questionTypes) ? questionTypes : undefined
    );

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('API /api/ai/quiz error:', error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to generate quiz. Please try again later.',
        questions: [],
      },
      { status: 500 }
    );
  }
}



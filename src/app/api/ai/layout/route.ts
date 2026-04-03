import { NextResponse } from 'next/server';

import { AIMediaType, AITaskStatus } from '@/extensions/ai';
import {
  normalizeAiLayoutTemplate,
  type AiLayoutTemplateId,
} from '@/shared/lib/ai-layout';
import { checkApiOrigin } from '@/shared/lib/security';
import { createAITaskRecordOnly } from '@/shared/models/ai_task';
import { consumeCredits, getRemainingCredits } from '@/shared/models/credit';
import { getUserInfo } from '@/shared/models/user';
import { DeepSeekService } from '@/shared/services/deepseek';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const securityCheck = checkApiOrigin(request);
  if (!securityCheck.valid && securityCheck.response) {
    return securityCheck.response;
  }

  try {
    const body = await request.json();
    const {
      content,
      type,
      fileName,
      outputLanguage,
      template,
    }: {
      content?: string;
      type?: string;
      fileName?: string;
      outputLanguage?: string;
      template?: AiLayoutTemplateId | string;
    } = body || {};

    if (!content || !type) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required fields: content or type',
        },
        { status: 400 }
      );
    }

    const user = await getUserInfo();
    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: 'Please sign in to use AI features',
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
        },
        { status: 402 }
      );
    }

    let consumedCredit;
    const normalizedTemplate = normalizeAiLayoutTemplate(template);

    try {
      consumedCredit = await consumeCredits({
        userId: user.id,
        credits: requiredCredits,
        scene: 'ai_layout',
        description: `AI Layout - Generate ${normalizedTemplate} layout from ${type}`,
        metadata: JSON.stringify({
          fileName,
          type,
          outputLanguage,
          template: normalizedTemplate,
        }),
      });
    } catch (creditError) {
      console.error('Failed to consume credits for ai_layout:', creditError);
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to consume credits. Please try again.',
        },
        { status: 500 }
      );
    }

    const aiService = DeepSeekService.getInstance();
    const result = await aiService.generateLayout({
      content,
      type: type as any,
      fileName: fileName || 'untitled.txt',
      outputLanguage,
      template: normalizedTemplate,
    });

    if (!result.success || !result.layout) {
      return NextResponse.json(result, { status: 500 });
    }

    try {
      await createAITaskRecordOnly({
        userId: user.id,
        mediaType: AIMediaType.TEXT,
        provider: 'DeepSeek',
        model: 'deepseek-chat',
        prompt: `AI Layout preview: ${content.slice(0, 120)}`,
        options: JSON.stringify({
          type,
          fileName,
          outputLanguage: outputLanguage ?? 'auto',
          template: normalizedTemplate,
        }),
        scene: 'ai_layout',
        costCredits: requiredCredits,
        creditId: consumedCredit?.id,
        status: AITaskStatus.SUCCESS,
        taskInfo: JSON.stringify({ status: 'SUCCESS' }),
        taskResult: JSON.stringify({
          layout: result.layout,
          metadata: result.metadata,
        }),
      });
    } catch (logError) {
      console.error('[AI Layout] Failed to record history:', logError);
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('API /api/ai/layout error:', error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to generate layout. Please try again later.',
      },
      { status: 500 }
    );
  }
}

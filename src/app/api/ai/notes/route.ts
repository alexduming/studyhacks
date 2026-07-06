import { NextResponse } from 'next/server';

import {
  countWords,
  extractSummary,
  extractTitle,
  renderMarkdownToHtml,
} from '@/shared/lib/note-format';
import { checkApiOrigin } from '@/shared/lib/security';
import { consumeCredits, getRemainingCredits } from '@/shared/models/credit';
import { createNoteDocument } from '@/shared/models/note-document';
import { getUserInfo } from '@/shared/models/user';
import { DeepSeekService } from '@/shared/services/deepseek';

/**
 * 非程序员解释：
 * - 这个接口是「后端专用的 AI 网关」，专门负责帮前端调用 OpenRouter 生成学习笔记。
 * - 前端页面不会直接拿着 API Key 去请求 OpenRouter，而是只请求我们自己的 /api/ai/notes。
 * - 好处：真正的 OPENROUTER_API_KEY 只存在服务器环境变量里，用户在浏览器里看不到。
 *
 * 安全设计要点（对应"精 / 准 / 净"）：
 * - 精：前端只知道一个简单的 HTTP 接口，复杂提示词和 OpenRouter 细节全部藏在服务端。
 * - 准：所有与 OpenRouter 相关的逻辑都集中在 OpenRouterService + 这条路由里，出错好排查。
 * - 净：不改动现有的 AI 页面业务逻辑结构，只是把"直接调 service"改成"调后端接口"。
 *
 * Vercel 配置：
 * - maxDuration: 60 秒（需要 Pro 计划，避免超时）
 * - dynamic: 强制动态渲染（不缓存 AI 生成的内容）
 */

// Vercel 配置：设置最大执行时间为 60 秒（需要 Pro 计划）
// 如果使用 Hobby 计划，此设置无效，最大 10 秒
export const maxDuration = 60;

// 强制动态渲染，不缓存 AI 生成的内容
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  // 🛡️ 安全检查：验证请求来源
  const securityCheck = checkApiOrigin(request);
  if (!securityCheck.valid && securityCheck.response) {
    return securityCheck.response;
  }

  try {
    const body = await request.json();

    /**
     * 期望的入参结构（前端会按照这个格式传）：
     * {
     *   content: string;       // 资料的文字内容（已经从文件中提取好）
     *   type: 'audio' | 'video' | 'pdf' | 'text';
     *   fileName?: string;     // 原始文件名，方便用于提示词
     *   outputLanguage?: string; // 目标语言，'auto' | 'zh' | 'en' | 其他语言编码
     * }
     */
    const { content, type, fileName, outputLanguage } = body || {};

    if (!content || !type) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required fields: content or type',
        },
        { status: 400 }
      );
    }

    /**
     * 积分验证和消耗逻辑
     *
     * 非程序员解释：
     * - 在生成笔记之前，先检查用户是否有足够的积分（需要3积分）
     * - 如果积分不足，返回错误提示，不执行AI生成
     * - 如果积分足够，先消耗积分，然后再调用AI生成
     * - 这样确保每次使用AI功能都会正确扣除积分
     */
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

    // 检查积分余额
    const remainingCredits = await getRemainingCredits(user.id);
    const requiredCredits = 3; // AI笔记生成需要3积分

    if (remainingCredits < requiredCredits) {
      return NextResponse.json(
        {
          success: false,
          error: `Insufficient credits. Required: ${requiredCredits}, Available: ${remainingCredits}`,
          insufficientCredits: true,
          requiredCredits,
          remainingCredits,
        },
        { status: 402 } // 402 Payment Required
      );
    }

    // 消耗积分
    try {
      await consumeCredits({
        userId: user.id,
        credits: requiredCredits,
        scene: 'ai_note_taker',
        description: `AI Note Taker - Generate notes from ${type}`,
        metadata: JSON.stringify({ fileName, type }),
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

    // 积分消耗成功，执行AI生成
    // 切换到 DeepSeek 官方 API
    const aiService = DeepSeekService.getInstance();

    const result = await aiService.generateNotes({
      content,
      type,
      fileName,
      outputLanguage,
    });

    if (!result.success || !result.notes) {
      return NextResponse.json(result, { status: 500 });
    }

    // --- 将 AI 结果持久化到 note_document，方便在 /library/notes 中继续编辑 ---
    const detectedTitle = extractTitle(result.notes, fileName || 'AI Note');
    const summary = extractSummary(result.notes);
    const html = renderMarkdownToHtml(result.notes);
    const words = result.metadata?.wordCount ?? countWords(result.notes || '');

    let noteRecord = null;
    let saveError = null;

    try {
      noteRecord = await createNoteDocument({
        userId: user.id,
        title: detectedTitle,
        markdown: result.notes,
        html,
        summary,
        language: outputLanguage === 'auto' ? null : outputLanguage,
        sourceType: type,
        sourceName: fileName || null,
        wordCount: words,
        status: 'draft',
      });
    } catch (dbError) {
      console.error('Failed to save note to database:', dbError);
      // 即使保存失败，也不阻断流程，确保用户能看到生成的笔记
      saveError = 'Failed to auto-save note';
    }

    return NextResponse.json({
      ...result,
      note: noteRecord,
      saveError,
    });
  } catch (error: any) {
    console.error('API /api/ai/notes error:', error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to generate notes. Please try again later.',
      },
      { status: 500 }
    );
  }
}

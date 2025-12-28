import { NextRequest, NextResponse } from 'next/server';

import {
  consumeCredits,
  getRemainingCredits,
  refundCredits,
} from '@/shared/models/credit';
import { getUserInfo } from '@/shared/models/user';

// 使用 Node.js 运行时，保证可以安全调用外部 API 并使用环境变量
export const runtime = 'nodejs';

/**
 * 非程序员解释：
 * - 这个接口负责「帮前端去找 nano-banana-pro 画信息图」
 * - 前端把「知识文本 + 宽高比等参数」POST 到这里
 * - 这里再把请求转发到 Kie 的 nano-banana-pro 接口（https://api.kie.ai/api/v1/jobs/createTask）
 * - 为了安全，真正的 API Key 只保存在服务器，不会暴露到浏览器里
 */

const KIE_BASE_URL = 'https://api.kie.ai/api/v1';

// 只从环境变量读取密钥，绝不在代码中硬编码真实 key
const KIE_API_KEY = process.env.KIE_NANO_BANANA_PRO_KEY || '';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      content,
      aspectRatio = '1:1', // 与前端页面和 generate-with-fallback API 保持一致
      resolution = '1K', // 与前端页面和 generate-with-fallback API 保持一致
      outputFormat = 'png',
    } = body || {};

    if (!content || typeof content !== 'string' || !content.trim()) {
      return NextResponse.json(
        { success: false, error: '缺少用于生成信息图的文本内容' },
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

    // 消耗积分
    try {
      await consumeCredits({
        userId: user.id,
        credits: requiredCredits,
        scene: 'ai_infographic',
        description: `AI Infographic - Generate infographic`,
        metadata: JSON.stringify({ aspectRatio, resolution, outputFormat }),
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

    if (!KIE_API_KEY) {
      console.error('❌ 环境变量 KIE_NANO_BANANA_PRO_KEY 未设置');
      console.error(
        '  - 请创建 .env.local 文件并添加: KIE_NANO_BANANA_PRO_KEY=你的密钥'
      );
      console.error('  - 参考 .env.local.example 文件');

      return NextResponse.json(
        {
          success: false,
          error:
            '服务器未配置 Kie API 密钥，请在环境变量 KIE_NANO_BANANA_PRO_KEY 中设置',
        },
        { status: 500 }
      );
    }

    // 默认提示词，按照你的要求拼接用户的内容
    const prompt = `Create an educational infographic explaining the provided file or text. You select some typical visual elements. Style: Flat vector.
IMPORTANT: The text labels inside the infographic MUST be in the SAME LANGUAGE as the provided content.
- If the content is in English, use English labels.
- If the content is in Chinese, use Chinese labels.
- If the content is in another language, use that language.
Do NOT translate the content.

Content:
${content}`;

    const payload = {
      model: 'nano-banana-pro',
      // 这里暂时不使用回调 URL，本地开发一般也无法提供公网回调地址
      input: {
        prompt,
        aspect_ratio: aspectRatio,
        resolution,
        output_format: outputFormat,
      },
    };

    const resp = await fetch(`${KIE_BASE_URL}/jobs/createTask`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${KIE_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    if (!resp.ok) {
      const text = await resp.text();
      console.error('❌ nano-banana-pro createTask 请求失败:');
      console.error('  - 状态码:', resp.status, resp.statusText);
      console.error('  - 响应内容:', text);
      console.error('  - API URL:', `${KIE_BASE_URL}/jobs/createTask`);
      console.error('  - 请求 payload:', JSON.stringify(payload, null, 2));

      // 自动退还积分
      try {
        console.log(`💰 生成失败，自动退还用户 ${requiredCredits} 积分`);
        await refundCredits({
          userId: user.id,
          credits: requiredCredits,
          description: 'Refund for failed Infographic generation',
        });
      } catch (refundError) {
        console.error('Failed to refund credits:', refundError);
      }

      return NextResponse.json(
        {
          success: false,
          error: `调用 nano-banana-pro 接口失败：HTTP ${resp.status} ${resp.statusText || text}`,
          details: {
            status: resp.status,
            statusText: resp.statusText,
            response: text,
          },
        },
        { status: resp.status }
      );
    }

    const data = await resp.json();

    // 记录成功的响应便于调试
    console.log(
      '✅ nano-banana-pro createTask 响应:',
      JSON.stringify(data, null, 2)
    );

    if (data.code !== 200 || !data.data?.taskId) {
      console.error('❌ nano-banana-pro createTask 返回错误:');
      console.error('  - code:', data.code);
      console.error('  - message:', data.message || data.msg);
      console.error('  - 完整响应:', JSON.stringify(data, null, 2));

      // 自动退还积分
      try {
        console.log(`💰 生成失败，自动退还用户 ${requiredCredits} 积分`);
        await refundCredits({
          userId: user.id,
          credits: requiredCredits,
          description: 'Refund for failed Infographic generation',
        });
      } catch (refundError) {
        console.error('Failed to refund credits:', refundError);
      }

      return NextResponse.json(
        {
          success: false,
          error: `创建信息图任务失败：${
            data.message || data.msg || '未知错误'
          }`,
          raw: data,
        },
        { status: 500 }
      );
    }

    // 说明：
    // - nano-banana-pro 是异步任务，这里只拿到 taskId
    // - 真正的图片 URL 会在“查询任务状态”或回调接口中给出
    // - 为了简化本地开发，这里先把 taskId 返回给前端做展示
    return NextResponse.json({
      success: true,
      taskId: data.data.taskId,
      provider: 'nano-banana-pro',
      raw: data,
    });
  } catch (error) {
    console.error('Infographic generate error:', error);
    return NextResponse.json(
      {
        success: false,
        error:
          process.env.NODE_ENV === 'development'
            ? (error as Error).message
            : '生成信息图时出现错误，请稍后重试。',
      },
      { status: 500 }
    );
  }
}

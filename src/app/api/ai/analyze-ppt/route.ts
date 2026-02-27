// 使用原生 Fetch 实现 DeepSeek 流式调用，确保完全兼容性
// 避免 AI SDK 自动拼接错误路径 (如 /responses)

import { splitTextIntoChunks } from '@/shared/lib/text-splitter';
import {
  consumeCredits,
  getRemainingCredits,
  refundCredits,
} from '@/shared/models/credit';
import { getUserInfo } from '@/shared/models/user';

// Change to nodejs runtime to support DB operations for credit deduction
export const runtime = 'nodejs';
export const maxDuration = 60; // Set timeout to 60 seconds (Vercel Hobby limit) or higher for Pro

export async function POST(req: Request) {
  let userId: string | undefined;
  const requiredCredits = 3;

  try {
    const { prompt, slideCount } = await req.json();

    // 1. Check User & Credits
    const user = await getUserInfo();
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    userId = user.id;

    const remaining = await getRemainingCredits(user.id);

    if (remaining < requiredCredits) {
      return new Response(
        JSON.stringify({
          error: `Insufficient credits. Required: ${requiredCredits}, Available: ${remaining}`,
          code: 'INSUFFICIENT_CREDITS',
        }),
        {
          status: 402,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // 2. Consume Credits
    try {
      await consumeCredits({
        userId: user.id,
        credits: requiredCredits,
        scene: 'ai_ppt_outline',
        description: 'Generate PPT Outline',
      });
    } catch (e) {
      console.error('Failed to consume credits:', e);
      return new Response(
        JSON.stringify({ error: 'Failed to process credits' }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    console.log(
      '[Analyze PPT] Request received, prompt length:',
      prompt?.length,
      'Slide Count:',
      slideCount
    );

    const isSingleSlide = slideCount === 1 || slideCount === '1';

    const slideCountPrompt = isSingleSlide
      ? `Generate EXACTLY 1 slide. Since there is ONLY ONE slide, DO NOT generate a cover page. Instead, summarize the core content and key points into this single slide. Focus on information density and value.`
      : slideCount
        ? `Generate EXACTLY ${slideCount} slides. NO MORE, NO LESS. If you generate more than ${slideCount} slides, the system will fail. If the user provided a lot of content, you MUST summarize it aggressively to fit into exactly ${slideCount} slides.`
        : 'Generate between 6-12 slides depending on the content depth.';

    // 简单的语言检测
    const hasChineseChar = /[\u4e00-\u9fa5]/.test(prompt || '');
    const languageInstruction = hasChineseChar
      ? 'The user input contains Chinese characters. Output MUST be in Chinese (简体中文).'
      : 'The user input is in English. Output MUST be in English. Do NOT use Chinese.';

    // --- 文本分块与摘要策略 (Chunking Strategy) ---
    // ... (保持不变)
    const MAX_INPUT_CHARS = 100000;
    let contentToAnalyze = prompt;

    if (prompt && prompt.length > MAX_INPUT_CHARS) {
      console.log(
        `[Analyze PPT] Input too long (${prompt.length} chars). Truncating to safe limit.`
      );
      const chunks = splitTextIntoChunks(prompt, MAX_INPUT_CHARS);
      contentToAnalyze = chunks[0] + '\n\n[Content truncated due to length...]';
    }

    const systemPrompt = `
You are a professional presentation designer.
Your goal is to create a JSON structure for a slide deck based on the user's input.
${slideCountPrompt}

CRITICAL RULES:
1. ${languageInstruction}
2. Strictly maintain the same language as the user's input content.
3. If the input is in Chinese, ALL titles and content in the output JSON MUST be in Chinese.
4. If the input is in English, output in English.
5. Do NOT translate unless explicitly asked.
6. **SLIDE STRUCTURE**:
   ${
     isSingleSlide
       ? '- **NO COVER PAGE**: Since the user only requested 1 slide, skip the cover. Put the most important information, core insights, and key points directly on this slide.'
       : '- **THE FIRST SLIDE MUST BE A COVER PAGE**: It should only contain a Main Title (title) and a Subtitle (content). The content field for the first slide should be short and act as a subtitle or tagline. It MUST NOT contain bullet points.'
   }
7. **STRICT SLIDE COUNT**: You MUST output exactly ${slideCount || 'the requested'} slides.

Each slide object must have:
- 'title': The title of the slide.
- 'content': Key points (bullet points separated by \\n). ${isSingleSlide ? '' : 'For the first slide (Cover), this is just the subtitle string.'}

Output ONLY the JSON array. Do not include markdown formatting like \`\`\`json or \`\`\`.

Example Output for ${isSingleSlide ? '1 slide' : '2 slides'}:
[
  ${
    isSingleSlide
      ? `{
    "title": "Core Insights of the Content",
    "content": "Key Point 1\\nKey Point 2\\nKey Point 3"
  }`
      : `{
    "title": "Presentation Title",
    "content": "Subtitle or Tagline"
  },
  {
    "title": "Slide Title",
    "content": "Point 1\\nPoint 2"
  }`
  }
]
`;

    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      console.error('[Analyze PPT] DEEPSEEK_API_KEY is missing');
      throw new Error('DEEPSEEK_API_KEY is not set');
    }

    console.log('[Analyze PPT] Starting DeepSeek API call...');

    // 手动发起 Fetch 请求
    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            // DeepSeek Context Limit: 64k/128k tokens.
            // contentToAnalyze is already safely truncated/processed above.
            content: hasChineseChar
              ? contentToAnalyze
              : contentToAnalyze +
                '\n\n(Please generate the outline in English)',
          },
        ],
        stream: true, // 开启流式
        temperature: 0.7,
        max_tokens: 8192, // 增加最大输出 token 限制
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[DeepSeek API Error]', response.status, errorText);

      // 如果是积分扣除后 API 报错，我们需要退款
      if (userId) {
        try {
          console.log(`💰 DeepSeek API 报错，自动退还用户 ${requiredCredits} 积分`);
          await refundCredits({
            userId,
            credits: requiredCredits,
            description: 'Refund for DeepSeek API error during PPT outline generation',
          });
        } catch (refundError) {
          console.error('Failed to refund credits:', refundError);
        }
      }

      // Handle Context Length Error Specifically
      if (response.status === 400 && errorText.includes('context length')) {
        return new Response(
          JSON.stringify({
            error: 'Input content is too long for AI analysis. Please reduce the content length.',
          }),
          {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      return new Response(
        JSON.stringify({ error: `DeepSeek API Error: ${response.status}` }),
        {
          status: response.status,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    if (!response.body) {
      throw new Error('No response body');
    }

    // 创建自定义流，解析 SSE 数据
    // DeepSeek 返回的是 data: {...} 格式
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const stream = new ReadableStream({
      async start(controller) {
        console.log('[Analyze PPT] Stream started');
        const reader = response.body!.getReader();
        let buffer = '';

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              console.log('[Analyze PPT] Stream done');
              // 确保最后一点 buffer 也能被处理
              if (buffer) {
                const lines = buffer.split('\n');
                for (const line of lines) {
                  const trimmed = line.trim();
                  if (!trimmed || trimmed === 'data: [DONE]') continue;
                  if (trimmed.startsWith('data: ')) {
                    try {
                      const data = JSON.parse(trimmed.slice(6));
                      const content = data.choices?.[0]?.delta?.content;
                      if (content) {
                        controller.enqueue(encoder.encode(content));
                      }
                    } catch (e) {}
                  }
                }
              }
              break;
            }

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || ''; // 保留未完整的行

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed || trimmed === 'data: [DONE]') continue;
              if (trimmed.startsWith('data: ')) {
                try {
                  const data = JSON.parse(trimmed.slice(6));
                  const content = data.choices?.[0]?.delta?.content;
                  if (content) {
                    controller.enqueue(encoder.encode(content));
                  }
                } catch (e) {}
              }
            }
          }
          controller.close();
        } catch (e) {
          console.error('[Analyze PPT] Stream error:', e);
          controller.error(e);
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error: any) {
    console.error('[Analyze PPT] Error:', error);

    // 自动退还积分 (如果已扣除)
    // 注意：这里简单假设如果在主流程中抛出错误，且 userId 存在，就尝试退款。
    // 理想情况下应该有一个明确的 flag 标记 "creditsConsumed"
    if (userId) {
      try {
        console.log(`💰 PPT生成失败，自动退还用户 ${requiredCredits} 积分`);
        await refundCredits({
          userId,
          credits: requiredCredits,
          description: 'Refund for failed PPT outline generation',
        });
      } catch (refundError) {
        console.error('Failed to refund credits:', refundError);
      }
    }

    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

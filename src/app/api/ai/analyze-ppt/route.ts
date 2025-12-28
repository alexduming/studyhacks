import { consumeCredits, getRemainingCredits, refundCredits } from '@/shared/models/credit';
import { getUserInfo } from '@/shared/models/user';

// 使用原生 Fetch 实现 DeepSeek 流式调用，确保完全兼容性
// 避免 AI SDK 自动拼接错误路径 (如 /responses)

// Change to nodejs runtime to support DB operations for credit deduction
export const runtime = 'nodejs';

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
          code: 'INSUFFICIENT_CREDITS'
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
      return new Response(JSON.stringify({ error: 'Failed to process credits' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    console.log(
      '[Analyze PPT] Request received, prompt length:',
      prompt?.length,
      'Slide Count:',
      slideCount
    );

    const slideCountPrompt = slideCount
      ? `Generate EXACTLY ${slideCount} slides.`
      : 'Generate between 6-12 slides depending on the content depth.';

    // 简单的语言检测
    const hasChineseChar = /[\u4e00-\u9fa5]/.test(prompt || '');
    const languageInstruction = hasChineseChar
      ? 'The user input contains Chinese characters. Output MUST be in Chinese (简体中文).'
      : 'The user input is in English. Output MUST be in English. Do NOT use Chinese.';

    const systemPrompt = `
You are a professional presentation designer.
Your goal is to create a JSON structure for a slide deck based on the user's input.
${slideCountPrompt}
The output must be a valid JSON array where each object represents a slide.

CRITICAL RULE:
- ${languageInstruction}
- Strictly maintain the same language as the user's input content.
- If the input is in Chinese, ALL titles and content in the output JSON MUST be in Chinese.
- If the input is in English, output in English.
- Do NOT translate unless explicitly asked.

Each slide object must have:
- 'title': The title of the slide.
- 'content': Key points (bullet points separated by \\n).

Output ONLY the JSON array. Do not include markdown formatting like \`\`\`json or \`\`\`.

Example Output:
[
  {
    "title": "Slide Title",
    "content": "Point 1\\nPoint 2"
  }
]
`;

    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      throw new Error('DEEPSEEK_API_KEY is not set');
    }

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
            content: hasChineseChar
              ? prompt
              : prompt + '\n\n(Please generate the outline in English)',
          },
        ],
        stream: true, // 开启流式
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[DeepSeek API Error]', response.status, errorText);
      throw new Error(`DeepSeek API Error: ${response.status} ${errorText}`);
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
        const reader = response.body!.getReader();
        let buffer = '';

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

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
                    // 直接发送文本给前端
                    controller.enqueue(encoder.encode(content));
                  }
                } catch (e) {
                  // 忽略解析错误
                }
              }
            }
          }
          controller.close();
        } catch (e) {
          controller.error(e);
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
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

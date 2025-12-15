import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { streamText } from 'ai';

// Initialize OpenRouter provider
const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

// 使用默认的 Node.js Runtime 以确保稳定的网络连接
export async function POST(req: Request) {
  try {
    const { prompt } = await req.json();
    
    console.log('[Analyze PPT] Request received, prompt length:', prompt?.length);

    const systemPrompt = `
You are a professional presentation designer.
Your goal is to create a JSON structure for a slide deck based on the user's input.
The output must be a valid JSON array where each object represents a slide.

Each slide object must have:
- 'title': The title of the slide.
- 'content': Key points (bullet points separated by \\n).
- 'visualDescription': A highly detailed prompt for an AI image generator (Stable Diffusion/Flux/Midjourney style). Describe the visual composition, style, colors, and subject. DO NOT include text in the image description.

Output ONLY the JSON array. Do not include markdown formatting like \`\`\`json or \`\`\`.

Example Output:
[
  {
    "title": "Slide Title",
    "content": "Point 1\\nPoint 2",
    "visualDescription": "A futuristic city skyline..."
  }
]
`;

    console.log('[Analyze PPT] Starting streamText...');

    // 调用 streamText 并等待结果
    const result = await streamText({
      model: openrouter('deepseek/deepseek-v3.2-exp'),
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      temperature: 0.7,
    });

    console.log('[Analyze PPT] Stream created, starting to send chunks...');

    // 使用纯文本流，配合前端的 streamProtocol: 'text'
    const encoder = new TextEncoder();
    
    const stream = new ReadableStream({
      async start(controller) {
        let chunkCount = 0;
        let fullText = '';
        try {
          for await (const chunk of result.textStream) {
            chunkCount++;
            fullText += chunk;
            
            if (chunkCount === 1) {
              console.log('[Analyze PPT] First chunk received:', chunk.substring(0, 50));
            }
            
            // 检查控制器是否仍然打开
            try {
              // 纯文本流：直接发送文本块
              controller.enqueue(encoder.encode(chunk));
            } catch (enqueueError: any) {
              if (enqueueError.code === 'ERR_INVALID_STATE') {
                console.log('[Analyze PPT] Client disconnected, stopping stream at chunk', chunkCount);
                break;
              }
              throw enqueueError;
            }
          }
          
          console.log('[Analyze PPT] Stream complete, total chunks:', chunkCount);
          console.log('[Analyze PPT] Full text length:', fullText.length);
          console.log('[Analyze PPT] Full text preview:', fullText.substring(0, 200));
          
          // 只在控制器仍然打开时关闭
          try {
            controller.close();
          } catch (e) {
            console.log('[Analyze PPT] Controller already closed by client');
          }
        } catch (error) {
          console.error('[Analyze PPT] Stream error:', error);
          try {
            controller.error(error);
          } catch (e) {
            // Controller already closed
          }
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no', // 禁用代理缓冲
      },
    });
    
  } catch (error: any) {
    console.error('[Analyze PPT] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

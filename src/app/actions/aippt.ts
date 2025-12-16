'use server';

import mammoth from 'mammoth';
import pdf from 'pdf-parse';

import { PPT_STYLES } from '@/config/aippt';

const KIE_API_KEY = '75a2809b76cfae9675cbdddd1af5f488';
// 使用 DeepSeek 官方 Key（从环境变量读取，避免明文暴露）
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

/**
 * Parse File (PDF/DOCX/TXT) to Text
 */
export async function parseFileAction(formData: FormData) {
  const file = formData.get('file') as File;
  if (!file) {
    throw new Error('No file uploaded');
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const fileType = file.type;
    const fileName = file.name.toLowerCase();

    if (fileType === 'application/pdf' || fileName.endsWith('.pdf')) {
      const data = await pdf(buffer);
      return data.text;
    } else if (
      fileType ===
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      fileName.endsWith('.docx')
    ) {
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    } else if (
      fileType === 'text/plain' ||
      fileName.endsWith('.txt') ||
      fileName.endsWith('.md')
    ) {
      return buffer.toString('utf-8');
    } else {
      throw new Error('Unsupported file type');
    }
  } catch (e: any) {
    console.error('File Parse Error:', e);
    throw new Error(`Failed to parse file: ${e.message}`);
  }
}

/**
 * Deprecated: Use parseFileAction instead
 */
export async function parsePdfAction(formData: FormData) {
  return parseFileAction(formData);
}

/**
 * Analyze content using DeepSeek to generate slide outline
 */
export async function analyzeContentAction(
  content: string,
  mode: 'text' | 'pdf' | 'topic' = 'text'
) {
  // 说明：
  // - 这个函数是旧版“非流式大纲分析”的 Server Action，目前 /aippt 页面已经主要使用流式接口 /api/ai/analyze-ppt
  // - 这里仍然保留，改为走 DeepSeek 官方 API，方便以后其他地方复用
  if (!DEEPSEEK_API_KEY) {
    throw new Error('DeepSeek API Key is missing');
  }

  const systemPrompt = `
You are a professional presentation designer.
Your goal is to create a JSON structure for a slide deck based on the user's input.
The output must be a valid JSON array where each object represents a slide.

Each slide object must have:
- 'title': The title of the slide.
- 'content': Key points (bullet points separated by \\n).
- 'visualDescription': A highly detailed prompt for an AI image generator (Stable Diffusion/Flux/Midjourney style). Describe the visual composition, style, colors, and subject. DO NOT include text in the image description.

Input Content:
${content.substring(0, 15000)} // Truncate to avoid context limit if needed

Format:
[
  {
    "title": "Slide Title",
    "content": "Point 1\\nPoint 2",
    "visualDescription": "A futuristic city skyline..."
  }
]
`;

  try {
    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat', // DeepSeek V3.2 非思考模式
        messages: [{ role: 'user', content: systemPrompt }],
        // 这里不用强制 response_format=json，因为我们自己从 content 中解析 JSON
        stream: false,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`DeepSeek API Error: ${response.status} ${errText}`);
    }

    const data = await response.json();
    let text = data.choices?.[0]?.message?.content || '';

    // 兼容性处理：如果模型返回了 ```json 包裹的内容，先去掉外层 Markdown
    if (text.includes('```json')) {
      text = text.split('```json')[1].split('```')[0];
    } else if (text.includes('```')) {
      text = text.split('```')[1].split('```')[0];
    }

    return JSON.parse(text);
  } catch (error: any) {
    console.error('Analysis Error (DeepSeek official):', error);
    throw new Error('Failed to analyze content with DeepSeek official API');
  }
}

/**
 * Create Image Generation Task via KIE API
 */
export async function createKieTaskAction(params: {
  prompt: string;
  styleId?: string;
  aspectRatio?: string;
  imageSize?: string;
  customImages?: string[]; // Array of publicly accessible image URLs
}) {
  const endpoint = 'https://api.kie.ai/api/v1/jobs/createTask';

  // Styles
  let styleSuffix = '';
  let referenceImages: string[] = params.customImages || [];

  if (params.styleId) {
    const style = PPT_STYLES.find((s) => s.id === params.styleId);
    if (style) {
      styleSuffix = style.suffix;
      // Note: Preset reference images should be handled by client
      // and passed in customImages/referenceImages to keep this action pure
    }
  }

  // Combine prompts
  let finalPrompt = params.prompt + ' ' + styleSuffix;

  // Log reference images info
  if (referenceImages.length > 0) {
    console.log(
      `[KIE] Reference images (${referenceImages.length} URLs):`,
      referenceImages
    );
    // Add strong natural language instruction to use reference image style
    finalPrompt +=
      ' (Style Reference: Strictly follow the visual style, color palette, and composition from the provided input image)';
  }

  // New payload structure per documentation: wrap params in 'input'
  // Note: image_input expects array of publicly accessible URLs, NOT base64
  const body = {
    model: 'nano-banana-pro',
    input: {
      prompt: finalPrompt,
      aspect_ratio: params.aspectRatio || '16:9',
      resolution: params.imageSize || '4K', // doc says 'resolution' (1K/2K/4K)
      image_input: referenceImages.length > 0 ? referenceImages : undefined, // array of URLs
      output_format: 'png',
    },
  };

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${KIE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    console.log('[KIE] Raw Create Response:', JSON.stringify(data, null, 2));

    // Response structure check: data.data.taskId
    if (data.code !== 200 || !data.data?.taskId) {
      throw new Error(data.message || 'Failed to create KIE task');
    }

    // Return flattened object with snake_case task_id for frontend compatibility
    return { task_id: data.data.taskId };
  } catch (e: any) {
    console.error('[KIE] Create Error:', e);
    throw e;
  }
}

/**
 * Query KIE Task Status
 */
export async function queryKieTaskAction(taskId: string) {
  // Documentation says query param is 'taskId', not 'task_id'
  const endpoint = `https://api.kie.ai/api/v1/jobs/recordInfo?taskId=${taskId}`;

  try {
    const res = await fetch(endpoint, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${KIE_API_KEY}`,
      },
    });

    const data = await res.json();

    // Normalize response for frontend
    // API returns { data: { state: "success", resultJson: "{\"resultUrls\":[...]}" } }

    if (data.code === 200 && data.data) {
      let results: string[] = [];
      try {
        if (data.data.resultJson) {
          const parsed = JSON.parse(data.data.resultJson);
          results = parsed.resultUrls || [];
        }
      } catch (e) {
        console.error('Failed to parse resultJson', e);
      }

      return {
        data: {
          status:
            data.data.state === 'success'
              ? 'SUCCESS'
              : data.data.state === 'fail'
                ? 'FAILED'
                : 'PENDING',
          results: results,
        },
      };
    }

    return data;
  } catch (e: any) {
    console.error('[KIE] Query Error:', e);
    throw e;
  }
}

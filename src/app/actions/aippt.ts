'use server';

import mammoth from 'mammoth';
import pdf from 'pdf-parse';

import { PPT_STYLES } from '@/config/aippt';

const KIE_API_KEY =
  process.env.KIE_NANO_BANANA_PRO_KEY || '75a2809b76cfae9675cbdddd1af5f488';
const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN || '';
// 使用 DeepSeek 官方 Key（从环境变量读取，避免明文暴露）
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

// 资源的基础 URL
// 优先使用 R2 域名，其次是 App URL，最后是生产环境域名
// 注意：AI 服务无法访问 localhost，必须使用公网 URL
const ASSETS_BASE_URL =
  process.env.NEXT_PUBLIC_ASSETS_URL || 'https://cdn.studyhacks.ai';

/**
 * 处理图片 URL，确保是公网可访问的
 */
function resolveImageUrl(url: string): string {
  if (!url) return '';

  // 如果已经是 http 开头，检查是否是 localhost
  if (url.startsWith('http')) {
    if (url.includes('localhost') || url.includes('127.0.0.1')) {
      // 将 localhost 替换为公网域名
      // 假设路径结构保持一致：http://localhost:3000/styles/... -> https://cdn.xxx.com/styles/...
      const urlPath = new URL(url).pathname;
      return `${ASSETS_BASE_URL}${urlPath}`;
    }
    return url;
  }

  // 如果是相对路径，添加 Base URL
  if (url.startsWith('/')) {
    return `${ASSETS_BASE_URL}${url}`;
  }

  return url;
}

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

    let extractedText = '';

    if (fileType === 'application/pdf' || fileName.endsWith('.pdf')) {
      const data = await pdf(buffer);
      extractedText = data.text;
    } else if (
      fileType ===
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      fileName.endsWith('.docx')
    ) {
      const result = await mammoth.extractRawText({ buffer });
      extractedText = result.value;
    } else if (
      fileType === 'text/plain' ||
      fileName.endsWith('.txt') ||
      fileName.endsWith('.md')
    ) {
      extractedText = buffer.toString('utf-8');
    } else {
      throw new Error('Unsupported file type');
    }

    // Basic cleaning
    return extractedText.trim();
  } catch (error) {
    console.error('File parsing error:', error);
    throw new Error('Failed to parse file');
  }
}

/**
 * Generate PPT Outline via DeepSeek V3
 */
export async function generateOutlineAction(
  content: string,
  slideCount: number = 8
) {
  if (!DEEPSEEK_API_KEY) {
    throw new Error('DeepSeek API Key is not configured');
  }

  const systemPrompt = `You are an expert presentation designer.
Create a structured outline for a presentation based on the user's content.
The output must be a valid JSON object with the following structure:
{
  "title": "Presentation Title",
  "slides": [
    {
      "title": "Slide Title",
      "content": "Key bullet points (max 50 words)",
      "visualDescription": "Description of the visual/image for this slide"
    }
  ]
}
Generate exactly ${slideCount} slides.
Ensure the content is concise, professional, and suitable for a presentation.
Do not include any markdown formatting (like \`\`\`json), just the raw JSON object.`;

  try {
    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content },
        ],
        stream: false,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('DeepSeek API Error:', errorText);
      throw new Error(`DeepSeek API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content;

    try {
      return JSON.parse(content);
    } catch (e) {
      console.error('Failed to parse DeepSeek response as JSON:', content);
      throw new Error('Invalid JSON response from AI');
    }
  } catch (error) {
    console.error('Outline generation error:', error);
    throw error;
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
  // 处理参考图片 URL：确保是公网可访问的
  let referenceImages: string[] = (params.customImages || []).map(
    resolveImageUrl
  );

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
 * Query Task Status via KIE API
 */
export async function queryKieTaskAction(taskId: string) {
  // Kie Query Endpoint
  const endpoint = `https://api.kie.ai/api/v1/jobs/recordInfo?taskId=${taskId}`;

  try {
    const res = await fetch(endpoint, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${KIE_API_KEY}`,
      },
    });

    const data = await res.json();

    // Check if task succeeded
    // Data structure: data.data.state (success/fail/processing)
    // Results: data.data.resultJson (stringified JSON) -> { resultUrls: string[] }

    if (data.data && data.data.resultJson) {
      let results: string[] = [];
      try {
        if (typeof data.data.resultJson === 'string') {
          const parsed = JSON.parse(data.data.resultJson);
          results = parsed.resultUrls || [];
        } else if (data.data.resultJson.resultUrls) {
          results = data.data.resultJson.resultUrls;
        }
      } catch (e) {
        console.warn('Failed to parse resultJson', e);
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

/**
 * Create Image Generation Task with Fallback (KIE → Replicate)
 *
 * 非程序员解释：
 * - 这个函数实现了托底逻辑：首先尝试用KIE生成PPT图片
 * - 如果KIE失败，自动切换到Replicate
 * - 返回结果中包含使用的提供商信息
 */
export async function createKieTaskWithFallbackAction(params: {
  prompt: string;
  styleId?: string;
  aspectRatio?: string;
  imageSize?: string;
  customImages?: string[];
}) {
  console.log('\n🎯 PPT生成 - 开始尝试多提供商生成');

  // 预处理图片 URL，确保对所有提供商都是公网可访问的
  const processedParams = {
    ...params,
    customImages: (params.customImages || []).map(resolveImageUrl),
  };

  // 第一步：尝试使用KIE
  if (KIE_API_KEY) {
    try {
      console.log('🔄 尝试使用 KIE (nano-banana-pro)...');
      // 注意：createKieTaskAction 内部也会处理 URL，但这里为了日志清晰，我们可以认为它已经接收到了处理过的参数
      // 但为了兼容性，createKieTaskAction 内部保留了 URL 处理逻辑
      const result = await createKieTaskAction(params);
      console.log('✅ KIE 任务创建成功:', result.task_id);
      return {
        success: true,
        task_id: result.task_id,
        provider: 'KIE',
        fallbackUsed: false,
      };
    } catch (error: any) {
      console.warn('⚠️ KIE 失败:', error.message);
      console.log('🔄 准备切换到 Replicate 托底服务...');
    }
  } else {
    console.log('⏭️ 跳过 KIE（未配置API Key）');
  }

  // 第二步：使用Replicate托底
  if (REPLICATE_API_TOKEN) {
    try {
      console.log('🔄 尝试使用 Replicate (FLUX)...');

      // 处理样式
      let styleSuffix = '';
      if (params.styleId) {
        const style = PPT_STYLES.find((s) => s.id === params.styleId);
        if (style) {
          styleSuffix = style.suffix;
        }
      }

      let finalPrompt = params.prompt + ' ' + styleSuffix;

      // 如果有参考图片，添加风格指导
      const referenceImages = processedParams.customImages;
      if (referenceImages && referenceImages.length > 0) {
        finalPrompt +=
          ' (Style Reference: Strictly follow the visual style, color palette, and composition from the provided input image)';
        console.log(
          `[Replicate] 使用 ${referenceImages.length} 张参考图:`,
          referenceImages
        );
      }

      // 解析分辨率
      const imageSize = params.imageSize || '4K';
      let width = 1024;
      let height = 1024;

      if (params.aspectRatio) {
        const [w, h] = params.aspectRatio.split(':').map(Number);
        if (imageSize === '4K') {
          const scale = 4096 / Math.max(w, h);
          width = Math.round(w * scale);
          height = Math.round(h * scale);
        } else if (imageSize === '2K') {
          const scale = 2048 / Math.max(w, h);
          width = Math.round(w * scale);
          height = Math.round(h * scale);
        } else {
          const scale = 1024 / Math.max(w, h);
          width = Math.round(w * scale);
          height = Math.round(h * scale);
        }
      }

      // 调用Replicate API
      const Replicate = require('replicate').default;
      const replicate = new Replicate({ auth: REPLICATE_API_TOKEN });

      // Replicate 的输入参数可能不支持 image_input 数组，通常支持 image (单张) 或其他特定参数
      // FLUX 模型通常主要依赖 prompt。如果必须使用参考图，需要确认模型是否支持 image-to-image 或 controlnet
      // black-forest-labs/flux-schnell 主要是 text-to-image。
      // 为了安全起见，我们主要依赖 prompt，但如果模型支持图片输入，我们可以尝试传入第一张
      // 这里我们主要依赖详细的 prompt 来控制风格

      const input: any = {
        prompt: finalPrompt,
        width,
        height,
        num_outputs: 1,
        // disable_safety_checker: true,
      };

      // 只有当模型明确支持参考图时才传入。目前 flux-schnell 主要是文生图。
      // 如果需要图生图，可能需要切换模型。暂时只用 prompt。

      const output = await replicate.run('black-forest-labs/flux-schnell', {
        input,
      });

      const imageUrl = Array.isArray(output) ? output[0] : output;

      console.log('✅ Replicate 生成成功');

      // 返回类似KIE的格式，但标记为同步结果
      return {
        success: true,
        task_id: `replicate-${Date.now()}`,
        provider: 'Replicate',
        fallbackUsed: true,
        imageUrl, // 直接返回图片URL（同步结果）
      };
    } catch (error: any) {
      console.error('❌ Replicate 失败:', error.message);
    }
  } else {
    console.log('⏭️ 跳过 Replicate（未配置API Token）');
  }

  // 所有服务都失败
  throw new Error('所有图片生成服务都暂时不可用，请稍后重试');
}

/**
 * Query Task Status with Fallback Support
 *
 * 非程序员解释：
 * - 这个函数查询任务状态，支持KIE和Replicate
 * - 对于Replicate的同步结果，直接返回成功状态
 */
export async function queryKieTaskWithFallbackAction(
  taskId: string,
  provider?: string
) {
  // 如果是Replicate的任务（同步API），直接返回成功
  if (provider === 'Replicate' || taskId.startsWith('replicate-')) {
    return {
      data: {
        status: 'SUCCESS',
        results: [], // 图片URL已在创建时返回
      },
    };
  }

  // 否则使用原来的KIE查询逻辑
  return await queryKieTaskAction(taskId);
}

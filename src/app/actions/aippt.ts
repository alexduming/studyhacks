'use server';

// @ts-ignore
import { fal } from '@fal-ai/client';
import mammoth from 'mammoth';
import pdf from 'pdf-parse';

import { PPT_STYLES } from '@/config/aippt';
import { consumeCredits, getRemainingCredits } from '@/shared/models/credit';
import { getSignUser } from '@/shared/models/user';

// 移除硬编码的 API Key，强制使用环境变量
const KIE_API_KEY = process.env.KIE_NANO_BANANA_PRO_KEY || '';
const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN || '';
const FAL_KEY = process.env.FAL_KEY || '';
// 使用 DeepSeek 官方 Key（从环境变量读取，避免明文暴露）
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
// 使用 OpenRouter API Key（用于视觉 OCR）
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

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
 * Parse Image to Text using Vision AI (OCR)
 * 非程序员解释：
 * - 这个函数使用视觉AI模型（Google Gemini Pro Vision）来识别图片中的文字
 * - 比传统OCR更智能，能理解文字的上下文和排版结构
 * - 支持 JPG、PNG、WEBP 等常见图片格式
 */
export async function parseImageAction(formData: FormData): Promise<string> {
  const file = formData.get('file') as File;
  if (!file) {
    throw new Error('No file uploaded');
  }

  // 检查 API Key
  if (!OPENROUTER_API_KEY) {
    throw new Error('OpenRouter API Key 未配置，图片 OCR 功能需要此密钥');
  }

  try {
    // 将图片转换为 base64
    const buffer = Buffer.from(await file.arrayBuffer());
    const base64Image = buffer.toString('base64');
    const mimeType = file.type || 'image/jpeg';

    // 构建 data URL 格式
    const imageDataUrl = `data:${mimeType};base64,${base64Image}`;

    console.log('[OCR] 开始识别图片文字，使用 Qwen2.5 VL 32B...');
    console.log('[OCR] 图片大小:', (buffer.length / 1024).toFixed(2), 'KB');

    // 使用 OpenRouter 的 Qwen2.5 VL 32B Instruct 进行 OCR
    // Qwen2.5-VL-32B 专门优化用于视觉分析，价格便宜且效果好
    const response = await fetch(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          'HTTP-Referer':
            process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
          'X-Title': 'StudyHacks AI PPT Generator',
        },
        body: JSON.stringify({
          model: 'qwen/qwen2.5-vl-32b-instruct', // 使用 Qwen2.5 VL 32B Instruct 模型
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: 'Extract all text content from this image. Preserve the original text structure, formatting, and language. Output only the extracted text without any additional comments, explanations, or formatting.',
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: imageDataUrl,
                  },
                },
              ],
            },
          ],
          temperature: 0.1, // 低温度确保准确性
          max_tokens: 4000,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[OCR] OpenRouter API Error:', response.status, errorText);

      // 提供更详细的错误信息
      if (response.status === 401) {
        throw new Error('API 密钥无效或未授权');
      } else if (response.status === 429) {
        throw new Error('API 请求频率限制，请稍后重试');
      } else {
        throw new Error(`API 调用失败 (${response.status})`);
      }
    }

    const data = await response.json();

    // 检查响应格式
    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      console.error('[OCR] 无效的 API 响应:', data);
      throw new Error('API 返回了无效的响应格式');
    }

    const extractedText = data.choices[0].message.content;

    if (!extractedText || extractedText.trim().length === 0) {
      console.warn('[OCR] 图片中未识别到文字');
      return '（未识别到文字内容）';
    }

    console.log(
      '[OCR] 图片文字识别成功，提取了',
      extractedText.length,
      '个字符'
    );

    return extractedText.trim();
  } catch (error: any) {
    console.error('[OCR] 图片解析错误:', error);

    // 提供更友好的错误信息
    if (error.message.includes('API 密钥')) {
      throw new Error('API 密钥配置错误，请检查 OPENROUTER_API_KEY 环境变量');
    } else if (error.message.includes('网络')) {
      throw new Error('网络连接失败，请检查网络连接后重试');
    } else {
      throw new Error('图片文字识别失败：' + (error.message || '未知错误'));
    }
  }
}

/**
 * Parse Multiple Images to Text (Batch OCR)
 * 非程序员解释：
 * - 这个函数支持批量识别多张图片中的文字
 * - 并行处理多张图片，提高效率
 * - 自动合并所有识别结果
 */
export async function parseMultipleImagesAction(
  formData: FormData
): Promise<string> {
  const files = formData.getAll('files') as File[];
  if (!files || files.length === 0) {
    throw new Error('No files uploaded');
  }

  console.log(`[Batch OCR] 开始批量识别 ${files.length} 张图片...`);

  try {
    // 并行处理所有图片
    const results = await Promise.all(
      files.map(async (file, index) => {
        try {
          console.log(
            `[Batch OCR] 正在识别第 ${index + 1}/${files.length} 张图片: ${file.name}`
          );

          // 为每个文件创建单独的 FormData
          const singleFormData = new FormData();
          singleFormData.append('file', file);

          // 调用单图片 OCR
          const text = await parseImageAction(singleFormData);

          console.log(
            `[Batch OCR] 第 ${index + 1} 张图片识别成功，提取了 ${text.length} 个字符`
          );

          return {
            success: true,
            fileName: file.name,
            text: text,
            index: index,
          };
        } catch (error: any) {
          console.error(
            `[Batch OCR] 第 ${index + 1} 张图片识别失败:`,
            error.message
          );
          return {
            success: false,
            fileName: file.name,
            error: error.message,
            index: index,
          };
        }
      })
    );

    // 统计成功和失败数量
    const successCount = results.filter((r) => r.success).length;
    const failedCount = results.filter((r) => !r.success).length;

    console.log(
      `[Batch OCR] 批量识别完成: 成功 ${successCount}/${files.length}, 失败 ${failedCount}`
    );

    // 如果所有图片都失败了，提供详细的错误信息
    if (successCount === 0) {
      const failedDetails = results
        .filter((r) => !r.success)
        .map((r) => `${r.fileName}: ${r.error}`)
        .join('\n');

      console.error('[Batch OCR] 所有图片识别失败，详细信息:');
      console.error(failedDetails);

      // 检查常见错误类型
      const hasApiKeyError = results.some(
        (r) => r.error && r.error.includes('API 密钥')
      );
      const hasNetworkError = results.some(
        (r) =>
          r.error && (r.error.includes('网络') || r.error.includes('fetch'))
      );

      if (hasApiKeyError) {
        throw new Error(
          '图片识别失败：OpenRouter API 密钥未配置或无效。请检查环境变量 OPENROUTER_API_KEY'
        );
      } else if (hasNetworkError) {
        throw new Error('图片识别失败：网络连接错误。请检查网络连接或稍后重试');
      } else {
        throw new Error(
          `所有图片识别都失败了。常见原因：\n1. API 密钥未配置\n2. 图片格式不支持\n3. 图片过大或损坏\n4. 网络问题\n\n详细错误：${results[0].error}`
        );
      }
    }

    // 合并所有成功识别的文字
    const combinedText = results
      .filter((r) => r.success)
      .map((r, idx) => {
        // 为每张图片的内容添加分隔符
        const separator = idx === 0 ? '' : '\n\n---\n\n';
        return `${separator}[图片 ${r.index + 1}: ${r.fileName}]\n${r.text}`;
      })
      .join('');

    // 如果有失败的，在结果中提示
    if (failedCount > 0) {
      const failedFiles = results
        .filter((r) => !r.success)
        .map((r) => r.fileName)
        .join(', ');
      console.warn(`[Batch OCR] 以下图片识别失败: ${failedFiles}`);

      // 在合并的文本末尾添加提示
      return (
        combinedText.trim() +
        `\n\n[注意：${failedCount} 张图片识别失败: ${failedFiles}]`
      );
    }

    return combinedText.trim();
  } catch (error: any) {
    console.error('[Batch OCR] 批量识别错误:', error);
    throw error; // 直接抛出错误，保留详细信息
  }
}

/**
 * Parse File (PDF/DOCX/TXT/Image) to Text
 * 非程序员解释：
 * - 这个函数现在支持更多文件格式，包括图片
 * - 会自动识别文件类型并使用对应的解析方法
 * - 图片文件会使用 AI 视觉模型进行 OCR 识别
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

    // 检查是否为图片文件
    const isImage =
      fileType.startsWith('image/') ||
      fileName.endsWith('.jpg') ||
      fileName.endsWith('.jpeg') ||
      fileName.endsWith('.png') ||
      fileName.endsWith('.webp') ||
      fileName.endsWith('.gif');

    if (isImage) {
      // 使用 AI OCR 识别图片中的文字
      console.log('[Parse] 检测到图片文件，使用 OCR 识别...');
      extractedText = await parseImageAction(formData);
    } else if (fileType === 'application/pdf' || fileName.endsWith('.pdf')) {
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
      throw new Error(
        'Unsupported file type. Please upload PDF, DOCX, TXT, or Image files.'
      );
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

  // 简单的语言检测：如果有中文字符，则倾向于中文；否则默认为英文（针对纯英文输入的情况）
  const hasChineseChar = /[\u4e00-\u9fa5]/.test(content);
  const languageInstruction = hasChineseChar
    ? 'The user input contains Chinese characters. Output MUST be in Chinese (简体中文).'
    : 'The user input is in English. Output MUST be in English. Do NOT use Chinese.';

  const systemPrompt = `You are an expert presentation designer.
Create a structured outline for a presentation based on the user's content.

CRITICAL RULE:
- ${languageInstruction}
- Strictly maintain the same language as the user's input content.
- If the input is in Chinese, ALL titles and content in the output JSON MUST be in Chinese.
- If the input is in English, output in English.
- Do NOT translate unless explicitly asked.

The output must be a valid JSON object with the following structure:
{
  "title": "Presentation Title",
  "slides": [
  {
    "title": "Slide Title",
      "content": "Key bullet points (max 50 words)"
  }
]
}
Generate exactly ${slideCount} slides.
Ensure the content is concise, professional, and suitable for a presentation.
Do not include any markdown formatting (like \`\`\`json), just the raw JSON object.`;

  try {
    const response: Response = await fetch(
      'https://api.deepseek.com/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            { role: 'system', content: systemPrompt },
            {
              role: 'user',
              content: hasChineseChar
                ? content
                : content + '\n\n(Please generate the outline in English)',
            },
          ],
          stream: false,
          response_format: { type: 'json_object' },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('DeepSeek API Error:', errorText);
      throw new Error(`DeepSeek API error: ${response.status}`);
    }

    const data = await response.json();
    const responseContent = data.choices[0].message.content;

    try {
      return JSON.parse(responseContent);
    } catch (e) {
      console.error(
        'Failed to parse DeepSeek response as JSON:',
        responseContent
      );
      throw new Error('Invalid JSON response from AI');
    }
  } catch (error) {
    console.error('Outline generation error:', error);
    throw error;
  }
}

/**
 * Consume Credits Action (Server Side)
 */
export async function consumeCreditsAction(params: {
  credits: number;
  description: string;
  metadata?: any;
}) {
  const user = await getSignUser();
  if (!user) {
    throw new Error('Unauthorized');
  }

  const remaining = await getRemainingCredits(user.id);
  if (remaining < params.credits) {
    throw new Error(
      `Insufficient credits. Required: ${params.credits}, Available: ${remaining}`
    );
  }

  await consumeCredits({
    userId: user.id,
    credits: params.credits,
    scene: 'ai_ppt',
    description: params.description,
    metadata: params.metadata ? JSON.stringify(params.metadata) : undefined,
  });

  return { success: true, remaining: remaining - params.credits };
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
  isEnhancedMode?: boolean;
  isPromptEnhancedMode?: boolean;
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
    if (style && params.isPromptEnhancedMode !== false) {
      styleSuffix = style.suffix;
      // Note: Preset reference images should be handled by client
      // and passed in customImages/referenceImages to keep this action pure
    }
  }

  // Content Strategy Prompt
  const contentStrategy = params.isEnhancedMode
    ? `\n\n[Content Enhancement Strategy]\nIf user provided content is detailed, use it directly. If content is simple/sparse, use your professional knowledge to expand on the subject to create a rich, complete slide, BUT you must STRICTLY preserve any specific data, numbers, and professional terms provided. Do NOT invent false data. For sparse content, use advanced layout techniques (grid, whitespace, font size) to fill the space professionally without forced filling.`
    : `\n\n[Strict Mode]\nSTRICTLY follow the provided text for Title and Content. Do NOT add, remove, or modify any words. Do NOT expand or summarize. Render the text exactly as given.`;

  // Combine prompts
  let finalPrompt = params.prompt + ' ' + styleSuffix + contentStrategy;

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
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
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
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
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
 * Create Image Generation Task with Load Balancing (三级机制)
 *
 * 非程序员解释：
 * - 实现了 FAL -> KIE -> Replicate 的三级降级策略
 * - 1. 主力: FAL (nano-banana-pro)
 * - 2. 托底: KIE
 * - 3. 最终托底: Replicate
 */
export async function createKieTaskWithFallbackAction(params: {
  prompt: string;
  styleId?: string;
  aspectRatio?: string;
  imageSize?: string;
  customImages?: string[];
  preferredProvider?: 'FAL' | 'Replicate' | 'KIE'; // 首选提供商
  isEnhancedMode?: boolean;
  isPromptEnhancedMode?: boolean;
}) {
  const {
    preferredProvider,
    isEnhancedMode = true,
    isPromptEnhancedMode = true,
    ...taskParams
  } = params;

  // 预处理图片 URL，确保对所有提供商都是公网可访问的
  const processedParams = {
    ...taskParams,
    isEnhancedMode,
    isPromptEnhancedMode,
    customImages: (taskParams.customImages || []).map(resolveImageUrl),
  };

  // 定义优先级顺序
  // 如果指定了 provider，则它排第一，其他的按默认顺序排
  let providerChain = ['FAL', 'KIE', 'Replicate'];

  if (preferredProvider && providerChain.includes(preferredProvider)) {
    // 将首选 provider 移到第一位
    providerChain = [
      preferredProvider,
      ...providerChain.filter((p) => p !== preferredProvider),
    ];
  }

  console.log(`\n🎯 生成任务 - 优先级顺序: ${providerChain.join(' -> ')}`);

  let lastError: any = null;

  for (const provider of providerChain) {
    try {
      if (provider === 'FAL') {
        if (!FAL_KEY) {
          console.warn('⚠️ FAL Key 未配置，跳过');
          continue;
        }
        console.log(
          `🔄 [${provider === preferredProvider ? '主力' : '托底'}] 使用 FAL (nano-banana-pro)...`
        );
        const result = await createFalTaskAction(processedParams);
        console.log('✅ FAL 任务成功');
        return {
          ...result,
          fallbackUsed: provider !== preferredProvider,
        };
      } else if (provider === 'KIE') {
        if (!KIE_API_KEY) {
          console.warn('⚠️ KIE Key 未配置，跳过');
          continue;
        }
        console.log(
          `🔄 [${provider === preferredProvider ? '主力' : '托底'}] 使用 KIE (nano-banana-pro)...`
        );
        const result = await createKieTaskAction(processedParams);
        console.log('✅ KIE 任务创建成功:', result.task_id);
        return {
          success: true,
          task_id: result.task_id,
          provider: 'KIE',
          fallbackUsed: provider !== preferredProvider,
        };
      } else if (provider === 'Replicate') {
        if (!REPLICATE_API_TOKEN) {
          console.warn('⚠️ Replicate Token 未配置，跳过');
          continue;
        }
        console.log(
          `🔄 [${provider === preferredProvider ? '主力' : '托底'}] 使用 Replicate (nano-banana-pro)...`
        );
        const result = await createReplicateTaskAction(processedParams);
        console.log('✅ Replicate 任务成功');
        return {
          ...result,
          fallbackUsed: provider !== preferredProvider,
        };
      }
    } catch (error: any) {
      console.warn(`⚠️ ${provider} 失败:`, error.message);
      lastError = error;
      // 继续下一个 loop
    }
  }

  // 如果所有都失败了
  console.error(`❌ 所有图片生成服务都失败`);
  throw new Error(
    `所有图片生成服务都暂时不可用: ${lastError?.message || '未知错误'}`
  );
}

/**
 * Force Create FAL Task (使用 fal-ai/nano-banana-pro/edit)
 */
export async function createFalTaskAction(params: {
  prompt: string;
  styleId?: string;
  aspectRatio?: string;
  imageSize?: string;
  customImages?: string[];
  isEnhancedMode?: boolean;
  isPromptEnhancedMode?: boolean;
}) {
  if (!FAL_KEY) {
    throw new Error('FAL API Key 未配置');
  }

  try {
    // 配置 FAL Client
    fal.config({
      credentials: FAL_KEY,
    });

    // 处理样式
    let styleSuffix = '';
    if (params.styleId) {
      const style = PPT_STYLES.find((s) => s.id === params.styleId);
      if (style && params.isPromptEnhancedMode !== false) {
        styleSuffix = style.suffix;
      }
    }

    // Content Strategy Prompt
    const contentStrategy = params.isEnhancedMode
      ? `\n\n[Content Enhancement Strategy]\nIf user provided content is detailed, use it directly. If content is simple/sparse, use your professional knowledge to expand on the subject to create a rich, complete slide, BUT you must STRICTLY preserve any specific data, numbers, and professional terms provided. Do NOT invent false data. For sparse content, use advanced layout techniques (grid, whitespace, font size) to fill the space professionally without forced filling.`
      : `\n\n[Strict Mode]\nSTRICTLY follow the provided text for Title and Content. Do NOT add, remove, or modify any words. Do NOT expand or summarize. Render the text exactly as given.`;

    let finalPrompt = params.prompt + ' ' + styleSuffix + contentStrategy;

    // 处理参考图片
    const referenceImages = (params.customImages || []).map(resolveImageUrl);
    if (referenceImages.length > 0) {
      // 限制最多 4 张 (FAL 示例是 2 张，KIE 是多张，Replicate 也是多张，nano-banana通常支持多张)
      // 保持一致性，取前几张
      const limitedImages = referenceImages.slice(0, 4);
      finalPrompt +=
        ' (Style Reference: Strictly follow the visual style, color palette, and composition from the provided input images)';
      console.log(`[FAL] 使用 ${limitedImages.length} 张参考图`);
    }

    const input: any = {
      prompt: finalPrompt,
      num_images: 1,
      aspect_ratio: params.aspectRatio === '16:9' ? '16:9' : 'auto',
      output_format: 'png',
      resolution: params.imageSize || '2K', // 支持 1K, 2K, 4K
    };

    if (referenceImages.length > 0) {
      input.image_urls = referenceImages;
    }

    // 动态选择模型：如果有参考图，使用 edit 模型；否则使用标准模型
    const falModel =
      referenceImages.length > 0
        ? 'fal-ai/nano-banana-pro/edit'
        : 'fal-ai/nano-banana-pro';

    console.log('[FAL] 请求参数:', {
      model: falModel,
      prompt: input.prompt.substring(0, 100) + '...',
      hasReferenceImages: referenceImages.length > 0,
    });

    const startTime = Date.now();

    // 使用 subscribe 等待结果
    const result: any = await fal.subscribe(falModel, {
      input,
      logs: true,
      onQueueUpdate: (update: any) => {
        if (update.status === 'IN_PROGRESS') {
          // update.logs.map((log) => log.message).forEach(console.log);
        }
      },
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[FAL] API 调用完成，耗时: ${elapsed}s`);

    // 解析结果
    // Output: { images: [ { url: ... } ] }
    if (
      !result.data ||
      !result.data.images ||
      result.data.images.length === 0
    ) {
      throw new Error('FAL 未返回图片');
    }

    const imageUrl = result.data.images[0].url;
    console.log('✅ FAL 生成成功，URL:', imageUrl);

    // 自动保存到 R2 (复用逻辑)
    let finalImageUrl = imageUrl;
    try {
      const { getStorageServiceWithConfigs } = await import(
        '@/shared/services/storage'
      );
      const { getAllConfigs } = await import('@/shared/models/config');
      const { getUserInfo } = await import('@/shared/models/user');
      const { nanoid } = await import('nanoid');

      const user = await getUserInfo();
      const configs = await getAllConfigs();

      if (user && configs.r2_bucket_name && configs.r2_access_key) {
        console.log('[FAL] 开始保存图片到 R2...');
        const storageService = getStorageServiceWithConfigs(configs);
        const timestamp = Date.now();
        const randomId = nanoid(8);
        const fileExtension = imageUrl.includes('.jpg') ? 'jpg' : 'png';
        const fileName = `${timestamp}_${randomId}.${fileExtension}`;
        const storageKey = `slides/${user.id}/${fileName}`;

        const uploadResult = await storageService.downloadAndUpload({
          url: imageUrl,
          key: storageKey,
          contentType: `image/${fileExtension}`,
          disposition: 'inline',
        });

        if (uploadResult.success && uploadResult.url) {
          console.log(`[FAL] ✅ 图片保存成功: ${uploadResult.url}`);
          finalImageUrl = uploadResult.url;
        }
      }
    } catch (saveError) {
      console.error('[FAL] 保存图片异常:', saveError);
    }

    return {
      success: true,
      task_id: `fal-${result.requestId || Date.now()}`,
      provider: 'FAL',
      fallbackUsed: false,
      imageUrl: finalImageUrl,
    };
  } catch (error: any) {
    console.error('❌ FAL 失败:', error.message);
    throw error;
  }
}

/**
 * Force Create Replicate Task (使用 google/nano-banana-pro)
 *
 * 非程序员解释：
 * - 这个函数强制使用 Replicate 的 google/nano-banana-pro 模型生成图片
 * - 支持 1K/2K/4K 分辨率和多图参考（最多8张）
 * - 用于主力生成或 KIE 超时/失败时的直接调用
 */
export async function createReplicateTaskAction(params: {
  prompt: string;
  styleId?: string;
  aspectRatio?: string;
  imageSize?: string;
  customImages?: string[];
  isEnhancedMode?: boolean;
  isPromptEnhancedMode?: boolean;
}) {
  if (!REPLICATE_API_TOKEN) {
    console.log('⏭️ 跳过 Replicate（未配置API Token）');
    throw new Error('Replicate API Token 未配置');
  }

  try {
    console.log('🔄 尝试使用 Replicate (google/nano-banana-pro)...');

    // 预处理图片 URL
    const processedParams = {
      ...params,
      customImages: (params.customImages || []).map(resolveImageUrl),
    };

    // 处理样式
    let styleSuffix = '';
    if (params.styleId) {
      const style = PPT_STYLES.find((s) => s.id === params.styleId);
      if (style && params.isPromptEnhancedMode !== false) {
        styleSuffix = style.suffix;
      }
    }

    // Content Strategy Prompt
    const contentStrategy = params.isEnhancedMode
      ? `\n\n[Content Enhancement Strategy]\nIf user provided content is detailed, use it directly. If content is simple/sparse, use your professional knowledge to expand on the subject to create a rich, complete slide, BUT you must STRICTLY preserve any specific data, numbers, and professional terms provided. Do NOT invent false data. For sparse content, use advanced layout techniques (grid, whitespace, font size) to fill the space professionally without forced filling.`
      : `\n\n[Strict Mode]\nSTRICTLY follow the provided text for Title and Content. Do NOT add, remove, or modify any words. Do NOT expand or summarize. Render the text exactly as given.`;

    let finalPrompt = params.prompt + ' ' + styleSuffix + contentStrategy;

    // 处理参考图片
    const referenceImages = processedParams.customImages || [];
    if (referenceImages.length > 0) {
      // nano-banana-pro 支持多图融合，最多8张
      const limitedImages = referenceImages.slice(0, 8);
      finalPrompt +=
        ' (Style Reference: Strictly follow the visual style, color palette, and composition from the provided input images)';
      console.log(
        `[Replicate] 使用 ${limitedImages.length} 张参考图:`,
        limitedImages
      );
    }

    // 调用 Replicate API
    const Replicate = require('replicate');
    const replicate = new Replicate({ auth: REPLICATE_API_TOKEN });

    // google/nano-banana-pro 的参数结构（与 KIE 类似）
    const input: any = {
      prompt: finalPrompt,
      aspect_ratio: params.aspectRatio || '16:9',
      resolution: params.imageSize || '4K', // 1K/2K/4K
      output_format: 'png',
    };

    // 如果有参考图，传入 image_input（nano-banana-pro 支持多图融合）
    if (referenceImages.length > 0) {
      input.image_input = referenceImages.slice(0, 8); // 最多8张
    }

    console.log('[Replicate] 请求参数:', {
      model: 'google/nano-banana-pro',
      input: {
        ...input,
        prompt: input.prompt.substring(0, 100) + '...', // 只显示部分prompt
      },
    });

    // 使用 run() 并等待完成
    // run() 会自动处理轮询，直到任务完成
    console.log('[Replicate] 开始调用 API...');

    const startTime = Date.now();
    let output = await replicate.run('google/nano-banana-pro', {
      input,
      wait: { interval: 2000 }, // 每 2 秒检查一次状态
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[Replicate] API 调用完成，耗时: ${elapsed}s`);
    console.log('[Replicate] 原始输出类型:', typeof output);
    console.log(
      '[Replicate] 原始输出:',
      typeof output === 'string'
        ? output
        : JSON.stringify(output).substring(0, 200)
    );

    // 处理各种可能的输出格式
    let imageUrl: string;

    if (typeof output === 'string') {
      console.log('[Replicate] ✓ 输出是字符串类型，长度:', output.length);
      imageUrl = output;
    } else if (Array.isArray(output)) {
      console.log(
        '[Replicate] ✓ 输出是数组，长度:',
        output.length,
        ', 第一项类型:',
        typeof output[0]
      );

      const firstItem = output[0];

      // 如果数组第一项是对象且有 url 属性（FileOutput）
      if (firstItem && typeof firstItem === 'object' && 'url' in firstItem) {
        const urlValue = (firstItem as any).url;
        console.log('[Replicate] 数组第一项.url 类型:', typeof urlValue);

        if (typeof urlValue === 'function') {
          console.log('[Replicate] url 是函数，正在调用...');
          const result = await urlValue();
          console.log('[Replicate] 函数返回值类型:', typeof result);
          console.log('[Replicate] 函数返回值:', result);

          // 如果返回的是 URL 对象，需要转换为字符串
          if (result && typeof result === 'object' && 'href' in result) {
            imageUrl = result.href; // URL 对象的 href 属性是字符串
            console.log('[Replicate] 从 URL 对象提取 href:', imageUrl);
          } else if (typeof result === 'string') {
            imageUrl = result;
          } else {
            imageUrl = String(result); // 强制转换为字符串
          }
        } else {
          imageUrl = urlValue;
        }
      } else {
        // 直接使用第一项（假设是字符串）
        imageUrl = firstItem;
      }
    } else if (output && typeof output === 'object') {
      console.log(
        '[Replicate] ✓ 输出是对象，属性:',
        Object.keys(output).slice(0, 10)
      );
      console.log('[Replicate] ✓ Constructor name:', output.constructor?.name);

      // 如果是 ReadableStream，需要读取内容
      if (
        'readable' in output ||
        output.constructor?.name === 'ReadableStream'
      ) {
        console.log('[Replicate] 检测到 ReadableStream，正在读取...');
        const reader = (output as any).getReader();
        const chunks: any[] = [];
        let chunkCount = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            console.log(`[Replicate] Stream 读取完成，共 ${chunkCount} 块数据`);
            break;
          }
          chunks.push(value);
          chunkCount++;
          if (chunkCount % 10 === 0) {
            console.log(`[Replicate] 已读取 ${chunkCount} 块...`);
          }
        }

        // 将 chunks 合并并转换为字符串
        const blob = new Blob(chunks as BlobPart[]);
        const text = await blob.text();

        console.log(
          `[Replicate] Stream 内容长度: ${text.length}, 前100字符:`,
          text.substring(0, 100)
        );

        try {
          // 尝试解析为 JSON
          const parsed = JSON.parse(text);
          console.log('[Replicate] JSON 解析成功:', typeof parsed);
          imageUrl = Array.isArray(parsed) ? parsed[0] : parsed.url || parsed;
        } catch (e) {
          // 如果不是 JSON，直接使用文本
          console.log('[Replicate] 不是 JSON，直接使用文本');
          imageUrl = text.trim();
        }
      } else if ('url' in output) {
        console.log('[Replicate] ✓ 对象包含 url 属性');
        const urlValue = (output as any).url;
        console.log('[Replicate] url 类型:', typeof urlValue);

        // Replicate SDK 的 FileOutput 类型，url 可能是函数
        if (typeof urlValue === 'function') {
          console.log('[Replicate] url 是函数，正在调用...');
          const result = await urlValue(); // 调用函数获取实际 URL
          console.log('[Replicate] 函数返回值类型:', typeof result);
          console.log('[Replicate] 函数返回值:', result);

          // 如果返回的是 URL 对象，需要转换为字符串
          if (result && typeof result === 'object' && 'href' in result) {
            imageUrl = result.href; // URL 对象的 href 属性是字符串
            console.log('[Replicate] 从 URL 对象提取 href:', imageUrl);
          } else if (typeof result === 'string') {
            imageUrl = result;
          } else {
            imageUrl = String(result); // 强制转换为字符串
            console.log('[Replicate] 强制转换为字符串:', imageUrl);
          }
        } else {
          imageUrl = urlValue;
        }
      } else if ('output' in output) {
        console.log('[Replicate] ✓ 对象包含 output 属性');
        const innerOutput = (output as any).output;
        imageUrl = Array.isArray(innerOutput) ? innerOutput[0] : innerOutput;
      } else {
        console.warn('[Replicate] ⚠ 未识别的对象格式，转为字符串');
        imageUrl = String(output);
      }
    } else {
      console.error('[Replicate] ✗ 完全无法解析的输出类型');
      throw new Error('Replicate 返回了无法解析的结果格式');
    }

    if (
      !imageUrl ||
      typeof imageUrl !== 'string' ||
      !imageUrl.startsWith('http')
    ) {
      console.error('[Replicate] ✗ 无效的图片 URL:', imageUrl);
      console.error('[Replicate] ✗ imageUrl 类型:', typeof imageUrl);
      throw new Error('Replicate 返回了无效的图片 URL');
    }

    console.log('✅ Replicate 生成成功，URL:', imageUrl);

    // ✅ 新增：自动保存 Replicate 生成的图片到 R2
    let finalImageUrl = imageUrl;
    try {
      // 动态导入 storage 相关模块
      const { getStorageServiceWithConfigs } = await import(
        '@/shared/services/storage'
      );
      const { getAllConfigs } = await import('@/shared/models/config');
      const { getUserInfo } = await import('@/shared/models/user');
      const { nanoid } = await import('nanoid');

      const user = await getUserInfo();
      const configs = await getAllConfigs();

      if (user && configs.r2_bucket_name && configs.r2_access_key) {
        console.log('[Replicate] 开始保存图片到 R2...');
        const storageService = getStorageServiceWithConfigs(configs);

        const timestamp = Date.now();
        const randomId = nanoid(8);
        const fileExtension =
          imageUrl.includes('.jpg') || imageUrl.includes('.jpeg')
            ? 'jpg'
            : 'png';
        const fileName = `${timestamp}_${randomId}.${fileExtension}`;
        const storageKey = `slides/${user.id}/${fileName}`;

        const uploadResult = await storageService.downloadAndUpload({
          url: imageUrl,
          key: storageKey,
          contentType: `image/${fileExtension}`,
          disposition: 'inline',
        });

        if (uploadResult.success && uploadResult.url) {
          console.log(`[Replicate] ✅ 图片保存成功: ${uploadResult.url}`);
          finalImageUrl = uploadResult.url;
        } else {
          console.warn(`[Replicate] ⚠️ 图片保存失败: ${uploadResult.error}`);
        }
      } else {
        console.log('[Replicate] R2 未配置或用户未登录，跳过保存');
      }
    } catch (saveError: any) {
      console.error('[Replicate] 保存图片异常:', saveError);
      // 保存失败不影响流程，继续使用原始 URL
    }

    // 返回类似KIE的格式，但标记为同步结果
    const result = {
      success: true,
      task_id: `replicate-${Date.now()}`,
      provider: 'Replicate',
      fallbackUsed: false, // 如果是主力调用，这里应该是 false
      imageUrl: finalImageUrl, // 返回（可能已替换为 R2 的）图片URL
    };

    console.log('[Replicate] 返回值:', {
      ...result,
      imageUrl: result.imageUrl.substring(0, 80) + '...',
    });

    return result;
  } catch (error: any) {
    console.error('❌ Replicate 失败:', error.message);
    throw error;
  }
}

/**
 * Query Task Status with Fallback Support
 *
 * 非程序员解释：
 * - 这个函数查询任务状态，支持KIE和Replicate和FAL
 * - 对于Replicate和FAL的同步结果，直接返回成功状态
 * - ✅ 新增：任务成功后自动保存图片到 R2
 */
export async function queryKieTaskWithFallbackAction(
  taskId: string,
  provider?: string,
  options?: {
    userId?: string;
    slideIndex?: number;
    presentationId?: string;
  }
) {
  // 如果是Replicate或FAL的任务（同步API），直接返回成功
  if (
    provider === 'Replicate' ||
    taskId.startsWith('replicate-') ||
    provider === 'FAL' ||
    taskId.startsWith('fal-')
  ) {
    return {
      data: {
        status: 'SUCCESS',
        results: [], // 图片URL已在创建时返回
      },
    };
  }

  // 否则使用原来的KIE查询逻辑
  const result = await queryKieTaskAction(taskId);

  // ✅ 新增：如果任务成功且有结果，自动保存到 R2
  if (
    result?.data?.status === 'SUCCESS' &&
    result.data.results &&
    result.data.results.length > 0
  ) {
    try {
      // 动态导入 storage 相关模块（避免在前端执行）
      const { getStorageServiceWithConfigs } = await import(
        '@/shared/services/storage'
      );
      const { getAllConfigs } = await import('@/shared/models/config');
      const { getUserInfo } = await import('@/shared/models/user');
      const { nanoid } = await import('nanoid');

      // 获取当前用户
      const user = await getUserInfo();
      if (!user) {
        console.log('[Slides] 用户未登录，跳过 R2 保存');
        return result;
      }

      // 获取配置
      const configs = await getAllConfigs();

      // 检查 R2 是否配置
      if (!configs.r2_bucket_name || !configs.r2_access_key) {
        console.log('[Slides] R2 未配置，跳过保存');
        return result;
      }

      console.log(
        `[Slides] 开始保存 ${result.data.results.length} 张图片到 R2`
      );

      const storageService = getStorageServiceWithConfigs(configs);

      // 并行保存所有图片
      const savePromises = result.data.results.map(
        async (imageUrl: string, index: number) => {
          try {
            const timestamp = Date.now();
            const randomId = nanoid(8);
            const fileExtension =
              imageUrl.includes('.jpg') || imageUrl.includes('.jpeg')
                ? 'jpg'
                : 'png';

            const fileName = `${timestamp}_${randomId}_${index}.${fileExtension}`;
            const storageKey = `slides/${user.id}/${fileName}`;

            console.log(`[Slides] 保存图片 ${index + 1}: ${storageKey}`);

            const uploadResult = await storageService.downloadAndUpload({
              url: imageUrl,
              key: storageKey,
              contentType: `image/${fileExtension}`,
              disposition: 'inline',
            });

            if (uploadResult.success && uploadResult.url) {
              console.log(
                `[Slides] ✅ 图片 ${index + 1} 保存成功: ${uploadResult.url}`
              );
              return uploadResult.url;
            } else {
              console.warn(
                `[Slides] ⚠️ 图片 ${index + 1} 保存失败: ${uploadResult.error}`
              );
              return imageUrl; // 失败时返回原始 URL
            }
          } catch (error: any) {
            console.error(`[Slides] ❌ 图片 ${index + 1} 保存异常:`, error);
            return imageUrl; // 异常时返回原始 URL
          }
        }
      );

      const savedUrls = await Promise.all(savePromises);
      console.log(
        `[Slides] 保存完成，成功 ${savedUrls.filter((url, i) => url !== result.data.results![i]).length}/${result.data.results.length} 张`
      );

      // 返回保存后的 R2 URL
      return {
        data: {
          status: result.data.status,
          results: savedUrls,
        },
      };
    } catch (error: any) {
      console.error('[Slides] 保存图片到 R2 失败:', error);
      // 保存失败不影响返回结果，使用原始 URL
      return result;
    }
  }

  return result;
}

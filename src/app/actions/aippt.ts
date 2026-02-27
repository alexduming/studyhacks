'use server';

// @ts-ignore
import { fal } from '@fal-ai/client';
import mammoth from 'mammoth';
import pdf from 'pdf-parse';
import Replicate from 'replicate';

import {
  generateAnchorPrompt,
  generateVisualSpecPrompt,
  PPT_STYLES,
} from '@/config/aippt-slides2';
import {
  consumeCredits,
  getRemainingCredits,
  refundCredits,
} from '@/shared/models/credit';
import { getSignUser } from '@/shared/models/user';

// 移除硬编码的 API Key，强制使用环境变量
const KIE_API_KEY = process.env.KIE_NANO_BANANA_PRO_KEY || '';
const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN || '';
const FAL_KEY = process.env.FAL_KEY || '';
const APIYI_API_KEY = process.env.APIYI_API_KEY || ''; // APIYI (Gemini 3 Pro Image)
// 使用 DeepSeek 官方 Key（从环境变量读取，避免明文暴露）
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
// 使用 OpenRouter API Key（用于视觉 OCR）
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

/**
 * 检测文本的主要语言
 *
 * 非程序员解释：
 * - 这个函数通过检测文本中的中文字符比例来判断语言
 * - 如果中文字符占比超过 5%，则认为是中文内容
 * - 这样可以准确判断用户输入的语言，避免 AI 自己猜测导致语言混乱
 *
 * @param text 要检测的文本
 * @returns 'zh' 表示中文，'en' 表示英文
 */
function detectLanguage(text: string): 'zh' | 'en' {
  if (!text) return 'en';

  // 统计中文字符数量（包括中文标点）
  const chineseChars = text.match(/[\u4e00-\u9fa5\u3000-\u303f\uff00-\uffef]/g) || [];
  const totalChars = text.replace(/\s/g, '').length; // 去除空白字符后的总长度

  if (totalChars === 0) return 'en';

  // 如果中文字符占比超过 5%，则认为是中文内容
  // 这个阈值可以处理混合内容（如中文内容中包含英文术语）
  const chineseRatio = chineseChars.length / totalChars;

  return chineseRatio > 0.05 ? 'zh' : 'en';
}

/**
 * 生成语言约束提示词
 *
 * 非程序员解释：
 * - 这个函数根据语言设置生成强制性的语言约束指令
 * - 'auto' 模式会自动检测用户输入的语言，并明确告诉 AI 应该使用什么语言
 * - 这样可以避免 AI 自己判断语言导致的不一致问题
 *
 * @param outputLanguage 语言设置：'auto' | 'zh' | 'en'
 * @param userContent 用户输入的内容（用于 auto 模式下的语言检测）
 * @returns 语言约束提示词
 */
function generateLanguagePrompt(
  outputLanguage: 'auto' | 'zh' | 'en' | undefined,
  userContent: string
): string {
  if (outputLanguage === 'zh') {
    return `\n\n[Language Requirement - CRITICAL]
⚠️ MANDATORY: ALL text in the generated image MUST be in Simplified Chinese (简体中文).
- Title: Chinese
- Subtitle: Chinese
- Body text: Chinese
- Labels: Chinese
- Any other text: Chinese
Do NOT use English for any visible text. Translate any English system instructions to Chinese if they appear in the final output.`;
  } else if (outputLanguage === 'en') {
    return `\n\n[Language Requirement - CRITICAL]
⚠️ MANDATORY: ALL text in the generated image MUST be in English.
- Title: English
- Subtitle: English
- Body text: English
- Labels: English
- Any other text: English
Do NOT use Chinese or any other language for any visible text.`;
  } else {
    // Auto 模式：主动检测语言并明确告诉 AI
    const detectedLang = detectLanguage(userContent);

    if (detectedLang === 'zh') {
      return `\n\n[Language Requirement - CRITICAL]
⚠️ DETECTED LANGUAGE: Chinese (中文)
⚠️ MANDATORY: Since the user's input content is in Chinese, ALL text in the generated image MUST be in Simplified Chinese (简体中文).
- Title: Chinese (中文标题)
- Subtitle: Chinese (中文副标题)
- Body text: Chinese (中文正文)
- Labels: Chinese (中文标签)
- Any other text: Chinese
Do NOT mix languages. Do NOT use English for any visible text. Keep the entire slide in Chinese.`;
    } else {
      return `\n\n[Language Requirement - CRITICAL]
⚠️ DETECTED LANGUAGE: English
⚠️ MANDATORY: Since the user's input content is in English, ALL text in the generated image MUST be in English.
- Title: English
- Subtitle: English
- Body text: English
- Labels: English
- Any other text: English
Do NOT mix languages. Do NOT use Chinese for any visible text. Keep the entire slide in English.`;
    }
  }
}

/**
 * 图片生成服务优先级配置（从环境变量读取）
 *
 * 非程序员解释：
 * - 通过修改 .env.local 文件中的 IMAGE_PROVIDER_PRIORITY 就能快速切换主力/托底顺序
 * - 格式：用逗号分隔的提供商名称，从左到右依次尝试
 * - 支持的提供商：FAL、KIE、Replicate、APIYI
 * - 示例：APIYI,FAL,KIE,Replicate 表示 APIYI主力，FAL托底，KIE再托底，Replicate最终托底
 * - 如果环境变量未设置或格式错误，默认使用 FAL,KIE,Replicate,APIYI
 */
function getProviderPriority(): Array<'FAL' | 'KIE' | 'Replicate' | 'APIYI'> {
  const priorityStr = process.env.IMAGE_PROVIDER_PRIORITY || 'FAL,KIE,Replicate,APIYI';

  // 解析逗号分隔的字符串，去除空格
  const providers = priorityStr
    .split(',')
    .map(p => p.trim())
    .filter(p => ['FAL', 'KIE', 'Replicate', 'APIYI'].includes(p)) as Array<'FAL' | 'KIE' | 'Replicate' | 'APIYI'>;

  // 如果解析后为空或少于1个提供商，使用默认配置
  if (providers.length === 0) {
    console.warn('⚠️ IMAGE_PROVIDER_PRIORITY 配置无效，使用默认顺序: FAL,KIE,Replicate,APIYI');
    return ['FAL', 'KIE', 'Replicate', 'APIYI'];
  }

  // 确保所有四个提供商都存在（防止配置遗漏）
  const allProviders: Array<'FAL' | 'KIE' | 'Replicate' | 'APIYI'> = ['FAL', 'KIE', 'Replicate', 'APIYI'];
  const missingProviders = allProviders.filter(p => !providers.includes(p));

  // 将遗漏的提供商追加到末尾
  const finalProviders = [...providers, ...missingProviders];

  console.log(`📋 图片生成优先级（环境变量配置）: ${finalProviders.join(' -> ')}`);
  return finalProviders;
}

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
 * Parse public webpage link into clean text.
 * 非程序员解释：
 * - 这个函数会访问用户粘贴的网页链接
 * - 自动去掉脚本、样式、广告等噪音
 * - 只保留正文文字，便于继续做自动分页
 */
export async function parseLinkContentAction(rawUrl: string): Promise<string> {
  if (!rawUrl || !rawUrl.trim()) {
    throw new Error('请先输入要抓取的链接');
  }

  let normalizedUrl = rawUrl.trim();
  if (!/^https?:\/\//i.test(normalizedUrl)) {
    normalizedUrl = `https://${normalizedUrl}`;
  }

  try {
    const target = new URL(normalizedUrl);
    const res = await fetch(target, {
      cache: 'no-store',
      headers: {
        'User-Agent': 'StudyHacksSlidesBot/1.0 (+https://studyhacks.ai/ai-ppt)',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });

    if (!res.ok) {
      throw new Error(`链接访问失败（HTTP ${res.status}）`);
    }

    const html = await res.text();
    const stripped = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<\/?(svg|canvas|iframe|picture|noscript)[\s\S]*?>/gi, '');

    const text = stripped
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|section|article|li|h[1-6])>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/\s{2,}/g, ' ')
      .trim();

    if (!text) {
      throw new Error('没有从该链接提取到有效正文');
    }

    return text.slice(0, 20000); // 限制最大长度，避免超长 prompt
  } catch (error: any) {
    console.error('[Link Parser] 解析网页失败', error);
    throw new Error(
      error.message || '解析网页内容失败，请检查链接是否可公开访问'
    );
  }
}

/**
 * Parse File (PDF/DOCX/TXT/Image) to Text
 * 非程序员解释：
 * - 这个函数现在支持更多文件格式，包括图片
 * - 会自动识别文件类型并使用对应的解析方法
 * - 图片文件会使用 AI 视觉模型进行 OCR 识别
 */
export async function parseFileAction(input: FormData | { fileUrl: string; fileType?: string; fileName?: string }) {
  let buffer: Buffer;
  let fileType = '';
  let fileName = '';

  // 方式1：通过 FormData 传递（小文件）
  if (input instanceof FormData) {
    const file = input.get('file') as File;
    if (!file) {
      throw new Error('No file uploaded');
    }
    buffer = Buffer.from(await file.arrayBuffer());
    fileType = file.type;
    fileName = file.name.toLowerCase();
  }
  // 方式2：通过 URL 传递（大文件，已上传到 R2）
  else {
    const { fileUrl } = input;
    if (!fileUrl) {
      throw new Error('No file URL provided');
    }
    console.log('[Parse] Downloading file from URL:', fileUrl);
    
    // 下载文件
    const response = await fetch(fileUrl);
    if (!response.ok) {
      throw new Error(`Failed to download file: ${response.statusText}`);
    }
    
    buffer = Buffer.from(await response.arrayBuffer());
    
    // 尝试从 input 或 Content-Type 推断类型
    fileType = input.fileType || response.headers.get('content-type') || '';
    fileName = input.fileName?.toLowerCase() || fileUrl.split('/').pop()?.toLowerCase() || '';
    
    console.log('[Parse] File downloaded. Size:', (buffer.length / 1024 / 1024).toFixed(2), 'MB');
  }

  try {
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
      
      // 如果是 FormData 且是图片，复用现有的 parseImageAction
      // 注意：parseImageAction 需要 FormData，如果是 URL 模式，我们需要重构 OCR 逻辑支持 URL
      if (input instanceof FormData) {
        extractedText = await parseImageAction(input);
      } else {
        // 对于大图片 URL，目前暂时不支持 OCR（因为 OCR 逻辑强绑定了 FormData）
        // 但通常大文件是 PDF/DOCX，图片很少超过 4.5MB
        // 如果真有需求，需要改造 parseImageAction 支持 URL
        throw new Error('OCR via URL is not supported yet. Please use smaller images.');
      }
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
- **The first slide MUST be a COVER PAGE.** It should only contain a Main Title (title) and a Subtitle (content). The content field for the first slide should be short and act as a subtitle or tagline (e.g. "Presentation by [Name]" or "Date").

The output must be a valid JSON object with the following structure:
{
  "title": "Presentation Title",
  "slides": [
  {
    "title": "Slide Title",
    "content": "Key bullet points (max 50 words). For the first slide (Cover), this is the subtitle."
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
 * Refund Credits Action (Server Side)
 */
export async function refundCreditsAction(params: {
  credits: number;
  description: string;
}) {
  const user = await getSignUser();
  if (!user) {
    throw new Error('Unauthorized');
  }

  await refundCredits({
    userId: user.id,
    credits: params.credits,
    description: params.description,
  });

  return { success: true };
}

/**
 * Create Image Generation Task via KIE API
 *
 * 🎯 2026-02-10 更新：支持编辑模式
 * KIE 的 nano-banana-pro 模型通过 image_input 参数支持编辑功能
 * 编辑模式下，将带标记的图片作为 image_input 传入即可
 */
export async function createKieTaskAction(params: {
  prompt: string;
  styleId?: string;
  aspectRatio?: string;
  imageSize?: string;
  customImages?: string[]; // Array of publicly accessible image URLs
  isEnhancedMode?: boolean;
  isPromptEnhancedMode?: boolean;
  outputLanguage?: 'auto' | 'zh' | 'en';
  /** 🎯 编辑模式：原始图片URL（用于局部编辑） */
  editImageUrl?: string;
  /** 🎯 编辑模式：mask 图片（Base64 或 URL） */
  maskImage?: string;
  /** 🎯 编辑模式：带标记的图片（用于编辑） */
  markedImage?: string;
  /** Deck上下文：传递当前页码信息以增强视觉一致性 */
  deckContext?: DeckContext;
}) {
  const endpoint = 'https://api.kie.ai/api/v1/jobs/createTask';

  // 🎯 判断是否为编辑模式
  const isEditMode = !!(params.editImageUrl || params.markedImage);

  // Styles
  let styleSuffix = '';
  // 处理参考图片 URL：确保是公网可访问的
  let referenceImages: string[] = [];

  // 🎯 编辑模式下，使用带标记的图片作为参考
  if (isEditMode && params.markedImage) {
    referenceImages = [params.markedImage];
    console.log('[KIE] 🎨 编辑模式：使用带标记的图片');
  } else {
    // 非编辑模式：正常处理参考图片
    referenceImages = (params.customImages || []).map(resolveImageUrl);

    if (params.styleId) {
      const style = PPT_STYLES.find((s) => s.id === params.styleId);
      if (style && params.isPromptEnhancedMode !== false) {
        styleSuffix = style.prompt;

        // 🎯 关键：如果风格定义了参考图或预览图，将其加入参考图列表
        let styleRefs: string[] = [];
        if (style.preview) {
          styleRefs.push(resolveImageUrl(style.preview));
        }
        if (style.refs && style.refs.length > 0) {
          styleRefs = [...styleRefs, ...style.refs.map(resolveImageUrl)];
        }

        if (styleRefs.length > 0) {
          // 去重
          const uniqueStyleRefs = Array.from(new Set(styleRefs));
          // 将风格参考图放在前面
          referenceImages = [...uniqueStyleRefs, ...referenceImages];
        }
      }
    }
  }

  // 🎯 2026-02-10 更新：使用统一的语言检测和提示词生成函数
  // 这样可以确保 auto 模式下准确检测用户输入的语言，避免语言混乱
  const languagePrompt = generateLanguagePrompt(params.outputLanguage, params.prompt);

  // Content Strategy Prompt
  const contentStrategy = params.isEnhancedMode
    ? `\n\n[Content Enhancement Strategy]\nIf user provided content is detailed, use it directly. If content is simple/sparse, use your professional knowledge to expand on the subject to create a rich, complete slide, BUT you must STRICTLY preserve any specific data, numbers, and professional terms provided. Do NOT invent false data. For sparse content, use advanced layout techniques (grid, whitespace, font size) to fill the space professionally without forced filling.`
    : `\n\n[Strict Mode]\nSTRICTLY follow the provided text for Title and Content. Do NOT add, remove, or modify any words. Do NOT expand or summarize. Render the text exactly as given.`;

  // Combine prompts
  // 🎯 语言约束放在最后，确保 AI 优先遵守语言要求
  let finalPrompt = params.prompt + ' ' + styleSuffix + contentStrategy + languagePrompt;

  // 🎯 编辑模式：添加特殊编辑指令
  if (isEditMode && params.markedImage) {
    finalPrompt += `\n\n[重要编辑指令]\n图片中的红色框标记了需要修改的区域。请仅修改红框内的内容，保持红框外的所有元素不变。修改完成后，请移除所有红色标记框。`;
    console.log('[KIE] 🎨 已添加编辑模式指令');
  }

  // Log reference images info
  if (referenceImages.length > 0) {
    const limitedImages = referenceImages.slice(0, 8);
    console.log(
      `[KIE] Reference images (${limitedImages.length} URLs):`,
      limitedImages.map(url => url.substring(0, 80) + '...')
    );
    // 非编辑模式下添加风格参考指令
    if (!isEditMode) {
      finalPrompt +=
        '（视觉风格参考：请严格遵循所提供参考图的设计风格、配色方案和构图布局）';
    }

    referenceImages = limitedImages;
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
 * APIYI API 端点
 * - 统一使用 Gemini 原生格式（支持文生图和图生图，且支持分辨率参数）
 */
const APIYI_TEXT2IMG_URL = 'https://api.apiyi.com/v1beta/models/gemini-3-pro-image-preview:generateContent';

/**
 * 下载图片并转换为 base64
 *
 * 非程序员解释：
 * - 从 URL 下载图片文件
 * - 将图片数据转换为 base64 编码字符串
 * - 用于 APIYI 图生图模式（Gemini 原生格式需要 base64 图片）
 */
async function downloadImageAsBase64ForApiyi(imageUrl: string): Promise<{ base64: string; mimeType: string } | null> {
  try {
    console.log('[APIYI] 📥 下载参考图:', imageUrl.substring(0, 80) + '...');

    const response = await fetch(imageUrl, {
      signal: AbortSignal.timeout(30000), // 30秒超时
    });

    if (!response.ok) {
      console.warn('[APIYI] 下载参考图失败:', response.status);
      return null;
    }

    // 获取 MIME 类型
    const contentType = response.headers.get('content-type') || 'image/png';
    const mimeType = contentType.split(';')[0].trim();

    // 转换为 base64
    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');

    console.log(`[APIYI] ✅ 参考图下载成功，大小: ${(base64.length / 1024).toFixed(1)} KB, 类型: ${mimeType}`);

    return { base64, mimeType };
  } catch (error: any) {
    console.warn('[APIYI] 下载参考图异常:', error.message);
    return null;
  }
}

/**
 * Create Image Generation Task via APIYI API (同步模式)
 *
 * 非程序员解释：
 * - APIYI 统一使用 Google Gemini 原生格式，支持 aspectRatio 和 imageSize
 * - 文生图：直接传递文本 prompt
 * - 图生图：将参考图转为 base64，通过 inline_data 传递
 * - 同步接口：直接等待生成完成，返回 base64 图片数据
 * - 速度快（约 8-22 秒），价格便宜（$0.05/张）
 *
 * 🎯 注意：APIYI 是同步 API，会直接返回图片数据
 * 为了与其他异步提供商保持一致的接口，这里返回一个特殊的 task_id
 * 前端轮询时会立即返回已完成状态和图片 URL
 *
 * 重要修复（2026-02-12）：
 * - 之前图生图使用 OpenAI 兼容格式，不支持分辨率参数
 * - 现在统一使用 Gemini 原生格式 + base64 图片，支持完整的分辨率控制
 */
export async function createApiyiTaskAction(params: {
  prompt: string;
  styleId?: string;
  aspectRatio?: string;
  imageSize?: string;
  customImages?: string[];
  isEnhancedMode?: boolean;
  isPromptEnhancedMode?: boolean;
  outputLanguage?: 'auto' | 'zh' | 'en';
  editImageUrl?: string;
  maskImage?: string;
  markedImage?: string;
  deckContext?: DeckContext;
}) {
  // 🎯 判断是否为编辑模式
  const isEditMode = !!(params.editImageUrl || params.markedImage);

  // Styles
  let styleSuffix = '';
  let referenceImages: string[] = [];

  // 🎯 编辑模式下，使用带标记的图片作为参考
  if (isEditMode && params.markedImage) {
    referenceImages = [params.markedImage];
    console.log('[APIYI] 🎨 编辑模式：使用带标记的图片');
  } else {
    referenceImages = (params.customImages || []).map(resolveImageUrl);

    if (params.styleId) {
      const style = PPT_STYLES.find((s) => s.id === params.styleId);
      if (style && params.isPromptEnhancedMode !== false) {
        styleSuffix = style.prompt;

        let styleRefs: string[] = [];
        if (style.preview) {
          styleRefs.push(resolveImageUrl(style.preview));
        }
        if (style.refs && style.refs.length > 0) {
          styleRefs = [...styleRefs, ...style.refs.map(resolveImageUrl)];
        }

        if (styleRefs.length > 0) {
          const uniqueStyleRefs = Array.from(new Set(styleRefs));
          referenceImages = [...uniqueStyleRefs, ...referenceImages];
        }
      }
    }
  }

  // 使用统一的语言检测和提示词生成函数
  const languagePrompt = generateLanguagePrompt(params.outputLanguage, params.prompt);

  // Content Strategy Prompt
  const contentStrategy = params.isEnhancedMode
    ? `\n\n[Content Enhancement Strategy]\nIf user provided content is detailed, use it directly. If content is simple/sparse, use your professional knowledge to expand on the subject to create a rich, complete slide, BUT you must STRICTLY preserve any specific data, numbers, and professional terms provided. Do NOT invent false data. For sparse content, use advanced layout techniques (grid, whitespace, font size) to fill the space professionally without forced filling.`
    : `\n\n[Strict Mode]\nSTRICTLY follow the provided text for Title and Content. Do NOT add, remove, or modify any words. Do NOT expand or summarize. Render the text exactly as given.`;

  // Combine prompts
  let finalPrompt = params.prompt + ' ' + styleSuffix + contentStrategy + languagePrompt;

  // 🎯 编辑模式：添加特殊编辑指令
  if (isEditMode && params.markedImage) {
    finalPrompt += `\n\n[重要编辑指令]\n图片中的红色框标记了需要修改的区域。请仅修改红框内的内容，保持红框外的所有元素不变。修改完成后，请移除所有红色标记框。`;
    console.log('[APIYI] 🎨 已添加编辑模式指令');
  }

  // Log reference images info
  if (referenceImages.length > 0) {
    const limitedImages = referenceImages.slice(0, 8);
    console.log(
      `[APIYI] Reference images (${limitedImages.length} URLs):`,
      limitedImages.map((url) => url.substring(0, 80) + '...')
    );
  }

  // 映射宽高比和分辨率
  const aspectRatio = params.aspectRatio || '16:9';
  const imageSize = params.imageSize || '2K';

  // 根据分辨率设置超时时间
  const timeoutMap: Record<string, number> = { '1K': 180000, '2K': 300000, '4K': 360000 };
  const timeout = timeoutMap[imageSize] || 300000;

  // 🎯 统一使用 Gemini 原生格式端点（支持分辨率参数）
  const hasReferenceImages = referenceImages.length > 0;
  const apiUrl = APIYI_TEXT2IMG_URL;

  // 构建请求体（Gemini 原生格式）
  let parts: any[] = [{ text: finalPrompt }];

  // 如果有参考图，下载并转为 base64，添加到 parts 中
  if (hasReferenceImages) {
    const limitedImages = referenceImages.slice(0, 8); // 最多 8 张参考图
    console.log('[APIYI] 🎨 开始下载参考图，数量:', limitedImages.length);

    // 并行下载所有参考图
    const downloadPromises = limitedImages.map(url => downloadImageAsBase64ForApiyi(url));
    const downloadResults = await Promise.all(downloadPromises);

    // 将成功下载的图片添加到 parts 数组
    let successCount = 0;
    for (const imageData of downloadResults) {
      if (imageData) {
        parts.push({
          inline_data: {
            mime_type: imageData.mimeType,
            data: imageData.base64,
          },
        });
        successCount++;
      }
    }

    if (successCount > 0) {
      console.log(`[APIYI] 🎨 使用图生图模式（Gemini 原生格式 + base64 图片），成功加载 ${successCount}/${limitedImages.length} 张参考图`);
    } else {
      console.warn('[APIYI] ⚠️ 所有参考图下载失败，降级为纯文生图模式');
    }
  }

  const payload = {
    contents: [{ parts }],
    generationConfig: {
      responseModalities: ['IMAGE'],
      imageConfig: {
        aspectRatio: aspectRatio,
        imageSize: imageSize,
      },
    },
  };

  console.log('[APIYI] 请求参数:', {
    apiUrl: 'Gemini 原生格式',
    aspectRatio,
    imageSize,
    promptLength: finalPrompt.length,
    isEditMode,
    hasReferenceImages,
    partsCount: parts.length,
  });

  try {
    // 发送请求（同步等待）
    const startTime = Date.now();
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${APIYI_API_KEY}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeout),
    });

    const elapsed = (Date.now() - startTime) / 1000;
    console.log(`[APIYI] 请求耗时: ${elapsed.toFixed(1)} 秒`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[APIYI] 请求失败:', response.status, errorText);
      throw new Error(`APIYI API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();

    // 解析 Gemini 原生格式的响应
    if (!data.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data) {
      const finishReason = data.candidates?.[0]?.finishReason;
      if (finishReason && finishReason !== 'STOP') {
        console.error('[APIYI] 内容被拒绝:', finishReason);
        throw new Error(`Content rejected: ${finishReason}`);
      }
      console.error('[APIYI] 响应格式异常:', JSON.stringify(data).substring(0, 500));
      throw new Error('Invalid response format from APIYI');
    }

    const base64Data = data.candidates[0].content.parts[0].inlineData.data;
    const mimeType = data.candidates[0].content.parts[0].inlineData.mimeType || 'image/png';

    console.log(`✅ [APIYI] 生成成功！图片大小: ${(base64Data.length / 1024).toFixed(1)} KB`);

    // 🎯 关键修复：将 base64 图片上传到 R2，避免大数据通过 Server Action 传输
    // 原因：base64 数据约 4-6MB，通过 Server Action 返回会超过 Next.js middleware 的 10MB 限制
    // 解决：先上传到 R2 CDN，然后只缓存 CDN URL
    let finalImageUrl: string;

    try {
      const { getStorageServiceWithConfigs } = await import('@/shared/services/storage');
      const { getAllConfigs } = await import('@/shared/models/config');
      const { getUserInfo } = await import('@/shared/models/user');
      const { nanoid } = await import('nanoid');

      const user = await getUserInfo();
      const configs = await getAllConfigs();

      if (user && configs.r2_bucket_name && configs.r2_access_key) {
        console.log('[APIYI] 开始上传图片到 R2...');
        const storageService = getStorageServiceWithConfigs(configs);
        const timestamp = Date.now();
        const randomId = nanoid(8);
        const fileExtension = mimeType.includes('jpeg') || mimeType.includes('jpg') ? 'jpg' : 'png';
        const fileName = `${timestamp}_${randomId}.${fileExtension}`;
        const storageKey = `slides/${user.id}/${fileName}`;

        // 将 base64 转换为 Buffer 并上传
        const buffer = Buffer.from(base64Data, 'base64');
        const uploadResult = await storageService.uploadFile({
          body: buffer,
          key: storageKey,
          contentType: mimeType,
          disposition: 'inline',
        });

        if (uploadResult.success && uploadResult.url) {
          finalImageUrl = uploadResult.url;
          console.log(`[APIYI] ✅ 图片上传成功: ${finalImageUrl.substring(0, 60)}...`);
        } else {
          // 上传失败，降级使用 data URL（可能会导致大数据问题，但至少不会完全失败）
          console.warn('[APIYI] ⚠️ R2 上传失败，降级使用 data URL');
          finalImageUrl = `data:${mimeType};base64,${base64Data}`;
        }
      } else {
        // 未配置 R2，使用 data URL
        console.warn('[APIYI] ⚠️ R2 未配置，使用 data URL（可能导致大图片传输问题）');
        finalImageUrl = `data:${mimeType};base64,${base64Data}`;
      }
    } catch (uploadError: any) {
      // 上传异常，降级使用 data URL
      console.error('[APIYI] ⚠️ R2 上传异常:', uploadError.message);
      finalImageUrl = `data:${mimeType};base64,${base64Data}`;
    }

    // 返回特殊格式的 task_id
    const taskId = `apiyi-sync-${Date.now()}`;

    // 将结果存储到全局缓存中（现在存储的是 CDN URL 而非 data URL）
    apiyiResultCache.set(taskId, {
      status: 'SUCCESS',
      imageUrl: finalImageUrl,
      createdAt: Date.now(),
    });

    return { task_id: taskId };
  } catch (e: any) {
    if (e.name === 'TimeoutError' || e.name === 'AbortError') {
      console.error('[APIYI] 请求超时');
      throw new Error('APIYI request timeout');
    }
    console.error('[APIYI] Create Error:', e);
    throw e;
  }
}

/**
 * APIYI 结果缓存
 * 由于 APIYI 是同步 API，生成完成后直接返回结果
 * 这里用缓存存储结果，供 queryApiyiTaskAction 查询
 */
const apiyiResultCache = new Map<string, {
  status: 'SUCCESS' | 'FAILED';
  imageUrl?: string;
  error?: string;
  createdAt: number;
}>();

// 定期清理过期缓存（超过 10 分钟的缓存）
setInterval(() => {
  const now = Date.now();
  const expireTime = 10 * 60 * 1000; // 10 分钟
  for (const [key, value] of apiyiResultCache.entries()) {
    if (now - value.createdAt > expireTime) {
      apiyiResultCache.delete(key);
    }
  }
}, 60 * 1000); // 每分钟检查一次

/**
 * Query Task Status via APIYI (从缓存读取)
 *
 * 非程序员解释：
 * - APIYI 是同步 API，createApiyiTaskAction 已经完成了生成
 * - 这个函数只是从缓存中读取结果，立即返回
 */
export async function queryApiyiTaskAction(taskId: string) {
  // 从缓存中获取结果
  const cached = apiyiResultCache.get(taskId);

  if (!cached) {
    // 缓存不存在，可能已过期或 taskId 无效
    return {
      data: {
        status: 'FAILED',
        results: [],
        error: 'Task not found or expired',
      },
    };
  }

  if (cached.status === 'SUCCESS' && cached.imageUrl) {
    return {
      data: {
        status: 'SUCCESS',
        results: [cached.imageUrl],
      },
    };
  }

  return {
    data: {
      status: 'FAILED',
      results: [],
      error: cached.error || 'Unknown error',
    },
  };
}

/**
 * Create Image Generation Task with Load Balancing (三级机制 - 支持环境变量配置)
 *
 * 非程序员解释：
 * - 实现了三级降级策略，主力/托底顺序可通过环境变量快速切换
 * - 配置方式：在 .env.local 文件中修改 IMAGE_PROVIDER_PRIORITY
 * - 默认顺序：FAL -> KIE -> Replicate
 * - 切换示例：
 *   - 想让 KIE 做主力：IMAGE_PROVIDER_PRIORITY=KIE,FAL,Replicate
 *   - 想让 FAL 做主力：IMAGE_PROVIDER_PRIORITY=FAL,KIE,Replicate
 * - 优势：不需要改代码，重启服务后立即生效
 */
/**
 * Deck上下文信息 - 用于多页PPT生成时保持一致性
 */
export interface DeckContext {
  /** 当前是第几页（从1开始） */
  currentSlide: number;
  /** 总共多少页 */
  totalSlides: number;
  /** 第一张已生成的图片URL（作为视觉锚定参考） */
  anchorImageUrl?: string;
}

export async function createKieTaskWithFallbackAction(params: {
  prompt: string;
  styleId?: string;
  aspectRatio?: string;
  imageSize?: string;
  customImages?: string[];
  preferredProvider?: 'FAL' | 'Replicate' | 'KIE'; // 首选提供商
  isEnhancedMode?: boolean;
  isPromptEnhancedMode?: boolean;
  outputLanguage?: 'auto' | 'zh' | 'en';
  refundCredits?: number; // 失败时自动退还的积分数量
  /** Deck上下文：传递当前页码和总页数，帮助AI保持一致性 */
  deckContext?: DeckContext;
  /** 🎯 编辑模式：原始图片URL（用于局部编辑） */
  editImageUrl?: string;
  /** 🎯 编辑模式：mask 图片（Base64 或 URL） */
  maskImage?: string;
  /** 🎯 编辑模式：带标记的图片（降级方案） */
  markedImage?: string;
}) {
  const {
    preferredProvider,
    isEnhancedMode = true,
    isPromptEnhancedMode = true,
    outputLanguage = 'auto',
    refundCredits: refundAmount,
    deckContext,
    editImageUrl,
    maskImage,
    markedImage,
    ...taskParams
  } = params;

  // 预处理图片 URL，确保对所有提供商都是公网可访问的
  // 如果有锚定图片（第一张已生成的图片），将其添加到参考图片列表的最前面
  let customImagesWithAnchor = (taskParams.customImages || []).map(
    resolveImageUrl
  );

  // 首张锚定机制：如果不是第一张，且有锚定图片，则将其作为首要参考
  if (deckContext?.anchorImageUrl && deckContext.currentSlide > 1) {
    const anchorUrl = resolveImageUrl(deckContext.anchorImageUrl);
    // 将锚定图片放在最前面，确保AI优先参考
    customImagesWithAnchor = [anchorUrl, ...customImagesWithAnchor];
    console.log(
      `[一致性锚定] 第 ${deckContext.currentSlide}/${deckContext.totalSlides} 页使用首张作为风格锚定`
    );
  }

  const processedParams = {
    ...taskParams,
    isEnhancedMode,
    isPromptEnhancedMode,
    outputLanguage,
    customImages: customImagesWithAnchor,
    deckContext, // 传递deck上下文
    editImageUrl, // 🎯 传递编辑模式参数
    maskImage, // 🎯 传递 mask
    markedImage, // 🎯 传递带标记的图片
  };

  // 定义优先级顺序（从环境变量读取，可在 .env.local 中修改 IMAGE_PROVIDER_PRIORITY）
  // 非程序员解释：现在不需要改代码，只需要修改 .env.local 文件就能切换主力/托底顺序
  let providerChain = getProviderPriority();

  // 🎯 编辑模式判断逻辑优化
  // 1. 局部编辑：有原图 + 标记图
  // 2. 整体编辑：有原图（editImageUrl）
  // 3. 容错处理：如果 customImages 中只有一张图且没有 styleId，通常也是编辑行为
  const isEditMode = !!(editImageUrl || markedImage || (taskParams.customImages && taskParams.customImages.length === 1 && !params.styleId));

  // 🎯 2026-02-10 更新：KIE 的 nano-banana-pro 也支持编辑功能（通过 image_input 参数）
  // 因此编辑模式不再强制使用 FAL，而是按照环境变量配置的优先级顺序尝试
  // 只有 Replicate 不支持编辑模式，需要从链中移除
  if (isEditMode) {
    // 编辑模式下移除 Replicate（不支持编辑）
    providerChain = providerChain.filter(p => p !== 'Replicate');
    console.log(`\n🎨 编辑模式确认：${markedImage ? '局部标记编辑' : '整体效果编辑'}`);
    console.log(`📋 编辑模式可用提供商: ${providerChain.join(' -> ')}`);
  } else if (preferredProvider && providerChain.includes(preferredProvider)) {
    // 将首选 provider 移到第一位
    providerChain = [
      preferredProvider,
      ...providerChain.filter((p) => p !== preferredProvider),
    ];
  }

  console.log(`\n🎯 生成任务 - 优先级顺序: ${providerChain.join(' -> ')}`);

  // 🎯 记录主力提供商（优先级链的第一个）
  const primaryProvider = providerChain[0];

  let lastError: any = null;

  for (const provider of providerChain) {
    try {
      if (provider === 'FAL') {
        if (!FAL_KEY) {
          console.warn('⚠️ FAL Key 未配置，跳过');
          continue;
        }
        console.log(
          `🔄 [${provider === primaryProvider ? '主力' : '托底'}] 使用 FAL (nano-banana-pro)...`
        );
        const result = await createFalTaskAction(processedParams);
        console.log('✅ FAL 任务成功');
        return {
          ...result,
          fallbackUsed: provider !== primaryProvider,
        };
      } else if (provider === 'KIE') {
        if (!KIE_API_KEY) {
          console.warn('⚠️ KIE Key 未配置，跳过');
          continue;
        }
        console.log(
          `🔄 [${provider === primaryProvider ? '主力' : '托底'}] 使用 KIE (nano-banana-pro)...`
        );
        const result = await createKieTaskAction(processedParams);
        console.log('✅ KIE 任务创建成功:', result.task_id);
        return {
          success: true,
          task_id: result.task_id,
          provider: 'KIE',
          fallbackUsed: provider !== primaryProvider,
        };
      } else if (provider === 'Replicate') {
        if (!REPLICATE_API_TOKEN) {
          console.warn('⚠️ Replicate Token 未配置，跳过');
          continue;
        }
        console.log(
          `🔄 [${provider === primaryProvider ? '主力' : '托底'}] 使用 Replicate (nano-banana-pro)...`
        );
        const result = await createReplicateTaskAction(processedParams);
        console.log('✅ Replicate 任务成功');
        return {
          ...result,
          fallbackUsed: provider !== primaryProvider,
        };
      } else if (provider === 'APIYI') {
        if (!APIYI_API_KEY) {
          console.warn('⚠️ APIYI Key 未配置，跳过');
          continue;
        }
        console.log(
          `🔄 [${provider === primaryProvider ? '主力' : '托底'}] 使用 APIYI (gemini-3-pro-image)...`
        );
        const result = await createApiyiTaskAction(processedParams);
        console.log('✅ APIYI 任务成功:', result.task_id);
        return {
          success: true,
          task_id: result.task_id,
          provider: 'APIYI',
          fallbackUsed: provider !== primaryProvider,
        };
      }
    } catch (error: any) {
      console.warn(`⚠️ ${provider} 失败:`, error.message);
      lastError = error;

      // 🎯 编辑模式下记录详细错误，但继续尝试下一个提供商
      if (isEditMode) {
        console.error(`❌ 编辑模式 ${provider} 失败:`, error.message);
      }
      // 继续下一个 loop
    }
  }

  // 如果所有都失败了
  console.error(`❌ 所有图片生成服务都失败`);

  // 自动退还积分
  if (refundAmount && refundAmount > 0) {
    try {
      const user = await getSignUser();
      if (user) {
        console.log(`💰 生成失败，自动退还用户 ${refundAmount} 积分`);
        await refundCredits({
          userId: user.id,
          credits: refundAmount,
          description: 'Refund for failed PPT slide generation',
        });
      }
    } catch (refundError) {
      console.error('Failed to refund credits:', refundError);
    }
  }

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
  outputLanguage?: 'auto' | 'zh' | 'en';
  /** Deck上下文：传递当前页码信息以增强视觉一致性 */
  deckContext?: DeckContext;
  /** 🎯 编辑模式：原始图片URL（用于局部编辑） */
  editImageUrl?: string;
  /** 🎯 编辑模式：mask 图片（Base64 或 URL） */
  maskImage?: string;
  /** 🎯 编辑模式：带标记的图片（降级方案，用于不支持 mask 的模型） */
  markedImage?: string;
  /** 🎯 编辑模式：是否使用 inpainting 专用模型 */
  useInpaintingModel?: boolean;
}) {
  if (!FAL_KEY) {
    throw new Error('FAL API Key 未配置');
  }

  try {
    // 配置 FAL Client
    fal.config({
      credentials: FAL_KEY,
    });

    // 处理样式和视觉规范
    let styleSuffix = '';
    let visualSpecPrompt = '';

    if (params.styleId) {
      const style = PPT_STYLES.find((s) => s.id === params.styleId);
      if (style && params.isPromptEnhancedMode !== false) {
        styleSuffix = style.prompt;

        // 🎯 关键：如果风格有视觉规范，生成强制性的视觉约束提示词
        if (style.visualSpec) {
          visualSpecPrompt = generateVisualSpecPrompt(
            style.visualSpec,
            params.deckContext
              ? {
                  currentSlide: params.deckContext.currentSlide,
                  totalSlides: params.deckContext.totalSlides,
                }
              : undefined
          );
        }
      }
    }

    // 🎯 首张锚定提示词：如果不是第一张且有锚定图片
    const anchorPrompt = generateAnchorPrompt(
      params.deckContext?.currentSlide && params.deckContext.currentSlide > 1
        ? params.deckContext.anchorImageUrl
        : null
    );

    // 🎯 2026-02-10 更新：使用统一的语言检测和提示词生成函数
    // 这样可以确保 auto 模式下准确检测用户输入的语言，避免语言混乱
    const languagePrompt = generateLanguagePrompt(params.outputLanguage, params.prompt);

    // Content Strategy Prompt
    const contentStrategy = params.isEnhancedMode
      ? `\n\n[Content Enhancement Strategy]\nIf user provided content is detailed, use it directly. If content is simple/sparse, use your professional knowledge to expand on the subject to create a rich, complete slide, BUT you must STRICTLY preserve any specific data, numbers, and professional terms provided. Do NOT invent false data. For sparse content, use advanced layout techniques (grid, whitespace, font size) to fill the space professionally without forced filling.`
      : `\n\n[Strict Mode]\nSTRICTLY follow the provided text for Title and Content. Do NOT add, remove, or modify any words. Do NOT expand or summarize. Render the text exactly as given.`;

    // 🎯 构建最终提示词：内容 + 风格 + 视觉规范 + 锚定 + 策略 + 语言约束
    // 语言约束放在最后，确保 AI 优先遵守语言要求
    let finalPrompt =
      params.prompt +
      ' ' +
      styleSuffix +
      visualSpecPrompt +
      anchorPrompt +
      contentStrategy +
      languagePrompt;

    // 🎯 判断是否为编辑模式（有原图和mask）
    const isEditMode = !!(params.editImageUrl && params.maskImage);

    // 处理参考图片（编辑模式下不使用参考图）
    let referenceImages: string[] = [];

    if (!isEditMode) {
      // 只在非编辑模式下添加参考图
      referenceImages = (params.customImages || []).map(resolveImageUrl);

      if (params.styleId) {
        const style = PPT_STYLES.find((s) => s.id === params.styleId);
        if (style && style.refs && style.refs.length > 0) {
          const styleRefs = style.refs.map(resolveImageUrl);
          referenceImages = [...styleRefs, ...referenceImages];
        }
      }
    }

    const input: any = {
      prompt: finalPrompt,
      num_images: 1,
      aspect_ratio: params.aspectRatio === '16:9' ? '16:9' : 'auto',
      output_format: 'png',
      resolution: params.imageSize || '2K', // 支持 1K, 2K, 4K
    };

    let falModel = 'fal-ai/nano-banana-pro';

    if (isEditMode) {
      // 🎯 编辑模式：使用视觉标记方案（在图片上绘制选区框）
      // 因为 nano-banana-pro/edit 需要 image_urls 参数，不支持单独的 mask
      if (params.markedImage) {
        // 使用带标记的图片作为参考图
        falModel = 'fal-ai/nano-banana-pro/edit';
        input.image_urls = [params.markedImage];

        // 增强提示词：明确指出要编辑红框区域
        finalPrompt = `${finalPrompt}\n\n[重要编辑指令]\n图片中的红色框标记了需要修改的区域。请仅修改红框内的内容，保持红框外的所有元素不变。修改完成后，请移除所有红色标记框。`;

        console.log('[FAL] 🎨 编辑模式：使用视觉标记方案（红框标记编辑区域）');
        console.log('[FAL] 标记图片长度:', params.markedImage.length, '字符');
      } else {
        throw new Error('编辑模式需要带标记的图片');
      }
    } else if (referenceImages.length > 0) {
      // 🎯 参考图模式：使用 edit 模型 + 参考图（非局部编辑）
      falModel = 'fal-ai/nano-banana-pro/edit';
      const limitedImages = referenceImages.slice(0, 8);
      finalPrompt +=
        '（视觉风格参考：请严格遵循所提供参考图的设计风格、配色方案和构图布局）';
      console.log(`[FAL] 使用 ${limitedImages.length} 张参考图`);
      input.image_urls = limitedImages;
    }

    console.log('[FAL] 请求参数:', {
      model: falModel,
      prompt: input.prompt.substring(0, 100) + '...',
      hasReferenceImages: referenceImages.length > 0,
      isEditMode: isEditMode,
    });

    const startTime = Date.now();
    const maxRetries = 2; // 最大重试次数
    let attempt = 0;
    let result: any;

    while (attempt <= maxRetries) {
      try {
        // 使用 subscribe 等待结果
        result = await fal.subscribe(falModel, {
          input,
          logs: true,
          onQueueUpdate: (update: any) => {
            if (update.status === 'IN_PROGRESS') {
              // update.logs.map((log) => log.message).forEach(console.log);
            }
          },
        });
        // 如果成功，跳出重试循环
        break;
      } catch (error: any) {
        attempt++;
        // 只有在网络错误（fetch failed）或服务器 5xx 错误时才重试
        const isNetworkError =
          error.message?.includes('fetch failed') ||
          error.status >= 500 ||
          error.status === 429; // 429 也值得重试

        if (attempt <= maxRetries && isNetworkError) {
          console.warn(
            `⚠️ [FAL] 第 ${attempt} 次尝试失败 (${error.message})，正在进行第 ${
              attempt + 1
            } 次重试...`
          );
          // 指数退避：第一次重试等 1s，第二次重试等 2s
          await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
          continue;
        }

        // 记录失败日志并抛出错误，触发 providerChain 的托底逻辑
        console.error('❌ FAL 失败:', error.message);
        if (error.body) {
          console.error('[FAL] 错误详情:', JSON.stringify(error.body, null, 2));
        }
        if (error.status) {
          console.error('[FAL] HTTP 状态码:', error.status);
        }
        throw error;
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[FAL] API 调用完成，总耗时: ${elapsed}s (尝试次数: ${attempt + 1})`);

    // 返回生成结果
    if (!result || !result.data || !result.data.images || result.data.images.length === 0) {
      throw new Error('FAL API 未返回有效的图片结果');
    }

    const tempImageUrl = result.data.images[0].url;
    console.log('[FAL] ✅ 生成成功:', tempImageUrl.substring(0, 60) + '...');

    // 🎯 2026-02-13 修复：同步等待 R2 上传完成，直接返回永久链接
    // 原因：后台异步更新数据库的方案太复杂且容易出问题（React 状态更新异步、presentationId 可能为空等）
    // 新方案：牺牲几秒等待时间，换取数据一致性和可靠性
    let finalImageUrl = tempImageUrl;
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
        console.log('[FAL] 开始同步保存图片到 R2...');
        const storageService = getStorageServiceWithConfigs(configs);
        const timestamp = Date.now();
        const randomId = nanoid(8);
        const fileExtension = tempImageUrl.includes('.jpg') ? 'jpg' : 'png';
        const fileName = `${timestamp}_${randomId}.${fileExtension}`;
        const storageKey = `slides/${user.id}/${fileName}`;

        const uploadResult = await storageService.downloadAndUpload({
          url: tempImageUrl,
          key: storageKey,
          contentType: `image/${fileExtension}`,
          disposition: 'inline',
        });

        if (uploadResult.success && uploadResult.url) {
          finalImageUrl = uploadResult.url;
          console.log(`[FAL] ✅ 图片已保存到 R2: ${finalImageUrl.substring(0, 60)}...`);
        } else {
          console.warn('[FAL] ⚠️ R2 上传失败，使用临时链接:', uploadResult.error);
        }
      }
    } catch (saveError) {
      console.error('[FAL] R2 保存异常，使用临时链接:', saveError);
    }

    return {
      imageUrl: finalImageUrl,
      prompt: params.prompt,
    };
  } catch (error: any) {
    console.error('[FAL] ❌ createFalTaskAction 错误:', error.message);
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
  outputLanguage?: 'auto' | 'zh' | 'en';
  /** Deck上下文：传递当前页码信息以增强视觉一致性 */
  deckContext?: DeckContext;
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

    // 处理样式和视觉规范
    let styleSuffix = '';
    let visualSpecPrompt = '';

    if (params.styleId) {
      const style = PPT_STYLES.find((s) => s.id === params.styleId);
      if (style && params.isPromptEnhancedMode !== false) {
        styleSuffix = style.prompt;

        // 🎯 关键：如果风格有视觉规范，生成强制性的视觉约束提示词
        if (style.visualSpec) {
          visualSpecPrompt = generateVisualSpecPrompt(
            style.visualSpec,
            params.deckContext
              ? {
                  currentSlide: params.deckContext.currentSlide,
                  totalSlides: params.deckContext.totalSlides,
                }
              : undefined
          );
        }
      }
    }

    // 🎯 首张锚定提示词
    const anchorPrompt = generateAnchorPrompt(
      params.deckContext?.currentSlide && params.deckContext.currentSlide > 1
        ? params.deckContext.anchorImageUrl
        : null
    );

    // 🎯 2026-02-10 更新：使用统一的语言检测和提示词生成函数
    // 这样可以确保 auto 模式下准确检测用户输入的语言，避免语言混乱
    const languagePrompt = generateLanguagePrompt(params.outputLanguage, params.prompt);

    // Content Strategy Prompt
    const contentStrategy = params.isEnhancedMode
      ? `\n\n[Content Enhancement Strategy]\nIf user provided content is detailed, use it directly. If content is simple/sparse, use your professional knowledge to expand on the subject to create a rich, complete slide, BUT you must STRICTLY preserve any specific data, numbers, and professional terms provided. Do NOT invent false data. For sparse content, use advanced layout techniques (grid, whitespace, font size) to fill the space professionally without forced filling.`
      : `\n\n[Strict Mode]\nSTRICTLY follow the provided text for Title and Content. Do NOT add, remove, or modify any words. Do NOT expand or summarize. Render the text exactly as given.`;

    // 🎯 构建最终提示词：内容 + 风格 + 视觉规范 + 锚定 + 策略 + 语言约束
    // 语言约束放在最后，确保 AI 优先遵守语言要求
    let finalPrompt =
      params.prompt +
      ' ' +
      styleSuffix +
      visualSpecPrompt +
      anchorPrompt +
      contentStrategy +
      languagePrompt;

    // 处理参考图片
    let referenceImages = (params.customImages || []).map(resolveImageUrl);

    if (params.styleId) {
      const style = PPT_STYLES.find((s) => s.id === params.styleId);
      if (style && style.refs && style.refs.length > 0) {
        const styleRefs = style.refs.map(resolveImageUrl);
        referenceImages = [...styleRefs, ...referenceImages];
      }
    }

    if (referenceImages.length > 0) {
      // nano-banana-pro 支持多图融合，最多8张
      const limitedImages = referenceImages.slice(0, 8);
      finalPrompt +=
        '（视觉风格参考：请严格遵循所提供参考图的设计风格、配色方案和构图布局）';
      console.log(
        `[Replicate] 使用 ${limitedImages.length} 张参考图:`,
        limitedImages
      );
    }

    // 调用 Replicate API
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
      wait: { mode: 'poll', interval: 2000 }, // 每 2 秒检查一次状态
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
      console.log(
        '[Replicate] ✓ 输出是字符串类型，长度:',
        (output as string).length
      );
      imageUrl = output;
    } else if (Array.isArray(output)) {
      console.log(
        '[Replicate] ✓ 输出是数组，长度:',
        (output as any[]).length,
        ', 第一项类型:',
        typeof (output as any[])[0]
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

    // 🎯 2026-02-13 修复：同步等待 R2 上传完成，直接返回永久链接
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
        console.log('[Replicate] 开始同步保存图片到 R2...');
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
          finalImageUrl = uploadResult.url;
          console.log(`[Replicate] ✅ 图片已保存到 R2: ${finalImageUrl.substring(0, 60)}...`);
        } else {
          console.warn('[Replicate] ⚠️ R2 上传失败，使用临时链接:', uploadResult.error);
        }
      }
    } catch (saveError: any) {
      console.error('[Replicate] R2 保存异常，使用临时链接:', saveError);
    }

    // 返回类似KIE的格式，但标记为同步结果
    const result = {
      success: true,
      task_id: `replicate-${Date.now()}`,
      provider: 'Replicate',
      fallbackUsed: false,
      imageUrl: finalImageUrl, // 返回 R2 永久链接
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
 * - 这个函数查询任务状态，支持KIE、Replicate、FAL和APIYI
 * - 对于Replicate和FAL的同步结果，直接返回成功状态
 * - 对于APIYI的同步结果，从缓存中读取图片数据
 * - ✅ 2026-02-13 修复：KIE 任务成功后同步上传到 R2，返回永久链接
 */
export async function queryKieTaskWithFallbackAction(
  taskId: string,
  provider?: string
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

  // 如果是APIYI的任务（同步API），从缓存中读取结果
  if (provider === 'APIYI' || taskId.startsWith('apiyi-sync-')) {
    return await queryApiyiTaskAction(taskId);
  }

  // 否则使用原来的KIE查询逻辑
  const result = await queryKieTaskAction(taskId);

  // 🎯 2026-02-13 修复：如果任务成功且有结果，同步上传到 R2 并返回永久链接
  if (
    result?.data?.status === 'SUCCESS' &&
    result.data.results &&
    result.data.results.length > 0
  ) {
    const originalResults = [...result.data.results];
    const r2Results: string[] = [];

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
        console.log(
          `[KIE] 开始同步保存 ${originalResults.length} 张图片到 R2`
        );
        const storageService = getStorageServiceWithConfigs(configs);

        for (let index = 0; index < originalResults.length; index++) {
          const imageUrl = originalResults[index];
          try {
            const timestamp = Date.now();
            const randomId = nanoid(8);
            const fileExtension =
              imageUrl.includes('.jpg') || imageUrl.includes('.jpeg')
                ? 'jpg'
                : 'png';
            const fileName = `${timestamp}_${randomId}_${index}.${fileExtension}`;
            const storageKey = `slides/${user.id}/${fileName}`;

            const uploadResult = await storageService.downloadAndUpload({
              url: imageUrl,
              key: storageKey,
              contentType: `image/${fileExtension}`,
              disposition: 'inline',
            });

            if (uploadResult.success && uploadResult.url) {
              r2Results.push(uploadResult.url);
              console.log(`[KIE] ✅ 图片 ${index + 1} 已保存到 R2`);
            } else {
              r2Results.push(imageUrl); // 失败时使用原始链接
              console.warn(`[KIE] ⚠️ 图片 ${index + 1} R2 上传失败，使用临时链接`);
            }
          } catch (e) {
            r2Results.push(imageUrl); // 异常时使用原始链接
            console.error(`[KIE] 保存第 ${index + 1} 张失败`, e);
          }
        }
        console.log(`[KIE] ✅ 图片保存完成`);
      } else {
        // 没有 R2 配置，使用原始链接
        r2Results.push(...originalResults);
      }
    } catch (error) {
      console.error('[KIE] R2 保存异常，使用临时链接', error);
      r2Results.push(...originalResults);
    }

    // 返回 R2 永久链接
    return {
      data: {
        status: 'SUCCESS',
        results: r2Results,
      },
    };
  }

  return result;
}

/**
 * 真正的 Inpainting 局部编辑 - 使用 APIYI (Gemini 3 Pro Image)
 *
 * 核心优势：
 * - 使用 APIYI 的 gemini-3-pro-image-preview 模型
 * - 通过原图 + mask 图片精确指定需要修改的区域（白色=修改，黑色=保持）
 * - 非编辑区域像素级保持不变，不会出现模糊或变形
 *
 * 工作流程：
 * 1. 前端根据用户框选区域生成 mask 图片（白色矩形=选中区域）
 * 2. 前端将 mask 上传到 R2 获取 URL
 * 3. 调用此函数，传入原图 URL + mask URL + 修改描述
 * 4. Gemini 模型根据 mask 只重新生成白色区域，其他区域完全保持原样
 *
 * @param params 编辑参数
 * @returns 编辑后的图片 URL
 */
export async function editImageWithInpaintingAction(params: {
  /** 待编辑的原图 URL */
  imageUrl: string;
  /** mask 图片 URL（白色=需要修改的区域，黑色=保持不变） */
  maskUrl: string;
  /** 修改描述（描述要在选中区域生成什么内容） */
  prompt: string;
  /** 分辨率 */
  resolution?: string;
  /** 宽高比 */
  aspectRatio?: string;
}) {
  'use server';

  if (!APIYI_API_KEY) {
    throw new Error('APIYI API Key 未配置');
  }

  console.log('\n========== Inpainting 局部编辑 (APIYI Gemini) ==========');
  console.log('[Inpaint] 原图:', params.imageUrl);
  console.log('[Inpaint] Mask:', params.maskUrl);
  console.log('[Inpaint] 提示词:', params.prompt);

  try {
    // 处理图片 URL，确保公网可访问
    const imageUrl = resolveImageUrl(params.imageUrl);
    const maskUrl = resolveImageUrl(params.maskUrl);

    console.log('[Inpaint] 处理后的原图 URL:', imageUrl);
    console.log('[Inpaint] 处理后的 Mask URL:', maskUrl);

    // 🎯 下载原图和 mask 图片转为 base64（Gemini 原生格式需要）
    console.log('[Inpaint] 开始下载原图和 mask...');
    const [originalImageData, maskImageData] = await Promise.all([
      downloadImageAsBase64ForApiyi(imageUrl),
      downloadImageAsBase64ForApiyi(maskUrl),
    ]);

    if (!originalImageData) {
      throw new Error('无法下载原图');
    }
    if (!maskImageData) {
      throw new Error('无法下载 mask 图片');
    }

    console.log(`[Inpaint] 原图大小: ${(originalImageData.base64.length / 1024).toFixed(1)} KB`);
    console.log(`[Inpaint] Mask大小: ${(maskImageData.base64.length / 1024).toFixed(1)} KB`);

    // 🎯 构建 Gemini 原生格式的 inpainting 请求
    // 提示词需要明确说明这是局部编辑任务
    const inpaintPrompt = `【图片局部编辑任务】

你需要对这张图片进行精确的局部修改。

【重要规则】
1. 我提供了两张图片：第一张是原图，第二张是 mask（遮罩）
2. mask 中白色区域是需要修改的部分，黑色区域必须保持完全不变
3. 只修改白色区域的内容，其他所有区域必须像素级保持原样
4. 修改后的内容要与周围环境自然融合

【修改要求】
${params.prompt}

【执行要求】
- 严格按照 mask 白色区域修改，不要超出范围
- 黑色区域的任何元素（文字、图形、背景）都不能改变
- 输出完整的修改后图片`;

    // 构建请求体（Gemini 原生格式）
    const parts: any[] = [
      { text: inpaintPrompt },
      // 原图
      {
        inline_data: {
          mime_type: originalImageData.mimeType,
          data: originalImageData.base64,
        },
      },
      // Mask 图片
      {
        inline_data: {
          mime_type: maskImageData.mimeType,
          data: maskImageData.base64,
        },
      },
    ];

    const payload = {
      contents: [{ parts }],
      generationConfig: {
        responseModalities: ['IMAGE'],
        imageConfig: {
          aspectRatio: params.aspectRatio || '16:9',
          imageSize: params.resolution || '2K',
        },
      },
    };

    console.log('[Inpaint] APIYI 请求参数:', {
      model: 'gemini-3-pro-image-preview',
      promptLength: inpaintPrompt.length,
      aspectRatio: params.aspectRatio,
      resolution: params.resolution,
      partsCount: parts.length,
    });

    // 发送请求
    const startTime = Date.now();
    const timeout = 300000; // 5 分钟超时

    console.log('[Inpaint] 开始调用 APIYI API...');
    const response = await fetch(APIYI_TEXT2IMG_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${APIYI_API_KEY}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeout),
    });

    const elapsed = (Date.now() - startTime) / 1000;
    console.log(`[Inpaint] APIYI 请求耗时: ${elapsed.toFixed(1)} 秒`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Inpaint] APIYI 请求失败:', response.status, errorText);
      throw new Error(`APIYI API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();

    // 解析 Gemini 原生格式的响应
    if (!data.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data) {
      const finishReason = data.candidates?.[0]?.finishReason;
      if (finishReason && finishReason !== 'STOP') {
        console.error('[Inpaint] 内容被拒绝:', finishReason);
        throw new Error(`Content rejected: ${finishReason}`);
      }
      console.error('[Inpaint] 响应格式异常:', JSON.stringify(data).substring(0, 500));
      throw new Error('Invalid response format from APIYI');
    }

    const base64Data = data.candidates[0].content.parts[0].inlineData.data;
    const mimeType = data.candidates[0].content.parts[0].inlineData.mimeType || 'image/png';

    console.log(`[Inpaint] ✅ APIYI 生成成功！图片大小: ${(base64Data.length / 1024).toFixed(1)} KB`);

    // 🎯 将编辑后的图片上传到 R2，返回永久链接
    let finalImageUrl: string;

    try {
      const { getStorageServiceWithConfigs } = await import('@/shared/services/storage');
      const { getAllConfigs } = await import('@/shared/models/config');
      const { getUserInfo } = await import('@/shared/models/user');
      const { nanoid } = await import('nanoid');

      const user = await getUserInfo();
      const configs = await getAllConfigs();

      if (user && configs.r2_bucket_name && configs.r2_access_key) {
        console.log('[Inpaint] 开始上传图片到 R2...');
        const storageService = getStorageServiceWithConfigs(configs);
        const timestamp = Date.now();
        const randomId = nanoid(8);
        const fileExtension = mimeType.includes('jpeg') || mimeType.includes('jpg') ? 'jpg' : 'png';
        const fileName = `${timestamp}_${randomId}.${fileExtension}`;
        const storageKey = `infographic-edits/${user.id}/${fileName}`;

        // 将 base64 转换为 Buffer 并上传
        const buffer = Buffer.from(base64Data, 'base64');
        const uploadResult = await storageService.uploadFile({
          body: buffer,
          key: storageKey,
          contentType: mimeType,
          disposition: 'inline',
        });

        if (uploadResult.success && uploadResult.url) {
          finalImageUrl = uploadResult.url;
          console.log(`[Inpaint] ✅ 图片已保存到 R2: ${finalImageUrl.substring(0, 60)}...`);
        } else {
          console.warn('[Inpaint] ⚠️ R2 上传失败，使用 data URL');
          finalImageUrl = `data:${mimeType};base64,${base64Data}`;
        }
      } else {
        console.warn('[Inpaint] ⚠️ R2 未配置，使用 data URL');
        finalImageUrl = `data:${mimeType};base64,${base64Data}`;
      }
    } catch (uploadError: any) {
      console.error('[Inpaint] ⚠️ R2 上传异常:', uploadError.message);
      finalImageUrl = `data:${mimeType};base64,${base64Data}`;
    }

    return {
      imageUrl: finalImageUrl,
      success: true,
      provider: 'APIYI-Gemini' as const,
    };
  } catch (error: any) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') {
      console.error('[Inpaint] ❌ APIYI 请求超时');
      throw new Error('APIYI request timeout');
    }
    console.error('[Inpaint] ❌ editImageWithInpaintingAction 错误:', error.message);
    throw error;
  }
}

/**
 * 局部编辑 - 整图重生成方案
 *
 * 工作流程：
 * 1. 将原图和坐标信息一起发给 AI
 * 2. AI 根据坐标提示词修改指定区域
 * 3. 返回完整的修改后图片
 *
 * 注意：此方案可能导致非编辑区域有细微变化，但不会有拼接感
 *
 * @param params 编辑参数
 * @returns 编辑后的图片 URL
 */
export async function editImageRegionAction(params: {
  /** 待编辑的原图 URL */
  imageUrl: string;
  /** 选区列表（支持多选框） */
  regions: Array<{
    /** 选区标签（如 A, B, C） */
    label: string;
    /** 归一化坐标 0-1 */
    x: number;
    y: number;
    width: number;
    height: number;
    /** 该选区的修改描述 */
    note: string;
  }>;
  /** 图片宽度（像素） */
  imageWidth: number;
  /** 图片高度（像素） */
  imageHeight: number;
  /** 分辨率 */
  resolution?: string;
  /** 🎯 宽高比（必须传递，确保编辑后保持原比例） */
  aspectRatio: string;
}) {
  'use server';

  if (!APIYI_API_KEY) {
    throw new Error('APIYI API Key 未配置');
  }

  console.log('\n========== 局部编辑 (APIYI Gemini) ==========');
  console.log('[Edit] 原图:', params.imageUrl);
  console.log('[Edit] 选区数量:', params.regions.length);
  console.log('[Edit] 图片尺寸:', params.imageWidth, 'x', params.imageHeight);
  console.log('[Edit] 宽高比:', params.aspectRatio);

  try {
    // 🎯 构建坐标信息提示词
    const regionPrompts = params.regions.map((region) => {
      const pixelX = Math.round(region.x * params.imageWidth);
      const pixelY = Math.round(region.y * params.imageHeight);
      const pixelWidth = Math.round(region.width * params.imageWidth);
      const pixelHeight = Math.round(region.height * params.imageHeight);
      const pixelX2 = pixelX + pixelWidth;
      const pixelY2 = pixelY + pixelHeight;

      const percentX = Math.round(region.x * 100);
      const percentY = Math.round(region.y * 100);
      const percentWidth = Math.round(region.width * 100);
      const percentHeight = Math.round(region.height * 100);

      return `【区域 ${region.label}】
位置：从左上角 (${percentX}%, ${percentY}%) 到 (${percentX + percentWidth}%, ${percentY + percentHeight}%)
像素坐标：左上 (${pixelX}, ${pixelY}) 右下 (${pixelX2}, ${pixelY2})
尺寸：${pixelWidth}×${pixelHeight} 像素
修改要求：${region.note || '保持不变'}`;
    }).join('\n\n');

    const finalPrompt = `【图片局部编辑任务】

你需要对这张图片进行精确的局部修改。

【重要规则】
1. 只修改下面指定的区域，其他所有区域必须保持完全不变
2. 保持图片的整体风格、配色、质感一致
3. 修改后的内容要与周围环境自然融合

【需要修改的区域】
${regionPrompts}

【执行要求】
- 严格按照坐标范围修改，不要超出指定区域
- 区域外的任何元素（文字、图形、背景）都不能改变
- 输出完整的修改后图片`;

    console.log('[Edit] 最终提示词:\n', finalPrompt);

    // 🎯 处理图片 URL 并下载为 base64
    const imageUrl = resolveImageUrl(params.imageUrl);
    console.log('[Edit] 处理后的图片 URL:', imageUrl);

    console.log('[Edit] 开始下载原图...');
    const imageData = await downloadImageAsBase64ForApiyi(imageUrl);
    if (!imageData) {
      throw new Error('无法下载原图');
    }
    console.log(`[Edit] 原图大小: ${(imageData.base64.length / 1024).toFixed(1)} KB`);

    // 🎯 构建 Gemini 原生格式请求
    const parts: any[] = [
      { text: finalPrompt },
      {
        inline_data: {
          mime_type: imageData.mimeType,
          data: imageData.base64,
        },
      },
    ];

    const payload = {
      contents: [{ parts }],
      generationConfig: {
        responseModalities: ['IMAGE'],
        imageConfig: {
          aspectRatio: params.aspectRatio || '16:9',
          imageSize: params.resolution || '2K',
        },
      },
    };

    console.log('[Edit] APIYI 请求参数:', {
      model: 'gemini-3-pro-image-preview',
      promptLength: finalPrompt.length,
      aspectRatio: params.aspectRatio,
      resolution: params.resolution,
    });

    const startTime = Date.now();
    const timeout = 300000;

    console.log('[Edit] 开始调用 APIYI API...');
    const response = await fetch(APIYI_TEXT2IMG_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${APIYI_API_KEY}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeout),
    });

    const elapsed = (Date.now() - startTime) / 1000;
    console.log(`[Edit] APIYI 请求耗时: ${elapsed.toFixed(1)} 秒`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Edit] APIYI 请求失败:', response.status, errorText);
      throw new Error(`APIYI API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();

    if (!data.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data) {
      const finishReason = data.candidates?.[0]?.finishReason;
      if (finishReason && finishReason !== 'STOP') {
        console.error('[Edit] 内容被拒绝:', finishReason);
        throw new Error(`Content rejected: ${finishReason}`);
      }
      console.error('[Edit] 响应格式异常:', JSON.stringify(data).substring(0, 500));
      throw new Error('Invalid response format from APIYI');
    }

    const base64Data = data.candidates[0].content.parts[0].inlineData.data;
    const mimeType = data.candidates[0].content.parts[0].inlineData.mimeType || 'image/png';

    console.log(`[Edit] ✅ APIYI 生成成功！图片大小: ${(base64Data.length / 1024).toFixed(1)} KB`);

    // 🎯 将编辑后的图片上传到 R2
    let finalImageUrl: string;

    try {
      const { getStorageServiceWithConfigs } = await import('@/shared/services/storage');
      const { getAllConfigs } = await import('@/shared/models/config');
      const { getUserInfo } = await import('@/shared/models/user');
      const { nanoid } = await import('nanoid');

      const user = await getUserInfo();
      const configs = await getAllConfigs();

      if (user && configs.r2_bucket_name && configs.r2_access_key) {
        console.log('[Edit] 开始上传图片到 R2...');
        const storageService = getStorageServiceWithConfigs(configs);
        const timestamp = Date.now();
        const randomId = nanoid(8);
        const fileExtension = mimeType.includes('jpeg') || mimeType.includes('jpg') ? 'jpg' : 'png';
        const fileName = `${timestamp}_${randomId}.${fileExtension}`;
        const storageKey = `infographic-edits/${user.id}/${fileName}`;

        const buffer = Buffer.from(base64Data, 'base64');
        const uploadResult = await storageService.uploadFile({
          body: buffer,
          key: storageKey,
          contentType: mimeType,
          disposition: 'inline',
        });

        if (uploadResult.success && uploadResult.url) {
          finalImageUrl = uploadResult.url;
          console.log(`[Edit] ✅ 图片已保存到 R2: ${finalImageUrl.substring(0, 60)}...`);
        } else {
          console.warn('[Edit] ⚠️ R2 上传失败，使用 data URL');
          finalImageUrl = `data:${mimeType};base64,${base64Data}`;
        }
      } else {
        console.warn('[Edit] ⚠️ R2 未配置，使用 data URL');
        finalImageUrl = `data:${mimeType};base64,${base64Data}`;
      }
    } catch (uploadError: any) {
      console.error('[Edit] ⚠️ R2 上传异常:', uploadError.message);
      finalImageUrl = `data:${mimeType};base64,${base64Data}`;
    }

    return {
      imageUrl: finalImageUrl,
      success: true,
      provider: 'APIYI-Gemini' as const,
    };
  } catch (error: any) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') {
      console.error('[Edit] ❌ APIYI 请求超时');
      throw new Error('APIYI request timeout');
    }
    console.error('[Edit] ❌ editImageRegionAction 错误:', error.message);
    throw error;
  }
}

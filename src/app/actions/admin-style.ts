'use server';

import fs from 'fs/promises';
import path from 'path';

import {
  PPT_STYLES,
  PPTStyle,
  VisualSpecification,
} from '@/config/aippt-slides2';
import { getStorageService } from '@/shared/services/storage';

import { createKieTaskAction, queryKieTaskAction } from './aippt';

const CONFIG_FILE_PATH = path.join(
  process.cwd(),
  'src/config/aippt-slides2.ts'
);
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';

/**
 * 辅助函数：将远程图片下载并上传到我们的存储
 */
async function downloadAndUploadImage(
  url: string,
  targetKey: string
): Promise<string> {
  try {
    const response = await fetch(url);
    const buffer = Buffer.from(await response.arrayBuffer());
    const storageService = await getStorageService();
    const result = await storageService.uploadFile({
      body: buffer,
      key: targetKey,
      contentType: response.headers.get('content-type') || 'image/png',
      disposition: 'inline',
    });
    if (result.success && result.url) {
      return result.url;
    }
    return url;
  } catch (error) {
    console.error('Failed to sync image to storage:', error);
    return url;
  }
}

/**
 * 分析风格逻辑 (OpenRouter/Gemini)
 */
export async function analyzeStyleAction(imageUrls: string[]): Promise<{
  prompt: string;
  visualSpec: VisualSpecification;
}> {
  if (!OPENROUTER_API_KEY) {
    throw new Error('OpenRouter API Key 未配置');
  }

  const prompt = `你是一位顶级的 UI/UX 设计师和 AI 提示词工程师。
请分析上传的 PPT 风格图片，并输出符合以下 TypeScript 接口定义的详细描述：

1. 提示词 (prompt): 一段简洁有力的自然语言描述，描述风格的核心特征（如：科技蓝、极简主义、3D黏土等），语气为“你是一位专家级UI、UX演示设计师...”。
2. 视觉规范 (visualSpec): 包含具体的排版、配色、背景、容器、效果等参数。

输出格式要求：直接输出 JSON 格式，不要包含 Markdown 代码块标记。
JSON 结构：
{
  "prompt": "你是一位专家级UI、UX演示设计师，请根据参考图风格生成一套幻灯片。强调 [核心特征描述]。",
  "visualSpec": {
    "header": { "position": "top-left", "fontSize": "42-48px", "fontWeight": "bold", "color": "#HEX", "fontFamily": "..." },
    "background": { "type": "solid", "value": "#HEX", "texture": "..." },
    "body": { "fontSize": "16-18px", "lineHeight": "1.5", "color": "#HEX", "fontFamily": "..." },
    "accentColor": "#HEX",
    "secondaryColor": "#HEX",
    "container": { "borderRadius": "12px", "backgroundColor": "#HEX", "shadow": "..." }
  }
}`;

  try {
    const response = await fetch(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'google/gemini-3-flash-preview', // 用户指定使用 gemini-3-flash-preview
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: prompt },
                ...imageUrls.map((url) => ({
                  type: 'image_url',
                  image_url: { url },
                })),
              ],
            },
          ],
        }),
      }
    );

    const data = await response.json();
    const content = data.choices[0].message.content.trim();
    // 尝试解析 JSON
    const cleanJson = content
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim();
    return JSON.parse(cleanJson);
  } catch (error) {
    console.error('Style analysis failed:', error);
    throw new Error('分析风格失败，请稍后再试');
  }
}

/**
 * 生成预览图 (KIE)
 *
 * 非程序员解释：
 * - 这个函数用于生成风格预览图，用于验证风格还原度
 * - 可以自定义主题内容，但会套用参考图的视觉风格
 * - 强调生成新内容，而不是直接复刻参考图
 */
export async function generateAdminStylePreviewAction(params: {
  prompt: string;
  imageUrls: string[];
  previewTheme?: string; // 可自定义的预览主题，默认为"Studyhacks产品介绍"
}) {
  // 使用自定义主题或默认主题
  const theme =
    params.previewTheme || 'Studyhacks: Learn Anything Faster than Ever';
  // 构建明确的生成提示词
  // 主题：使用自定义主题或默认主题
  // 风格：套用参考图的视觉风格（配色、布局、字体等），但内容要全新
  const contentPrompt = `【核心任务】请生成一张全新的"${theme}"PPT封面图。

【内容主题】
- 主题：${theme}
- 请根据主题内容，设计合适的标题、副标题和核心信息
- 设计风格：现代、专业、科技感

【风格参考要求 - 重要】
- 参考图仅作为视觉风格参考（配色、字体风格、布局结构、装饰元素风格等）
- 必须基于"Studyhacks产品介绍"主题创作全新的封面设计
- 禁止直接复制或复刻参考图的内容、文字、图标或具体布局
- 只学习参考图的"设计DNA"（如配色方案、视觉质感、排版风格），但内容必须完全原创
- 参考图的作用是告诉你"应该用什么风格"，而不是"应该画什么内容"

【生成原则】
- 保持参考图的视觉风格一致性（配色、字体、质感）
- 但内容、布局、元素必须围绕"Studyhacks产品介绍"主题全新创作`;

  // 将风格提示词与内容提示词结合
  // 注意：createKieTaskAction 会在最后追加参考图提示，但我们的明确指令应该优先
  const finalPrompt = `${contentPrompt}\n\n【风格描述】${params.prompt}`;

  return await createKieTaskAction({
    prompt: finalPrompt,
    customImages: params.imageUrls,
    aspectRatio: '16:9',
    imageSize: '2K',
  });
}

/**
 * 查询 KIE 任务状态
 */
export async function queryKieTaskStatusAction(taskId: string) {
  try {
    const result = await queryKieTaskAction(taskId);
    console.log(
      `[Admin Style] Query Task ${taskId} Result:`,
      JSON.stringify(result, null, 2)
    );

    // 适配 aippt.ts 中 queryKieTaskAction 的返回结构
    if (result.data) {
      return {
        status:
          result.data.status === 'SUCCESS'
            ? 'completed'
            : result.data.status === 'FAILED'
              ? 'failed'
              : 'processing',
        imageUrl: result.data.results?.[0] || null,
      };
    }

    // 兼容可能直接返回 data 的情况
    return {
      status:
        result.state === 'success'
          ? 'completed'
          : result.state === 'fail'
            ? 'failed'
            : 'processing',
      imageUrl: null,
    };
  } catch (error) {
    console.error('[Admin Style] Query Status Error:', error);
    return { status: 'failed' };
  }
}

/**
 * 获取当前所有风格 (从配置文件实时读取)
 */
export async function getStylesAction(): Promise<PPTStyle[]> {
  try {
    const fileContent = await fs.readFile(CONFIG_FILE_PATH, 'utf-8');
    const startTag = 'export const PPT_STYLES: PPTStyle[] = [';
    const endTag = '];';

    const startIndex = fileContent.indexOf(startTag);
    const endIndex = fileContent.lastIndexOf(endTag);

    if (startIndex === -1 || endIndex === -1) return [];

    const stylesCode = fileContent.substring(
      startIndex + startTag.length - 1,
      endIndex + 1
    );

    // 注意：这里用 eval 或类似手段解析 TS 数组比较危险且复杂
    // 最简单的方法是直接返回导入的常量，但在开发环境下如果文件变了，导入的常量可能不会立即更新
    // 既然是在后台管理，我们可以尝试解析简单的 JSON 部分，或者直接使用 import
    return PPT_STYLES;
  } catch (error) {
    return PPT_STYLES;
  }
}

/**
 * 保存风格到配置文件
 */
export async function saveStyleToConfigAction(style: PPTStyle) {
  try {
    // 将预览图从 KIE 同步到我们的存储 (如果它还在外部)
    if (style.preview.includes('kie.ai')) {
      const ext = style.preview.split('.').pop()?.split('?')[0] || 'png';
      // 找到参考图所在的文件夹
      const folderPath = style.refs?.[0]
        ? style.refs[0].split('/').slice(0, -1).join('/')
        : `studyhacks-ppt/styles/${style.id}`;

      // 提取相对路径部分 (移除域名)
      const relativeFolderPath = folderPath.includes('cdn.studyhacks.ai/')
        ? folderPath.split('cdn.studyhacks.ai/')[1]
        : folderPath;

      const targetKey = `${relativeFolderPath.replace(/\/$/, '')}/preview.${ext}`;
      console.log(`[Admin Style] Syncing preview image to: ${targetKey}`);
      style.preview = await downloadAndUploadImage(style.preview, targetKey);
    }

    const fileContent = await fs.readFile(CONFIG_FILE_PATH, 'utf-8');

    // 找到 PPT_STYLES 数组的定义
    const startTag = 'export const PPT_STYLES: PPTStyle[] = [';
    const endTag = '];';

    const startIndex = fileContent.indexOf(startTag);
    if (startIndex === -1) throw new Error('找不到 PPT_STYLES 定义');

    // 检查是否已存在该 ID
    const existingIndex = PPT_STYLES.findIndex((s) => s.id === style.id);
    let newStyles = [...PPT_STYLES];

    if (existingIndex > -1) {
      newStyles[existingIndex] = style;
    } else {
      newStyles.push(style);
    }

    // 构建新的文件内容
    // 为了简单起见，我们重新生成数组部分
    const stylesJson = JSON.stringify(newStyles, null, 2)
      // 处理类型转换，确保符合 VisualSpecification 接口
      .replace(/"position":\s*"([^"]+)"/g, '"position": "$1" as const')
      .replace(/"type":\s*"([^"]+)"/g, '"type": "$1" as const')
      .replace(/"fontWeight":\s*"([^"]+)"/g, '"fontWeight": "$1" as const')
      // 处理可能存在的变量引用
      .replace(/"\$\{CDN_BASE_URL\}\/([^"]+)"/g, '`${CDN_BASE_URL}/$1`');

    const newContent =
      fileContent.substring(0, startIndex + startTag.length) +
      '\n' +
      stylesJson.substring(1, stylesJson.length - 1).trim() +
      '\n' +
      fileContent.substring(fileContent.lastIndexOf(endTag));

    await fs.writeFile(CONFIG_FILE_PATH, newContent, 'utf-8');
    return { success: true };
  } catch (error: any) {
    console.error('Save style failed:', error);
    throw new Error('保存风格失败: ' + error.message);
  }
}

/**
 * 删除风格
 */
export async function deleteStyleFromConfigAction(id: string) {
  try {
    const fileContent = await fs.readFile(CONFIG_FILE_PATH, 'utf-8');
    const startTag = 'export const PPT_STYLES: PPTStyle[] = [';
    const startIndex = fileContent.indexOf(startTag);

    const newStyles = PPT_STYLES.filter((s) => s.id !== id);

    const stylesJson = JSON.stringify(newStyles, null, 2)
      .replace(/"position":\s*"([^"]+)"/g, '"position": "$1" as const')
      .replace(/"type":\s*"([^"]+)"/g, '"type": "$1" as const')
      .replace(/"fontWeight":\s*"([^"]+)"/g, '"fontWeight": "$1" as const');

    const newContent =
      fileContent.substring(0, startIndex + startTag.length) +
      '\n' +
      stylesJson.substring(1, stylesJson.length - 1).trim() +
      '\n' +
      fileContent.substring(fileContent.lastIndexOf('];'));

    await fs.writeFile(CONFIG_FILE_PATH, newContent, 'utf-8');
    return { success: true };
  } catch (error: any) {
    console.error('Delete style failed:', error);
    throw new Error('删除风格失败: ' + error.message);
  }
}

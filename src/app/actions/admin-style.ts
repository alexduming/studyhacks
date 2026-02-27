'use server';

import fs from 'fs/promises';
import path from 'path';

import {
  generateVisualSpecPrompt,
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

function detectLanguageFromTheme(text: string): 'zh' | 'en' {
  if (!text) return 'en';
  const chineseChars =
    text.match(/[\u4e00-\u9fa5\u3000-\u303f\uff00-\uffef]/g) || [];
  const totalChars = text.replace(/\s/g, '').length;
  if (totalChars === 0) return 'en';
  return chineseChars.length / totalChars > 0.05 ? 'zh' : 'en';
}

function isTemporaryImageUrl(url: string): boolean {
  const tempDomains = ['kie.ai', 'tempfile.aiquickdraw.com', 'fal.media'];
  return tempDomains.some((domain) => url.includes(domain));
}

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
 *
 * 优化说明：
 * - 使用更详细的提示词结构，引导 AI 输出完整的视觉风格复原指南
 * - 返回结构包含：style_name, overall_vibe, color_palette, typography, layout, effects 等
 * - 同时生成 style_meta 用于自动填充风格名称、标题、描述
 */
export async function analyzeStyleAction(imageUrls: string[]): Promise<{
  prompt: string;
  visualSpec: VisualSpecification;
  styleMeta?: {
    id: string;
    title: string;
    tagline: string;
  };
  suggestedThemes?: string[];
}> {
  if (!OPENROUTER_API_KEY) {
    throw new Error('OpenRouter API Key 未配置');
  }

  // 优化后的提示词：引导 AI 输出详细的视觉风格复原指南
  const prompt = `你是一位顶级的 UI/UX 设计师和视觉风格分析专家。
请仔细分析上传的参考图片，输出一份详细的【视觉风格复原指南】，让其他设计师能够精确复刻这种风格。

## 输出要求

请直接输出 JSON 格式（不要包含 Markdown 代码块），结构如下：

{
  "prompt": "一段简洁有力的风格描述提示词，用于指导 AI 生成同风格的图片。格式：'你是一位专家级UI、UX演示设计师，请根据参考图风格生成幻灯片。核心特征：[详细描述风格DNA]'",

  "visualSpec": {
    "visual_style": {
      "style_name": "风格名称（中英文，如：现代科技极简风 / Modern Tech Minimalism）",
      "overall_vibe": "整体氛围关键词（如：专业、简约、科技感、活力、文艺等）",

      "color_palette": {
        "background": {
          "hex": "#HEX值",
          "description": "背景色描述（如：深邃的午夜蓝，营造专业科技感）"
        },
        "accent_colors": [
          {
            "hex": "#HEX值",
            "name": "颜色名称（如：活力橙）",
            "usage": "使用场景（如：主标题、CTA按钮、重点强调）"
          }
        ],
        "text_colors": {
          "title": "#HEX值",
          "body": "#HEX值",
          "muted": "#HEX值"
        },
        "gradient": {
          "type": "linear/radial/none",
          "value": "渐变值或 none",
          "description": "渐变描述"
        }
      },

      "typography": {
        "main_title": {
          "font_family": "字体族（如：Bold Sans-serif / 特粗黑体）",
          "characteristics": "字体特征（如：笔画粗壮、边缘圆润、现代感强）",
          "size_range": "字号范围（如：48-72px）",
          "weight": "字重（如：bold/extrabold）",
          "effects": "特效（如：阴影、描边、渐变填充）"
        },
        "subtitle": {
          "font_family": "字体族",
          "characteristics": "字体特征",
          "size_range": "字号范围"
        },
        "body_text": {
          "font_family": "字体族",
          "line_height": "行高（如：1.6）",
          "size_range": "字号范围"
        }
      },

      "layout_composition": {
        "type": "布局类型（如：居中对称 / 非对称拼贴 / 网格系统 / 自由流动）",
        "structure": ["布局结构描述1", "布局结构描述2"],
        "spacing": "间距特征（如：宽松留白 / 紧凑密集）",
        "alignment": "对齐方式（如：左对齐 / 居中 / 混合）",
        "layering": "层级关系描述"
      },

      "graphic_elements": {
        "icons": ["图标风格描述"],
        "decorations": ["装饰元素描述"],
        "shapes": ["形状元素描述"],
        "patterns": ["图案纹理描述"]
      },

      "photography_style": {
        "tone": "照片调性（如：高饱和度、低对比度、复古胶片感）",
        "scenes": ["适合的场景类型"],
        "composition": "构图特点",
        "treatment": "后期处理风格"
      },

      "effects": {
        "corners": "圆角处理（如：大圆角 / 直角 / 混合）",
        "shadows": "阴影风格（如：柔和投影 / 硬边阴影 / 无阴影）",
        "blur": "模糊效果",
        "texture": "纹理质感（如：磨砂 / 光滑 / 纸质）",
        "special": ["特殊效果描述"]
      },

      "motifs": ["核心视觉母题/符号（如：几何图形、科技线条、自然元素）"]
    }
  },

  "styleMeta": {
    "id": "风格ID（英文小写+下划线，如：modern_tech_blue）",
    "title": "风格标题（简短中文，如：科技蓝）",
    "tagline": "一句话描述（如：专业科技感，适合产品发布和企业介绍）"
  },

  "suggestedThemes": [
    "根据风格特点建议的预览主题1（如：AI产品发布会）",
    "建议的预览主题2（如：科技公司年度报告）",
    "建议的预览主题3（如：SaaS产品功能介绍）"
  ]
}

## 分析要点

1. **配色分析**：提取主色、辅助色、强调色，说明每种颜色的用途和情感
2. **字体分析**：识别字体风格（衬线/无衬线/手写等）、粗细、特效
3. **布局分析**：分析空间分布、对齐方式、视觉层级
4. **装饰元素**：识别图标风格、装饰图案、背景纹理
5. **整体氛围**：总结风格的情感调性和适用场景

请确保输出的 JSON 格式正确，所有字段都有实际内容。`;

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
          model: 'google/gemini-2.0-flash-001',
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
          response_format: { type: 'json_object' },
        }),
      }
    );

    const data = await response.json();

    if (!data.choices || !data.choices[0]?.message?.content) {
      console.error('[Admin Style] OpenRouter Error Response:', JSON.stringify(data, null, 2));
      throw new Error(data.error?.message || 'OpenRouter 未返回有效内容');
    }

    const content = data.choices[0].message.content.trim();
    console.log('[Admin Style] AI Original Content:', content);

    // 鲁棒的 JSON 提取逻辑
    let cleanJson = content;
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      cleanJson = jsonMatch[0];
    }

    try {
      const parsed = JSON.parse(cleanJson);

      // 兼容处理：如果 visualSpec 直接包含 visual_style，保持原样
      // 如果是旧格式（直接的 header/background 等），也保持兼容
      return {
        prompt: parsed.prompt || '',
        visualSpec: parsed.visualSpec || {},
        styleMeta: parsed.styleMeta,
        suggestedThemes: parsed.suggestedThemes,
      };
    } catch (parseError) {
      console.error('[Admin Style] JSON Parse Failed. Content:', content);
      throw new Error('AI 返回格式非标准 JSON，请重试');
    }
  } catch (error: any) {
    console.error('Style analysis failed detailed error:', error);
    throw new Error(`风格分析失败: ${error.message || '未知错误'}`);
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
  visualSpec?: VisualSpecification;
  previewTheme?: string; // 可自定义的预览主题，默认为"Studyhacks产品介绍"
}) {
  // 使用自定义主题或默认主题
  const theme =
    params.previewTheme || 'Studyhacks: Learn Anything Faster than Ever';
  const outputLanguage = detectLanguageFromTheme(theme);
  const languageInstruction =
    outputLanguage === 'zh'
      ? '- ALL TEXT IN THE IMAGE MUST BE IN SIMPLIFIED CHINESE ONLY'
      : '- ALL TEXT IN THE IMAGE MUST BE IN ENGLISH ONLY';

  // 🎯 全英文提示词 - 确保生成的预览图中只包含英文文字
  const contentPrompt = `[CORE TASK] Generate a brand new PPT cover image for "${theme}".

[CONTENT THEME]
- Theme: ${theme}
- Design appropriate title, subtitle, and core information based on the theme
- Design style: Modern, professional, tech-savvy

[STYLE REFERENCE REQUIREMENTS - IMPORTANT]
- Reference images are ONLY for visual style reference (color scheme, typography style, layout structure, decorative element styles, etc.)
- Must create a completely NEW cover design based on the "${theme}" theme
- DO NOT directly copy or replicate the content, text, icons, or specific layout from reference images
- Only learn the "design DNA" from reference images (such as color schemes, visual textures, typographic styles), but content must be completely original
- Reference images tell you "what style to use", NOT "what content to draw"

[GENERATION PRINCIPLES]
- Maintain visual style consistency with reference images (colors, fonts, textures)
- But content, layout, and elements must be newly created around the "${theme}" theme
${languageInstruction}`;

  // 将视觉规范 JSON 转换为提示词
  const visualSpecPrompt = params.visualSpec
    ? generateVisualSpecPrompt(params.visualSpec)
    : '';

  // 将风格提示词、视觉规范提示词与内容提示词结合
  const finalPrompt = `${contentPrompt}\n\n[STYLE DESCRIPTION] ${params.prompt}${visualSpecPrompt}`;

  return await createKieTaskAction({
    prompt: finalPrompt,
    customImages: params.imageUrls,
    aspectRatio: '16:9',
    imageSize: '2K',
    outputLanguage,
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
      let imageUrl = result.data.results?.[0] || null;
      if (result.data.status === 'SUCCESS' && imageUrl && isTemporaryImageUrl(imageUrl)) {
        const ext = imageUrl.split('.').pop()?.split('?')[0] || 'png';
        const targetKey = `studyhacks-ppt/styles/admin-previews/${taskId}.${ext}`;
        imageUrl = await downloadAndUploadImage(imageUrl, targetKey);
      }
      return {
        status:
          result.data.status === 'SUCCESS'
            ? 'completed'
            : result.data.status === 'FAILED'
              ? 'failed'
              : 'processing',
        imageUrl,
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
 *
 * 🎯 关键优化：
 * 1. 将临时预览图（tempfile.aiquickdraw.com）持久化到 R2
 * 2. 将预览图加入 refs 列表，确保未来调用风格时能参考到
 */
export async function saveStyleToConfigAction(style: PPTStyle) {
  try {
    // 🎯 将预览图从临时存储同步到我们的 R2 永久存储
    // 支持多种临时域名：kie.ai、tempfile.aiquickdraw.com 等
    const tempDomains = ['kie.ai', 'tempfile.aiquickdraw.com', 'fal.media'];
    const needsSync = tempDomains.some(domain => style.preview.includes(domain));

    if (needsSync) {
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
      console.log(`[Admin Style] Syncing preview image to R2: ${targetKey}`);
      const persistedUrl = await downloadAndUploadImage(style.preview, targetKey);

      // 更新预览图 URL 为持久化后的地址
      style.preview = persistedUrl;
      console.log(`[Admin Style] Preview image persisted to: ${persistedUrl}`);
    }

    // 🎯 确保预览图在 refs 列表的最前面（如果还没有的话）
    // 这样未来调用风格时，预览图会作为首要参考
    if (style.refs && !style.refs.includes(style.preview)) {
      style.refs = [style.preview, ...style.refs];
      console.log(`[Admin Style] Added preview to refs list for better style consistency`);
    } else if (!style.refs) {
      style.refs = [style.preview];
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
      fileContent.substring(fileContent.indexOf('];', startIndex + startTag.length));

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
      fileContent.substring(fileContent.indexOf('];', startIndex + startTag.length));

    await fs.writeFile(CONFIG_FILE_PATH, newContent, 'utf-8');
    return { success: true };
  } catch (error: any) {
    console.error('Delete style failed:', error);
    throw new Error('删除风格失败: ' + error.message);
  }
}

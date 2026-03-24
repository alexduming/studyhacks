import { NextRequest, NextResponse } from 'next/server';
// @ts-ignore
import { fal } from '@fal-ai/client';

import { AIMediaType, AITaskStatus } from '@/extensions/ai';
import { createAITaskRecordOnly } from '@/shared/models/ai_task';
import { getAllConfigs } from '@/shared/models/config';
import {
  consumeCredits,
  getRemainingCredits,
  refundCredits,
} from '@/shared/models/credit';
import { getUserInfo } from '@/shared/models/user';

// 使用 Node.js 运行时，保证可以安全调用外部 API 并使用环境变量
export const runtime = 'nodejs';

/**
 * 多提供商图片生成API（带自动降级）
 *
 * 非程序员解释：
 * - 这个接口实现了"托底服务"功能
 * - 提供商优先级通过环境变量 IMAGE_PROVIDER_PRIORITY 配置
 * - 支持的提供商：FAL、KIE、Replicate、APIYI
 * - 默认顺序：FAL（主力）→ KIE → Replicate → APIYI（最终托底）
 * - 如果主力服务失败，自动切换到下一个提供商
 * - 这样可以大大提高生成成功率
 *
 * 配置方式：
 * - 在 .env.local 文件中修改 IMAGE_PROVIDER_PRIORITY
 * - 格式：用逗号分隔的提供商名称，从左到右依次尝试
 * - 示例：IMAGE_PROVIDER_PRIORITY=APIYI,FAL,KIE,Replicate
 */

const KIE_BASE_URL = 'https://api.kie.ai/api/v1';
// APIYI 使用 Gemini 原生格式端点（统一支持文生图和图生图，且支持分辨率参数）
const APIYI_TEXT2IMG_URL =
  'https://api.apiyi.com/v1beta/models/gemini-3-pro-image-preview:generateContent';

// 支持的提供商类型
type ProviderName = 'FAL' | 'KIE' | 'Replicate' | 'APIYI';

type InferredLanguage = 'zh' | 'en' | 'other';
type AdaptiveStyleIntensity = 'balanced' | 'artistic' | 'signature';

/**
 * 图片生成服务优先级配置（从环境变量读取）
 *
 * 非程序员解释：
 * - 通过修改 .env.local 文件中的 IMAGE_PROVIDER_PRIORITY 就能快速切换主力/托底顺序
 * - 格式：用逗号分隔的提供商名称，从左到右依次尝试
 * - 示例：APIYI,FAL,KIE,Replicate 表示 APIYI主力，FAL托底，KIE再托底，Replicate最终托底
 * - 如果环境变量未设置或格式错误，默认使用 FAL,KIE,Replicate,APIYI
 * - 与 PPT 生成共用同一个环境变量，统一管理
 */
function getProviderPriority(): Array<ProviderName> {
  const priorityStr =
    process.env.IMAGE_PROVIDER_PRIORITY || 'FAL,KIE,Replicate,APIYI';

  // 解析逗号分隔的字符串，去除空格
  const providers = priorityStr
    .split(',')
    .map((p) => p.trim())
    .filter((p) =>
      ['FAL', 'KIE', 'Replicate', 'APIYI'].includes(p)
    ) as Array<ProviderName>;

  // 如果解析后为空或少于1个提供商，使用默认配置
  if (providers.length === 0) {
    console.warn(
      '[Infographic] ⚠️ IMAGE_PROVIDER_PRIORITY 配置无效，使用默认顺序: FAL,KIE,Replicate,APIYI'
    );
    return ['FAL', 'KIE', 'Replicate', 'APIYI'];
  }

  // 确保所有四个提供商都存在（防止配置遗漏）
  const allProviders: Array<ProviderName> = [
    'FAL',
    'KIE',
    'Replicate',
    'APIYI',
  ];
  const missingProviders = allProviders.filter((p) => !providers.includes(p));

  // 将遗漏的提供商追加到末尾
  const finalProviders = [...providers, ...missingProviders];

  console.log(
    `[Infographic] 📋 图片生成优先级: ${finalProviders.join(' -> ')}`
  );
  return finalProviders;
}

interface GenerateParams {
  content: string;
  aspectRatio?: string;
  resolution?: string;
  outputFormat?: string;
  stylePreset?: string;
  styleIntensity?: AdaptiveStyleIntensity;
  referenceImageUrl?: string; // 新增：参考图URL（用于图生图模式）
}

const STYLE_PRESET_PROMPTS: Record<string, string> = {
  adaptive_smart: `Style: Adaptive, content-native infographic.
- Composition: Choose the best layout based on the content structure (comparison/process/framework/data story), with strong hierarchy and generous whitespace.
- Visual Elements: Choose iconography, illustration density, and chart style according to topic tone and audience intent.
- Art Rules: Maintain a coherent visual system (shape language, line style, spacing rhythm, and color logic); avoid random decoration.
- Text: Keep labels concise and scannable. Prioritize key takeaways and decision-relevant points.
- Goal: Produce the most fitting visual style for THIS specific content rather than forcing a fixed preset style.`,
  hand_drawn_infographic: `Style: Universal hand-drawn cartoon infographic.
- Composition: 3:4 vertical modular layout with information distributed in a top-to-bottom hierarchy and generous whitespace.
- Visual Elements: Minimal yet lively hand-drawn icons, metaphorical cartoon characters, and relevant illustrative scenes that make abstract concepts intuitive.
- Art Rules: Use only hand-drawn lines and tactile sketch textures. Absolutely no photorealism or photography. Keep the palette clean, soft, and friendly.
- Text: Extract core keywords only, rendered in a clear handwritten-style typographic voice.
- Goal: Turn educational content into a playful and highly readable hand-drawn infographic.`,
  isometric_thick_line_macaron: `Style: Universal isometric 2.5D cartoon infographic.
- Composition: 3:4 vertical layout, with content stacked from top to bottom like modular building blocks connected by platform-like sections.
- Perspective: Use a consistent 30-degree isometric perspective with clear geometric depth.
- Line Rules: Apply bold black outlines to all objects for a flat cartoon sticker-like look.
- Color Rules: Use a soft low-saturation macaron palette, such as pastel blue, pink, green, purple, and yellow.
- Lighting: Keep shadows extremely subtle, light gray, soft-edged, and low-opacity. Avoid heavy texture.
- Background: Clean light gray or warm off-white background to keep focus on the subject.
- Visual Elements: Use simple high-recognition 3D geometric icons. Place text inside rounded rectangular speech-bubble style containers.
- Goal: Make complex ideas feel approachable through geometric depth and playful pastel structure.`,
  minimal_line_storytelling_compare: `Style: Minimal line-based narrative comparison infographic.
- Composition: 3:4 vertical dual-column comparison layout with a strong top headline and concise keyword blocks.
- Visual Elements: Use simple stick figures and minimal line-based characters. Express emotion and change with exaggerated symbols such as messy scribbles, sighs, light bulbs, and check marks.
- Art Rules: Pure white background, thin black hand-drawn lines, and only tiny amounts of vivid accent colors such as red for mistakes and green for success.
- Text: Keep copy short, punchy, and comparison-oriented.
- Goal: Communicate before-vs-after understanding through ultra-minimal visual storytelling.`,
  flat_vector_education: `Create an educational infographic to explain the provided file or text content.
- Style: Flat vector.
- Composition: Choose the most suitable 3:4 vertical educational layout for the material.
- Visual Elements: Select a few representative educational visual elements on your own to support comprehension.
- Art Rules: Keep shapes flat, edges clean, hierarchy explicit, and the whole composition easy to scan.
- Goal: Deliver an educational visual summary that feels clear, organized, and approachable.`,
  flat_design_modern: `Style: Universal flat design infographic.
- Composition: 3:4 vertical hierarchical layout with clearly divided information sections, abundant whitespace, and a strong visual center.
- Visual Elements: Minimal 2D flat icons, illustrated characters, solid color shapes, and straight guiding lines.
- Art Rules: No shadows, gradients, or depth effects. Use a modern, premium flat-illustration color system with strong overall art direction.
- Text: Use a modern sans-serif typographic voice similar to Source Han Sans, emphasizing data and core phrases.
- Goal: Present information in a professional, modern flat-illustration language with high aesthetic polish.`,
};

const LANGUAGE_RULE = `⚠️ CRITICAL LANGUAGE RULE - ABSOLUTELY NON-NEGOTIABLE ⚠️
ALL text in the infographic MUST be in the EXACT SAME LANGUAGE as the input content below.
- Chinese input (中文) → Chinese output (中文标签、中文标题、中文说明)
- English input → English output
- Other languages → Same language output
🚫 NEVER translate to English or any other language. This is STRICTLY FORBIDDEN.
🚫 DO NOT use English labels for Chinese content.
The language of the output MUST match the language of the input EXACTLY.

Language self-check before final output:
- Verify every visible title, label, annotation, and caption follows the input language.
- If input is Chinese, output must be 100% Chinese except brand names already present in source content.
- If any English text appears for Chinese input, rewrite ALL text to Chinese before finalizing.`;

function inferContentLanguage(content: string): InferredLanguage {
  const cjkMatches = content.match(/[\u3400-\u9fff]/g) || [];
  const latinMatches = content.match(/[A-Za-z]/g) || [];

  if (cjkMatches.length >= 8 && cjkMatches.length >= latinMatches.length) {
    return 'zh';
  }

  if (
    latinMatches.length >= 8 &&
    latinMatches.length > cjkMatches.length * 1.2
  ) {
    return 'en';
  }

  return 'other';
}

function buildLanguageGuard(content: string): string {
  const lang = inferContentLanguage(content);

  if (lang === 'zh') {
    return `STRICT OVERRIDE FOR THIS TASK: Source language is Chinese.
- All visible text MUST be Chinese.
- Do not output English headings, labels, bullets, chart titles, or callouts.
- Keep existing English acronyms only if they already appear in source content.`;
  }

  if (lang === 'en') {
    return `STRICT OVERRIDE FOR THIS TASK: Source language is English.
- All visible text MUST be English.
- Do not translate to Chinese or mixed-language output unless source content is mixed.`;
  }

  return `STRICT OVERRIDE FOR THIS TASK: Keep output language identical to source language.`;
}

function buildAdaptiveStylePrompt(
  content: string,
  intensity: AdaptiveStyleIntensity = 'balanced'
): string {
  const text = content.toLowerCase();
  const numberCount = (content.match(/\d+/g) || []).length;
  const statCount = (
    content.match(/%|％|¥|\$|亿|万|kpi|roi|增长|下降|同比|环比/g) || []
  ).length;
  const listSignalCount = (
    content.match(/(^|\n)\s*[-*\d]+[.)、:：]?\s+/gm) || []
  ).length;

  const hasProcessSignals =
    /步骤|流程|step|process|how to|方法|路径|roadmap|pipeline|phase/.test(text);
  const hasComparisonSignals =
    /对比|vs|比较|优劣|pros|cons|差异|A\/B|ab test|trade[- ]?off/.test(text);
  const hasTrendSignals =
    /趋势|预测|未来|opinion|观点|争议|hot|trend|forecast|signal/.test(text);
  const hasEducationSignals =
    /学习|教程|教学|入门|指南|教育|课程|training|lesson|framework/.test(text);
  const hasTimelineSignals =
    /timeline|里程碑|阶段|季度|q1|q2|q3|q4|今年|明年|roadmap|计划/.test(text);
  const hasFrameworkSignals =
    /框架|模型|principle|pillar|维度|taxonomy|matrix|map/.test(text);
  const hasDecisionSignals =
    /建议|选择|决策|recommend|decision|should|方案|策略/.test(text);
  const hasActionSignals =
    /清单|checklist|todo|执行|落地|action|next step|待办/.test(text);
  const hasRiskSignals =
    /风险|失败|错误|warning|caution|pitfall|avoid|problem/.test(text);
  const hasTechSignals =
    /ai|模型|agent|api|system|架构|代码|engineering|workflow/.test(text);
  const hasBusinessSignals =
    /市场|用户|增长|转化|商业|收入|产品|gmv|营销|运营/.test(text);

  const dataDensity =
    numberCount >= 10 || statCount >= 4
      ? 'High-density quantitative content.'
      : numberCount >= 4 || listSignalCount >= 4
        ? 'Medium data density with mixed facts and guidance.'
        : 'Low-density conceptual content.';

  const compositionArchetype = hasComparisonSignals
    ? 'Comparison matrix layout with mirrored columns and explicit deltas.'
    : hasProcessSignals
      ? 'Sequential flow layout with directional progression and milestone anchors.'
      : hasTimelineSignals
        ? 'Timeline roadmap layout with temporal lanes and phase separators.'
        : hasFrameworkSignals
          ? 'Framework grid layout with principle blocks and relationship connectors.'
          : numberCount >= 6
            ? 'Data-card dashboard layout with evidence-first reading order.'
            : 'Editorial modular layout with balanced storytelling sections.';

  const narrativeMode = hasDecisionSignals
    ? 'Decision-support narrative (options, trade-offs, recommendations).'
    : hasActionSignals
      ? 'Playbook narrative (action steps and execution checklist).'
      : hasProcessSignals
        ? 'How-to narrative (clear progression from start to finish).'
        : hasTrendSignals
          ? 'Trend-analysis narrative (signals, implications, and outlook).'
          : 'Explainer narrative (core concept to key takeaways).';

  const audienceLevel = /入门|新手|beginner|101|基础/.test(text)
    ? 'Beginner-friendly: higher clarity, simpler labels, less jargon.'
    : /高级|进阶|专家|advanced|expert|benchmark|architecture/.test(text)
      ? 'Expert-leaning: denser terminology, tighter modules, stronger information compression.'
      : 'General professional audience: concise and practical language.';

  const domainVisualLanguage = hasTechSignals
    ? 'Tech-product visual language: system nodes, pipelines, and modular components.'
    : hasBusinessSignals
      ? 'Business-insight visual language: KPI cards, funnel cues, and strategic markers.'
      : /医疗|health|科学|science|research/.test(text)
        ? 'Evidence-centric visual language: precision diagrams and cautious emphasis.'
        : 'Universal knowledge visual language: neutral symbols and broad accessibility.';

  const emotionalIntensity = hasRiskSignals
    ? 'High-alert tone with disciplined contrast and warning emphasis.'
    : hasTrendSignals
      ? 'Dynamic forward-looking tone with energetic focal points.'
      : hasEducationSignals
        ? 'Friendly, encouraging tone with approachable teaching cues.'
        : 'Calm professional tone with confidence and restraint.';

  const abstractionLevel = hasFrameworkSignals
    ? 'Abstract-systemic representation with symbolic structures.'
    : hasProcessSignals || hasActionSignals
      ? 'Concrete-operational representation with explicit steps and outcomes.'
      : 'Balanced abstraction using practical metaphors and concrete anchors.';

  const iconIllustrationPolicy = hasTechSignals
    ? 'Use precise line icons and modular technical motifs; avoid playful mascots.'
    : hasEducationSignals
      ? 'Use friendly metaphorical icons with simple explanatory mini-illustrations.'
      : 'Use clean universal icons with consistent stroke/shape grammar.';

  const chartGrammar =
    numberCount >= 8 || statCount >= 3
      ? 'Use mini bars, trend lines, and metric callouts; every chart must state the takeaway.'
      : hasComparisonSignals
        ? 'Use side-by-side comparison bars/tables with explicit labels and winner cues.'
        : hasTimelineSignals
          ? 'Use timeline rails, phase markers, and milestone chips over heavy charts.'
          : 'Prefer icon + short-text modules over chart-heavy blocks.';

  const spacingRhythm =
    numberCount >= 10
      ? 'Compact but breathable spacing with strict grouping boundaries.'
      : 'Airy spacing with strong chunking for scan-first reading.';

  const colorStrategy = hasRiskSignals
    ? 'Use controlled high-contrast palette with warning accents reserved for risk points.'
    : hasTrendSignals
      ? 'Use vibrant accent-driven palette to emphasize momentum and signal hierarchy.'
      : hasEducationSignals
        ? 'Use soft, harmonious palette with warm/cool balance for readability.'
        : 'Use neutral-professional palette with one clear accent color family.';

  const typographyVoice = /政策|policy|research|报告|whitepaper/.test(text)
    ? 'Editorial-professional typography with disciplined heading scale.'
    : hasEducationSignals
      ? 'Approachable educational typography with clear headline/subheadline separation.'
      : 'Modern utilitarian typography optimized for fast scanning.';

  const artisticDirection =
    intensity === 'signature'
      ? 'Use a highly distinctive art direction with cinematic framing, strong texture language, and iconic thematic motifs while preserving readability.'
      : intensity === 'artistic'
        ? 'Use elevated art direction with richer composition rhythm, stylized motif system, and tasteful texture accents.'
        : 'Use practical art direction with restrained styling and readability-first execution.';

  const renderComplexity =
    intensity === 'signature'
      ? 'High visual complexity with layered foreground/midground/background depth and deliberate focal lighting.'
      : intensity === 'artistic'
        ? 'Medium-high complexity with stylized depth, richer icon scenes, and stronger focal anchors.'
        : 'Moderate complexity with simple modules and low-noise backgrounds.';

  const ornamentalPolicy =
    intensity === 'signature'
      ? 'Allow themed decorative frames, glyphs, symbolic ornaments, and atmospheric gradients when they reinforce story coherence.'
      : intensity === 'artistic'
        ? 'Allow light decorative motifs and subtle surface textures in non-critical whitespace.'
        : 'Keep decorations minimal and functional only.';

  const blueprintPolicy =
    intensity === 'signature'
      ? 'Enforce one hero centerpiece plus supporting rails/cards and explicit start/end attention points.'
      : intensity === 'artistic'
        ? 'Enforce one dominant zone plus 2-3 secondary zones with directional visual guidance.'
        : 'Use standard modular blueprint with straightforward sectioning.';

  const failSafeRule =
    intensity === 'signature'
      ? 'If details become crowded, reduce ornament density before reducing text legibility.'
      : 'If layout is crowded, simplify decorative elements and preserve clarity.';

  return `Style: Adaptive style generated from content semantics and communication intent.
- Dimension 1 / Composition Archetype: ${compositionArchetype}
- Dimension 2 / Narrative Mode: ${narrativeMode}
- Dimension 3 / Audience Calibration: ${audienceLevel}
- Dimension 4 / Domain Visual Language: ${domainVisualLanguage}
- Dimension 5 / Data Density: ${dataDensity}
- Dimension 6 / Emotional Intensity: ${emotionalIntensity}
- Dimension 7 / Abstraction Level: ${abstractionLevel}
- Dimension 8 / Icon & Illustration Policy: ${iconIllustrationPolicy}
- Dimension 9 / Chart Grammar: ${chartGrammar}
- Dimension 10 / Spacing Rhythm: ${spacingRhythm}
- Dimension 11 / Color Strategy: ${colorStrategy}
- Dimension 12 / Typography Voice: ${typographyVoice}
- Dimension 13 / Artistic Direction: ${artisticDirection}
- Dimension 14 / Render Complexity: ${renderComplexity}
- Dimension 15 / Ornament Policy: ${ornamentalPolicy}
- Dimension 16 / Blueprint Policy: ${blueprintPolicy}
- Output Intensity: ${intensity}
- Art Rules: No photorealism, no random decorative clutter, keep hierarchy explicit and consistent.
- Quality Rules: Keep text legible at a glance, avoid collisions, and align visual metaphors with content semantics.
- Fail-safe Rule: ${failSafeRule}
- Goal: Synthesize a best-fit style for this specific content, with visibly distinct outcomes across different content types.`;
}

function normalizeAdaptiveIntensity(value: unknown): AdaptiveStyleIntensity {
  if (value === 'artistic' || value === 'signature' || value === 'balanced') {
    return value;
  }
  return 'balanced';
}

function normalizeStylePreset(value: unknown): string {
  if (
    value === 'adaptive_smart' ||
    value === 'hand_drawn_infographic' ||
    value === 'isometric_thick_line_macaron' ||
    value === 'minimal_line_storytelling_compare' ||
    value === 'flat_vector_education' ||
    value === 'flat_design_modern'
  ) {
    return value;
  }
  return 'adaptive_smart';
}

function getStylePrompt(stylePreset?: string): string {
  if (stylePreset === 'adaptive_smart') {
    return STYLE_PRESET_PROMPTS.adaptive_smart;
  }
  if (!stylePreset) {
    return STYLE_PRESET_PROMPTS.hand_drawn_infographic;
  }
  return (
    STYLE_PRESET_PROMPTS[stylePreset] ||
    STYLE_PRESET_PROMPTS.hand_drawn_infographic
  );
}

function buildInfographicPrompt(
  params: GenerateParams,
  hasReferenceImage: boolean
): string {
  const stylePrompt =
    !params.stylePreset || params.stylePreset === 'adaptive_smart'
      ? buildAdaptiveStylePrompt(params.content, params.styleIntensity)
      : getStylePrompt(params.stylePreset);
  const languageGuard = buildLanguageGuard(params.content);

  if (hasReferenceImage) {
    return `[关键风格参考] 你必须严格遵循提供的参考图片的视觉风格。这是当前任务中最高优先级的要求。

风格要求（必须遵守）：
- **配色方案**：使用与参考图片完全一致的颜色体系（背景色、强调色、文字颜色）
- **设计风格**：匹配参考图的图形风格、插画技法和整体美术气质
- **版式结构**：参考并对齐主要构图方式和元素排布逻辑
- **文字风格**：使用与参考图相似的字体风格和层级关系
- **视觉元素**：使用类似的图标、形状和装饰性元素
- **整体氛围**：复刻参考图的气质、专业度和视觉调性

预设风格偏好（在不与参考图冲突的前提下再应用）：
${stylePrompt}

内容任务说明：
请基于下方内容创作一张教育型信息图，解释和梳理核心要点，自主选择典型的视觉元素进行呈现。

${LANGUAGE_RULE}

${languageGuard}

Content:
${params.content}

[提醒] 首先保证与参考图片在风格上的高度一致，其次再表达预设风格偏好。务必保证信息图中所有文字与上方内容保持同一种语言。`;
  }

  return `创建一张教育型信息图，用来解释下方提供的文件或文本内容。你需要自行选择一些典型的视觉元素。

Selected Style Instructions:
${stylePrompt}

${LANGUAGE_RULE}

${languageGuard}

Content:
${params.content}`;
}

/**
 * 尝试使用FAL生成（nano-banana-pro）- 异步模式
 *
 * 说明：
 * - 使用 fal-ai/nano-banana-pro 模型（统一模型，支持参考图）
 * - 如果有参考图，通过 image_input 参数传递（数组形式）
 * - 使用 fal.queue.submit() 异步提交任务，立即返回 request_id
 * - 前端通过轮询 query-with-fallback API 查询任务状态
 * - 这样可以避免 Vercel 函数超时（30-60秒限制）
 */
async function tryGenerateWithFal(
  params: GenerateParams,
  apiKey: string
): Promise<{
  success: boolean;
  taskId?: string;
  imageUrls?: string[];
  error?: string;
}> {
  try {
    const hasReferenceImage = !!params.referenceImageUrl;
    // ✅ 根据是否有参考图选择模型
    // - 有参考图：使用 edit 模型（图生图）
    // - 无参考图：使用普通模型（文生图）
    const modelName = hasReferenceImage
      ? 'fal-ai/nano-banana-pro/edit'
      : 'fal-ai/nano-banana-pro';

    console.log(
      `🔄 尝试使用 FAL (${modelName}) 异步生成...${hasReferenceImage ? ' [图生图模式]' : ''}`
    );

    // 配置 FAL Client
    fal.config({
      credentials: apiKey,
    });

    const prompt = buildInfographicPrompt(params, hasReferenceImage);
    if (hasReferenceImage) {
      console.log('[FAL] 🎨 使用强化风格参考模式:', params.referenceImageUrl);
    }

    // 映射宽高比到 FAL (nano-banana-pro) 支持的值
    // 支持的值: "16:9" | "4:3" | "1:1" | "9:16" | "3:4" | "3:2" | "2:3" | "5:4" | "4:5" | "21:9"
    let falAspectRatio = '1:1';
    switch (params.aspectRatio) {
      case '16:9':
        falAspectRatio = '16:9';
        break;
      case '9:16':
        falAspectRatio = '9:16';
        break;
      case '4:3':
        falAspectRatio = '4:3';
        break;
      case '3:4':
        falAspectRatio = '3:4';
        break;
      case '1:1':
      default:
        falAspectRatio = '1:1';
        break;
    }

    // 构建输入参数
    const input: any = {
      prompt,
      num_images: 1,
      aspect_ratio: falAspectRatio,
      output_format: 'png',
      resolution: params.resolution || '2K', // 支持 1K, 2K, 4K
    };

    // ✅ 关键修复：根据官方文档，edit模型使用 image_urls 参数
    // 参考：https://fal.ai/models/fal-ai/nano-banana-pro/edit/api
    if (hasReferenceImage) {
      input.image_urls = [params.referenceImageUrl]; // ✅ 使用 image_urls（复数）
      console.log('[FAL] 🎨 使用 edit 模型，image_urls:', input.image_urls);
    }

    console.log('[FAL] 请求参数:', {
      model: modelName,
      prompt: input.prompt.substring(0, 100) + '...',
      hasReferenceImage,
    });

    // ✅ 改为异步模式：使用 queue.submit() 立即返回，不等待完成
    // 说明：
    // - 使用 queue.submit() 提交任务，立即返回 request_id
    // - 前端将通过轮询 query API 查询任务状态
    // - 这样可以避免超过 Vercel 的超时限制
    let requestId = '';
    const maxRetries = 2;
    let attempt = 0;

    while (attempt <= maxRetries) {
      try {
        const { request_id } = await fal.queue.submit(modelName, {
          input: input as any,
        });
        requestId = request_id;
        break;
      } catch (error: any) {
        attempt++;
        const isNetworkError =
          error.message?.includes('fetch failed') ||
          error.status >= 500 ||
          error.status === 429;

        if (attempt <= maxRetries && isNetworkError) {
          console.warn(
            `[FAL] 提交任务第 ${attempt} 次尝试失败 (${
              error.message
            })，正在重试...`
          );
          await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
          continue;
        }
        throw error;
      }
    }

    console.log('[FAL] 任务创建成功, request_id:', requestId);

    // ✅ 返回 taskId，前端将通过轮询查询任务状态
    // 注意：这里不等待生成完成，避免超过 Vercel 超时限制
    return {
      success: true,
      taskId: requestId, // 直接使用 FAL 的 request_id
      imageUrls: undefined, // 异步模式下不立即返回图片，需要前端轮询查询
    };
  } catch (error: any) {
    console.warn('⚠️ FAL 异常:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * 尝试使用KIE生成（nano-banana-pro）
 */
async function tryGenerateWithKie(
  params: GenerateParams,
  apiKey: string
): Promise<{
  success: boolean;
  taskId?: string;
  imageUrls?: string[];
  error?: string;
}> {
  try {
    const hasReferenceImage = !!params.referenceImageUrl;
    console.log(
      `🔄 尝试使用 KIE (nano-banana-pro) 生成...${hasReferenceImage ? ' [参考图模式]' : ''}`
    );

    const prompt = buildInfographicPrompt(params, hasReferenceImage);
    if (hasReferenceImage) {
      console.log('[KIE] 🎨 使用强化风格参考模式');
    }

    const payload = {
      model: 'nano-banana-pro',
      input: {
        prompt,
        aspect_ratio: params.aspectRatio || '1:1',
        resolution: params.resolution || '1K',
        output_format: params.outputFormat || 'png',
        image_input: hasReferenceImage ? [params.referenceImageUrl] : undefined, // 添加参考图支持
      },
    };

    if (hasReferenceImage) {
      console.log('[KIE] image_input:', payload.input.image_input);
    }

    const resp = await fetch(`${KIE_BASE_URL}/jobs/createTask`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!resp.ok) {
      const text = await resp.text();
      console.warn('⚠️ KIE 请求失败:', resp.status, text);
      return { success: false, error: `KIE API error: ${resp.status}` };
    }

    const data = await resp.json();

    if (data.code !== 200 || !data.data?.taskId) {
      console.warn('⚠️ KIE 返回错误:', data);
      return { success: false, error: data.message || 'Unknown error' };
    }

    console.log('✅ KIE 任务创建成功, taskId:', data.data.taskId);
    return { success: true, taskId: data.data.taskId };
  } catch (error: any) {
    console.warn('⚠️ KIE 异常:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * 尝试使用Replicate生成（google/nano-banana-pro模型）
 */
async function tryGenerateWithReplicate(
  params: GenerateParams,
  apiToken: string
): Promise<{
  success: boolean;
  taskId?: string;
  imageUrls?: string[];
  error?: string;
}> {
  try {
    const hasReferenceImage = !!params.referenceImageUrl;
    console.log(
      `🔄 尝试使用 Replicate (google/nano-banana-pro) 生成...${hasReferenceImage ? ' [参考图模式]' : ''}`
    );

    const prompt = buildInfographicPrompt(params, hasReferenceImage);
    if (hasReferenceImage) {
      console.log('[Replicate] 🎨 使用强化风格参考模式');
    }

    const Replicate = require('replicate');
    const replicate = new Replicate({ auth: apiToken });

    // google/nano-banana-pro 的参数结构（与 KIE 类似）
    const input: any = {
      prompt,
      aspect_ratio: params.aspectRatio || '1:1',
      resolution: params.resolution || '1K', // 1K/2K/4K
      output_format: params.outputFormat || 'png',
      image_input: hasReferenceImage ? [params.referenceImageUrl] : undefined, // 添加参考图支持
    };

    if (hasReferenceImage) {
      console.log('[Replicate] image_input:', input.image_input);
    }

    console.log('[Replicate] 请求参数:', {
      model: 'google/nano-banana-pro',
      input: {
        ...input,
        prompt: input.prompt.substring(0, 100) + '...',
      },
    });

    // ✅ 改为异步模式：创建预测任务但不等待完成（避免 Vercel 超时）
    // 说明：
    // - 使用 predictions.create() 立即返回 taskId，不会阻塞 Serverless 函数
    // - 前端将通过轮询 query API 查询任务状态
    // - 这样可以避免超过 Vercel 的 10 秒超时限制
    const prediction = await replicate.predictions.create({
      model: 'google/nano-banana-pro',
      input,
    });

    console.log('[Replicate] 任务创建成功, predictionId:', prediction.id);
    console.log('[Replicate] 任务状态:', prediction.status);

    // ✅ 返回 taskId，前端将通过轮询查询任务状态
    // 注意：这里不等待生成完成，避免超过 Vercel 10 秒超时限制
    return {
      success: true,
      taskId: prediction.id, // 返回 Replicate 的 prediction ID
      imageUrls: undefined, // 异步模式下不立即返回图片，需要前端轮询查询
    };
  } catch (error: any) {
    console.warn('⚠️ Replicate 异常:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * 下载图片并转换为 base64
 *
 * 非程序员解释：
 * - 从 URL 下载图片文件
 * - 将图片数据转换为 base64 编码字符串
 * - 用于 APIYI 图生图模式（Gemini 原生格式需要 base64 图片）
 */
async function downloadImageAsBase64(
  imageUrl: string
): Promise<{ base64: string; mimeType: string } | null> {
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

    console.log(
      `[APIYI] ✅ 参考图下载成功，大小: ${(base64.length / 1024).toFixed(1)} KB, 类型: ${mimeType}`
    );

    return { base64, mimeType };
  } catch (error: any) {
    console.warn('[APIYI] 下载参考图异常:', error.message);
    return null;
  }
}

/**
 * 尝试使用APIYI生成（Gemini 3 Pro Image）- 同步模式
 *
 * 非程序员解释：
 * - APIYI 统一使用 Google Gemini 原生格式，支持 aspectRatio 和 imageSize
 * - 文生图：直接传递文本 prompt
 * - 图生图：将参考图转为 base64，通过 inline_data 传递
 * - 同步接口：直接等待生成完成，返回 base64 图片数据
 * - 速度快（约 8-22 秒），价格便宜（$0.05/张）
 *
 * 重要修复（2026-02-12）：
 * - 之前图生图使用 OpenAI 兼容格式，不支持分辨率参数
 * - 现在统一使用 Gemini 原生格式 + base64 图片，支持完整的分辨率控制
 */
async function tryGenerateWithApiyi(
  params: GenerateParams,
  apiKey: string
): Promise<{
  success: boolean;
  taskId?: string;
  imageUrls?: string[];
  error?: string;
}> {
  try {
    const hasReferenceImage = !!params.referenceImageUrl;
    console.log(
      `🔄 尝试使用 APIYI (gemini-3-pro-image-preview) 生成...${hasReferenceImage ? ' [参考图模式]' : ''}`
    );

    const prompt = buildInfographicPrompt(params, hasReferenceImage);
    if (hasReferenceImage) {
      console.log('[APIYI] 🎨 使用强化风格参考模式');
    }

    // 映射分辨率和宽高比
    const imageSize = params.resolution || '2K';
    const aspectRatio = params.aspectRatio || '1:1';

    // 根据分辨率设置超时时间
    const timeoutMap: Record<string, number> = {
      '1K': 180000,
      '2K': 300000,
      '4K': 360000,
    };
    const timeout = timeoutMap[imageSize] || 300000;

    // 🎯 统一使用 Gemini 原生格式端点（支持分辨率参数）
    const apiUrl = APIYI_TEXT2IMG_URL;

    // 构建请求体（Gemini 原生格式）
    let parts: any[] = [{ text: prompt }];

    // 如果有参考图，下载并转为 base64，添加到 parts 中
    if (hasReferenceImage && params.referenceImageUrl) {
      const imageData = await downloadImageAsBase64(params.referenceImageUrl);

      if (!imageData) {
        console.warn('[APIYI] ⚠️ 无法下载参考图，降级为纯文生图模式');
      } else {
        // 将 base64 图片添加到 parts 数组
        parts.push({
          inline_data: {
            mime_type: imageData.mimeType,
            data: imageData.base64,
          },
        });
        console.log(
          '[APIYI] 🎨 使用图生图模式（Gemini 原生格式 + base64 图片）'
        );
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
      promptLength: prompt.length,
      hasReferenceImage,
      partsCount: parts.length,
    });

    // 发送请求（同步等待）
    const startTime = Date.now();
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeout),
    });

    const elapsed = (Date.now() - startTime) / 1000;
    console.log(`[APIYI] 请求耗时: ${elapsed.toFixed(1)} 秒`);

    if (!response.ok) {
      const errorText = await response.text();
      console.warn('⚠️ APIYI 请求失败:', response.status, errorText);
      return {
        success: false,
        error: `APIYI API error: ${response.status} - ${errorText}`,
      };
    }

    const data = await response.json();

    // 解析 Gemini 原生格式的响应
    if (!data.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data) {
      const finishReason = data.candidates?.[0]?.finishReason;
      if (finishReason && finishReason !== 'STOP') {
        console.warn('[APIYI] 内容被拒绝:', finishReason);
        return { success: false, error: `Content rejected: ${finishReason}` };
      }
      console.warn(
        '[APIYI] 响应格式异常:',
        JSON.stringify(data).substring(0, 500)
      );
      return { success: false, error: 'Invalid response format from APIYI' };
    }

    const base64Data = data.candidates[0].content.parts[0].inlineData.data;
    const mimeType =
      data.candidates[0].content.parts[0].inlineData.mimeType || 'image/png';

    // 构建 data URL
    const dataUrl = `data:${mimeType};base64,${base64Data}`;

    console.log(
      `✅ APIYI 生成成功！图片大小: ${(base64Data.length / 1024).toFixed(1)} KB`
    );

    // 返回结果
    return {
      success: true,
      taskId: `apiyi-${Date.now()}`,
      imageUrls: [dataUrl],
    };
  } catch (error: any) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') {
      console.warn('⚠️ APIYI 请求超时');
      return { success: false, error: 'APIYI request timeout' };
    }
    console.warn('⚠️ APIYI 异常:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * 尝试使用Together AI生成（FLUX模型）
 */
async function tryGenerateWithTogether(
  params: GenerateParams,
  apiKey: string
): Promise<{
  success: boolean;
  taskId?: string;
  imageUrls?: string[];
  error?: string;
}> {
  try {
    console.log('🔄 尝试使用 Together AI (FLUX) 生成...');

    const prompt = buildInfographicPrompt(params, false);

    // 解析分辨率
    let width = 1024;
    let height = 1024;
    if (params.aspectRatio) {
      const [w, h] = params.aspectRatio.split(':').map(Number);
      if (params.resolution === '2K') {
        const scale = 2048 / Math.max(w, h);
        width = Math.round(w * scale);
        height = Math.round(h * scale);
      } else if (params.resolution === '4K') {
        // Together AI不支持4K，降级到2K
        const scale = 2048 / Math.max(w, h);
        width = Math.round(w * scale);
        height = Math.round(h * scale);
      } else {
        const scale = 1024 / Math.max(w, h);
        width = Math.round(w * scale);
        height = Math.round(h * scale);
      }
    }

    const requestBody = {
      model: 'black-forest-labs/FLUX.1-schnell',
      prompt,
      width,
      height,
      steps: 4,
      n: 1,
    };

    const response = await fetch(
      'https://api.together.xyz/v1/images/generations',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(requestBody),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.warn('⚠️ Together AI 请求失败:', response.status, errorText);
      return { success: false, error: `Together AI error: ${response.status}` };
    }

    const result = await response.json();
    const imageUrls =
      result.data?.map((item: any) => item.url).filter(Boolean) || [];

    console.log('✅ Together AI 生成成功，返回', imageUrls.length, '张图片');

    return {
      success: true,
      taskId: result.id || `together-${Date.now()}`,
      imageUrls,
    };
  } catch (error: any) {
    console.warn('⚠️ Together AI 异常:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * 尝试使用Novita AI生成（FLUX模型）
 */
async function tryGenerateWithNovita(
  params: GenerateParams,
  apiKey: string
): Promise<{
  success: boolean;
  taskId?: string;
  imageUrls?: string[];
  error?: string;
}> {
  try {
    console.log('🔄 尝试使用 Novita AI (FLUX) 生成...');

    const prompt = buildInfographicPrompt(params, false);

    // 解析分辨率
    let width = 1024;
    let height = 1024;
    if (params.aspectRatio) {
      const [w, h] = params.aspectRatio.split(':').map(Number);
      if (params.resolution === '2K') {
        const scale = 2048 / Math.max(w, h);
        width = Math.round(w * scale);
        height = Math.round(h * scale);
      } else if (params.resolution === '4K') {
        // Novita AI最大支持2048px
        const scale = 2048 / Math.max(w, h);
        width = Math.round(w * scale);
        height = Math.round(h * scale);
      } else {
        const scale = 1024 / Math.max(w, h);
        width = Math.round(w * scale);
        height = Math.round(h * scale);
      }
    }

    const requestBody = {
      model_name: 'flux1-schnell-fp8_v2.0',
      prompt,
      width,
      height,
      image_num: 1,
      steps: 20,
      seed: -1,
    };

    const response = await fetch('https://api.novita.ai/v3/async/txt2img', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.warn('⚠️ Novita AI 请求失败:', response.status, errorText);
      return { success: false, error: `Novita AI error: ${response.status}` };
    }

    const result = await response.json();

    console.log('✅ Novita AI 任务创建成功, taskId:', result.task_id);

    return {
      success: true,
      taskId: result.task_id,
    };
  } catch (error: any) {
    console.warn('⚠️ Novita AI 异常:', error.message);
    return { success: false, error: error.message };
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      content,
      aspectRatio = '1:1',
      resolution = '1K',
      outputFormat = 'png',
      stylePreset: stylePresetRaw = 'adaptive_smart',
      styleIntensity: styleIntensityRaw = 'balanced',
      referenceImageUrl, // 新增：参考图URL（可选）
    } = body || {};
    const stylePreset = normalizeStylePreset(stylePresetRaw);
    const styleIntensity = normalizeAdaptiveIntensity(styleIntensityRaw);

    if (!content || typeof content !== 'string' || !content.trim()) {
      return NextResponse.json(
        { success: false, error: '缺少用于生成信息图的文本内容' },
        { status: 400 }
      );
    }

    // 如果有参考图，记录日志
    if (referenceImageUrl) {
      console.log(
        '[Infographic] 使用参考图模式，参考图URL:',
        referenceImageUrl
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
    // 动态计算积分消耗：4K=12积分，其他(1K/2K)=6积分
    const requiredCredits = resolution === '4K' ? 12 : 6;

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
    let consumedCredit;
    try {
      consumedCredit = await consumeCredits({
        userId: user.id,
        credits: requiredCredits,
        scene: 'ai_infographic',
        description: `AI Infographic - Generate with fallback`,
        metadata: JSON.stringify({
          aspectRatio,
          resolution,
          outputFormat,
          stylePreset,
          styleIntensity,
        }),
      });

      console.log('[Infographic] 积分消耗成功:', {
        creditId: consumedCredit?.id,
        transactionNo: consumedCredit?.transactionNo,
        credits: requiredCredits,
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

    // 获取配置
    const configs = await getAllConfigs();

    const params: GenerateParams = {
      content,
      aspectRatio,
      resolution,
      outputFormat,
      stylePreset,
      styleIntensity,
      referenceImageUrl, // 传递参考图URL
    };

    // 定义所有可用的提供商配置（静态映射）
    const providerConfigs: Record<
      ProviderName,
      {
        name: string;
        key: string | undefined;
        envKey: string | undefined;
        fn: typeof tryGenerateWithFal;
      }
    > = {
      FAL: {
        name: 'FAL',
        key: configs.fal_key,
        envKey: process.env.FAL_KEY,
        fn: tryGenerateWithFal,
      },
      KIE: {
        name: 'KIE',
        key: configs.kie_api_key,
        envKey: process.env.KIE_NANO_BANANA_PRO_KEY,
        fn: tryGenerateWithKie,
      },
      Replicate: {
        name: 'Replicate',
        key: configs.replicate_api_token,
        envKey: process.env.REPLICATE_API_TOKEN,
        fn: tryGenerateWithReplicate,
      },
      APIYI: {
        name: 'APIYI',
        key: configs.apiyi_api_key, // 从数据库配置获取
        envKey: process.env.APIYI_API_KEY, // 回退到环境变量
        fn: tryGenerateWithApiyi,
      },
    };

    // 根据环境变量 IMAGE_PROVIDER_PRIORITY 获取优先级顺序
    // 非程序员解释：这里会读取环境变量，按配置的顺序排列提供商
    const priorityOrder = getProviderPriority();
    const providers = priorityOrder.map((name) => providerConfigs[name]);

    const errors: string[] = [];

    for (const provider of providers) {
      const apiKey = provider.key || provider.envKey;

      if (!apiKey) {
        console.log(`⏭️ 跳过 ${provider.name}（未配置API Key）`);
        continue;
      }

      console.log(`\n🎯 尝试提供商: ${provider.name}`);

      const result = await provider.fn(params, apiKey);

      if (result.success) {
        console.log(`✅ ${provider.name} 生成成功！`);

        // --- 记录到通用 AI 任务表（ai_task），方便在 /library/infographics 里统一展示 ---
        // 非程序员解释：
        // - 这里不会再次扣积分（上面已经调用过 consumeCredits），只是在 ai_task 这张"任务流水表"里记一笔
        // - 以后不管是 Infographic、PPT 还是别的图片任务，都可以用一套通用的历史列表组件来查看
        // - 🎯 返回数据库记录 ID，用于前端编辑后保存历史记录
        let dbTaskId: string | null = null;
        try {
          // 简单归一化一下"模型名称"，方便后续筛选/统计（只是记录用途，不影响实际调用）
          const modelName =
            provider.name === 'KIE'
              ? 'nano-banana-pro'
              : provider.name === 'Replicate'
                ? 'google/nano-banana-pro'
                : 'unknown';

          // 如果已经直接拿到了图片 URL（同步接口），可以直接把结果标记为 SUCCESS；
          // 如果只是拿到了 taskId（异步接口），先记录为 PENDING，后续有需要再扩展为回调/轮询更新。
          const hasImages =
            Array.isArray(result.imageUrls) && result.imageUrls.length > 0;
          const taskStatus = hasImages
            ? AITaskStatus.SUCCESS
            : AITaskStatus.PENDING;

          console.log(
            '[Infographic] 准备创建任务记录，creditId:',
            consumedCredit?.id
          );

          // 🎯 保存返回值，获取数据库记录 ID
          const dbTask = await createAITaskRecordOnly({
            // 必填字段：谁、什么类型、用哪个提供商
            userId: user.id,
            mediaType: AIMediaType.IMAGE,
            provider: provider.name,
            model: modelName,
            // 为了避免把整篇原文塞进表里，这里只存一个简要描述；
            // 真正的全文内容依然只保留在前端/你的原始文件里。
            prompt: `Infographic from study content (len=${content.length})`,
            options: JSON.stringify({
              aspectRatio,
              resolution,
              outputFormat,
              stylePreset,
              styleIntensity,
            }),
            scene: 'ai_infographic',
            costCredits: requiredCredits,
            creditId: consumedCredit?.id || null,
            status: taskStatus,
            taskId: result.taskId || null,
            taskInfo: hasImages
              ? JSON.stringify({
                  status: 'SUCCESS',
                })
              : null,
            taskResult:
              hasImages && result.imageUrls
                ? JSON.stringify({
                    imageUrls: result.imageUrls,
                  })
                : null,
          });

          dbTaskId = dbTask?.id || null;
          console.log('[Infographic] ✅ 任务记录创建成功，dbTaskId:', dbTaskId);
        } catch (logError) {
          // 记录历史失败不影响用户正常使用，只打印日志方便排查
          console.error(
            '[Infographic] Failed to create ai_task record:',
            logError
          );
        }

        return NextResponse.json({
          success: true,
          taskId: result.taskId,
          dbTaskId, // 🎯 返回数据库记录 ID，用于编辑后保存历史
          imageUrls: result.imageUrls, // 如果是同步API，直接返回图片URL
          provider: provider.name,
          fallbackUsed: provider.name !== 'KIE', // 是否使用了托底服务
        });
      } else {
        errors.push(`${provider.name}: ${result.error}`);
        console.log(`❌ ${provider.name} 失败，尝试下一个提供商...`);
      }
    }

    // 所有提供商都失败
    console.error('❌ 所有提供商都失败:', errors);

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
        error: '所有图片生成服务都暂时不可用，请稍后重试',
        details: errors,
      },
      { status: 500 }
    );
  } catch (error) {
    console.error('Generate with fallback error:', error);
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

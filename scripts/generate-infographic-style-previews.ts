import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const KIE_BASE_URL = 'https://api.kie.ai/api/v1';

type StylePresetId =
  | 'hand_drawn_infographic'
  | 'isometric_thick_line_macaron'
  | 'minimal_line_storytelling_compare'
  | 'flat_vector_education'
  | 'flat_design_modern';

const STYLE_PRESET_PROMPTS: Record<StylePresetId, string> = {
  hand_drawn_infographic: `Style: Universal hand-drawn cartoon infographic.
- Composition: 3:4 vertical modular layout with information distributed in a top-to-bottom hierarchy and generous whitespace.
- Visual Elements: Minimal yet lively hand-drawn icons, metaphorical cartoon characters, and relevant illustrative scenes that make abstract concepts intuitive.
- Art Rules: Use only hand-drawn lines and tactile sketch textures. Absolutely no photorealism or photography. Keep the palette clean, soft, and friendly.
- Text: Extract core keywords only, rendered in a clear handwritten-style typographic voice.`,
  isometric_thick_line_macaron: `Style: Universal isometric 2.5D cartoon infographic.
- Composition: 3:4 vertical layout with modular blocks stacked from top to bottom.
- Perspective: Consistent 30-degree isometric perspective.
- Line Rules: Bold black outlines around all objects.
- Color Rules: Soft low-saturation macaron palette with a clean off-white background.
- Visual Elements: Simple geometric 3D icons and rounded text bubbles.`,
  minimal_line_storytelling_compare: `Style: Minimal line-based narrative comparison infographic.
- Composition: 3:4 vertical dual-column comparison layout.
- Visual Elements: Stick figures, expressive symbols, and concise keyword blocks.
- Art Rules: White background, thin black hand-drawn lines, and minimal red/green accents.`,
  flat_vector_education: `Create an educational infographic to explain the provided content.
- Style: Flat vector.
- Composition: Choose a suitable 3:4 vertical educational layout.
- Visual Elements: Select representative teaching visuals automatically.`,
  flat_design_modern: `Style: Universal flat design infographic.
- Composition: 3:4 vertical hierarchical layout with strong whitespace.
- Visual Elements: Minimal 2D flat icons, illustrated characters, and straight guiding lines.
- Art Rules: No shadows, no gradients, no depth; keep the color palette modern and polished.`,
};

const LANGUAGE_RULE = `⚠️ 关键语言规则——绝对不可协商 ⚠️
信息图中的所有文字必须与下方输入内容的语言完全一致。
- 输入为中文（中文）→ 输出必须为中文（中文标签、中文标题、中文说明）
- 输入为英文 → 输出必须为英文
- 其他语言 → 输出必须为相同语言

🚫 禁止翻译成英文或任何其他语言。严格禁止。
🚫 针对中文内容，禁止使用英文标签。
输出语言必须与输入语言完全一致（逐字意义上的一致）。`;

const CONTENT = `【高效学习闭环（预览版）】
1) 输入：明确目标，拆分关键问题
2) 处理：番茄钟专注25分钟，完成最小任务
3) 输出：用3句话复盘并形成可执行下一步
关键词：目标清晰、专注执行、及时复盘`;

const STYLE_ORDER: StylePresetId[] = [
  'hand_drawn_infographic',
  'isometric_thick_line_macaron',
  'minimal_line_storytelling_compare',
  'flat_vector_education',
  'flat_design_modern',
];

function buildPrompt(stylePreset: StylePresetId): string {
  return `创建一张教育型信息图，用来解释下方提供的文件或文本内容。你需要自行选择一些典型的视觉元素。

Selected Style Instructions:
${STYLE_PRESET_PROMPTS[stylePreset]}

${LANGUAGE_RULE}

Content:
${CONTENT}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function createKieTask(
  apiKey: string,
  stylePreset: StylePresetId
): Promise<string> {
  const payload = {
    model: 'nano-banana-pro',
    input: {
      prompt: buildPrompt(stylePreset),
      aspect_ratio: '3:4',
      resolution: '1K',
      output_format: 'png',
    },
  };

  const resp = await fetch(`${KIE_BASE_URL}/jobs/createTask`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    throw new Error(`createTask failed: ${resp.status} ${await resp.text()}`);
  }

  const data = await resp.json();
  if (data.code !== 200 || !data.data?.taskId) {
    throw new Error(`createTask returned error: ${JSON.stringify(data)}`);
  }

  return data.data.taskId as string;
}

async function queryKieTask(
  apiKey: string,
  taskId: string
): Promise<{ state: string; urls: string[] }> {
  const resp = await fetch(
    `${KIE_BASE_URL}/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`,
    {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
    }
  );

  if (!resp.ok) {
    throw new Error(`recordInfo failed: ${resp.status} ${await resp.text()}`);
  }

  const data = await resp.json();
  if (data.code !== 200) {
    throw new Error(`recordInfo returned error: ${JSON.stringify(data)}`);
  }

  const state = data.data?.state || 'pending';
  const resultJson = data.data?.resultJson;
  let urls: string[] = [];

  if (resultJson) {
    if (typeof resultJson === 'string') {
      try {
        const parsed = JSON.parse(resultJson);
        urls = parsed?.resultUrls || [];
      } catch {
        urls = [];
      }
    } else {
      urls = resultJson?.resultUrls || [];
    }
  }

  return { state, urls };
}

async function waitForKieResult(
  apiKey: string,
  taskId: string
): Promise<string> {
  const maxAttempts = 120;

  for (let i = 1; i <= maxAttempts; i++) {
    const { state, urls } = await queryKieTask(apiKey, taskId);
    console.log(
      `[${taskId}] poll ${i}/${maxAttempts} state=${state} urls=${urls.length}`
    );

    if (state === 'success' && urls.length > 0) {
      return urls[0];
    }
    if (state === 'fail') {
      throw new Error(`task failed: ${taskId}`);
    }

    await sleep(3000);
  }

  throw new Error(`task timeout: ${taskId}`);
}

async function main() {
  const apiKey = process.env.KIE_NANO_BANANA_PRO_KEY;
  if (!apiKey) {
    throw new Error('KIE_NANO_BANANA_PRO_KEY not found in .env.local');
  }

  const results: Record<string, string> = {};

  for (const style of STYLE_ORDER) {
    console.log(`\n=== Generating style: ${style} ===`);
    const taskId = await createKieTask(apiKey, style);
    console.log(`Task created: ${taskId}`);
    const imageUrl = await waitForKieResult(apiKey, taskId);
    results[style] = imageUrl;
    console.log(`Done: ${style} -> ${imageUrl}`);
  }

  console.log('\n=== Final URLs ===');
  for (const style of STYLE_ORDER) {
    console.log(`${style}: ${results[style]}`);
  }
}

main().catch((error) => {
  console.error('Generate style previews failed:', error);
  process.exit(1);
});

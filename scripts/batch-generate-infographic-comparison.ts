import 'dotenv/config';

import fs from 'fs/promises';
import path from 'path';

import sharp from 'sharp';

import { systemConfig } from '../src/config/db/schema';
import { db } from '../src/core/db';
import { getStorageServiceWithConfigs } from '../src/shared/services/storage';

const KIE_BASE_URL = 'https://api.kie.ai/api/v1';
const DESKTOP_OUTPUT_DIR = path.join(process.env.USERPROFILE || '', 'Desktop', 'Infographic');
const CONTENT =
  'Gateway 像小区门禁，Agent 像小区里的住户。OpenClaw 的意思是：外人不能直接去敲住户门，必须先过门禁；门禁通过了，才会被带到具体住户。';

type StylePresetId =
  | 'adaptive_smart'
  | 'hand_drawn_infographic'
  | 'isometric_thick_line_macaron'
  | 'minimal_line_storytelling_compare'
  | 'flat_vector_education'
  | 'flat_design_modern';

type VariantId = 'reference' | 'prompt_only';

interface StyleConfig {
  id: StylePresetId;
  displayName: string;
}

interface BatchTask {
  style: StyleConfig;
  variant: VariantId;
  fileName: string;
  referenceImageUrl?: string;
}

interface KieCreateResponse {
  code: number;
  message?: string;
  msg?: string;
  data?: {
    taskId?: string;
  };
}

interface KieQueryResponse {
  code: number;
  message?: string;
  msg?: string;
  data?: {
    state?: string;
    resultJson?: string | { resultUrls?: string[] };
  };
}

async function loadConfigsFromDb() {
  const rows = await db().select().from(systemConfig);
  const configs: Record<string, string> = {};

  for (const item of rows) {
    configs[item.name] = item.value || '';
  }

  return {
    ...configs,
    r2_bucket_name: configs.r2_bucket_name || process.env.R2_BUCKET_NAME || '',
    r2_access_key: configs.r2_access_key || process.env.R2_ACCESS_KEY || '',
    r2_secret_key: configs.r2_secret_key || process.env.R2_SECRET_KEY || '',
    r2_endpoint: configs.r2_endpoint || process.env.R2_ENDPOINT || '',
    r2_domain: configs.r2_domain || process.env.R2_DOMAIN || '',
    r2_account_id: configs.r2_account_id || process.env.R2_ACCOUNT_ID || '',
  };
}

const STYLE_CONFIGS: StyleConfig[] = [
  { id: 'adaptive_smart', displayName: '智能适配风格' },
  { id: 'hand_drawn_infographic', displayName: '手绘卡通风' },
  { id: 'isometric_thick_line_macaron', displayName: '等距粗线马卡龙' },
  { id: 'minimal_line_storytelling_compare', displayName: '极简线条对比风' },
  { id: 'flat_vector_education', displayName: '教育扁平矢量风' },
  { id: 'flat_design_modern', displayName: '扁平插画设计' },
];

const STYLE_PRESET_PROMPTS: Record<StylePresetId, string> = {
  adaptive_smart: `Style: Adaptive, content-native infographic.
- Composition: Choose the best layout based on the content structure, with strong hierarchy and generous whitespace.
- Visual Elements: Choose iconography, illustration density, and chart style according to topic tone and audience intent.
- Art Rules: Maintain a coherent visual system and avoid random decoration.
- Text: Keep labels concise and scannable.
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

const REFERENCE_IMAGE_URLS: Partial<Record<StylePresetId, string>> = {
  hand_drawn_infographic:
    'https://cdn.studyhacks.ai/infographic/style-presets/v1/hand_drawn_infographic.png',
  isometric_thick_line_macaron:
    'https://cdn.studyhacks.ai/infographic/style-presets/v1/isometric_thick_line_macaron.png',
  minimal_line_storytelling_compare:
    'https://cdn.studyhacks.ai/infographic/style-presets/v1/minimal_line_storytelling_compare.png',
  flat_vector_education:
    'https://cdn.studyhacks.ai/infographic/style-presets/v1/flat_vector_education.png',
  flat_design_modern:
    'https://cdn.studyhacks.ai/infographic/style-presets/v1/flat_design_modern.png',
};

const LANGUAGE_RULE = `CRITICAL LANGUAGE RULE:
- The source content is Chinese.
- All visible text in the infographic must stay in Chinese.
- Do not translate labels, titles, or callouts into English.`;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildAdaptiveStylePrompt(content: string): string {
  const text = content.toLowerCase();
  const hasComparisonSignals = /像|比喻|类比|vs|对比/.test(text);
  const hasProcessSignals = /必须|先|通过了|才会|流程|步骤/.test(text);
  const hasTechSignals = /gateway|agent|openclaw/.test(text);

  const compositionArchetype = hasComparisonSignals
    ? 'Analogy-driven comparison layout with clear role mapping and directional arrows.'
    : hasProcessSignals
      ? 'Sequential flow layout with entry point, gate check, and destination mapping.'
      : 'Editorial modular layout with balanced storytelling sections.';

  const narrativeMode = hasProcessSignals
    ? 'How-to explanation with explicit step-by-step transitions.'
    : 'Concept explainer with simple mental models.';

  const domainVisualLanguage = hasTechSignals
    ? 'Tech-product visual language using gateways, nodes, access control metaphors, and modular components.'
    : 'Universal knowledge visual language with broad accessibility.';

  return `Style: Adaptive style generated from content semantics and communication intent.
- Composition Archetype: ${compositionArchetype}
- Narrative Mode: ${narrativeMode}
- Domain Visual Language: ${domainVisualLanguage}
- Audience Calibration: Beginner-friendly, highly intuitive, and metaphor-first.
- Color Strategy: Use a neutral-professional palette with one clear accent color family.
- Typography Voice: Modern utilitarian typography optimized for fast scanning.
- Art Rules: No photorealism, no random decorative clutter, keep hierarchy explicit and consistent.
- Goal: Synthesize the best-fit style for this specific content.`;
}

function buildInfographicPrompt(
  styleId: StylePresetId,
  content: string,
  referenceImageUrl?: string
): string {
  const stylePrompt =
    styleId === 'adaptive_smart'
      ? buildAdaptiveStylePrompt(content)
      : STYLE_PRESET_PROMPTS[styleId];

  if (referenceImageUrl) {
    return `[Reference-first style mode]
You MUST strongly align the final infographic's visual style with the provided reference image.
- Match the overall composition logic, illustration language, and color feeling from the reference.
- Keep the content original and based only on the source text below.
- Use the preset style instructions only as a secondary preference when they do not conflict with the reference.

Selected Style Instructions:
${stylePrompt}

${LANGUAGE_RULE}

Content:
${content}`;
  }

  return `Create one educational infographic that explains the source content below.

Selected Style Instructions:
${stylePrompt}

${LANGUAGE_RULE}

Content:
${content}`;
}

async function createAdaptiveReferenceBuffer(): Promise<Buffer> {
  const svg = `
  <svg width="1600" height="900" viewBox="0 0 1600 900" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="1600" height="900" fill="#F8FBFF"/>
    <rect x="96" y="92" width="1408" height="2" fill="#0EA5E91F"/>
    <rect x="96" y="806" width="1408" height="2" fill="#0EA5E914"/>
    <circle cx="800" cy="220" r="220" fill="#0EA5E916"/>
    <text x="800" y="540" text-anchor="middle" font-size="320" font-weight="900" font-family="Outfit, Arial, sans-serif" fill="#0EA5E9" letter-spacing="36">AI</text>
  </svg>`;

  return await sharp(Buffer.from(svg)).png().toBuffer();
}

async function uploadAdaptiveReference(): Promise<string> {
  const configs = await loadConfigsFromDb();
  const storageService = getStorageServiceWithConfigs(configs as any);
  const body = await createAdaptiveReferenceBuffer();
  const key = 'infographic/style-presets/v1/adaptive_smart_reference.png';
  const uploadResult = await storageService.uploadFile({
    body,
    key,
    contentType: 'image/png',
    disposition: 'inline',
  });

  if (!uploadResult.success || !uploadResult.url) {
    throw new Error(
      `Failed to upload adaptive reference image: ${uploadResult.error || 'unknown error'}`
    );
  }

  return uploadResult.url;
}

async function getKieApiKey(): Promise<string> {
  const configs = await loadConfigsFromDb();
  const apiKey =
    configs.kie_api_key ||
    process.env.KIE_NANO_BANANA_PRO_KEY ||
    process.env.KIE_API_KEY ||
    '';

  if (!apiKey) {
    throw new Error('KIE API key not found in configs or environment');
  }

  return apiKey;
}

async function createKieTask(
  apiKey: string,
  task: BatchTask
): Promise<string> {
  const prompt = buildInfographicPrompt(
    task.style.id,
    CONTENT,
    task.referenceImageUrl
  );
  const payload = {
    model: 'nano-banana-pro',
    input: {
      prompt,
      aspect_ratio: '16:9',
      resolution: '2K',
      output_format: 'png',
      image_input: task.referenceImageUrl ? [task.referenceImageUrl] : undefined,
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

  const data = (await resp.json()) as KieCreateResponse;
  if (data.code !== 200 || !data.data?.taskId) {
    throw new Error(
      `createTask returned error: ${data.message || data.msg || JSON.stringify(data)}`
    );
  }

  return data.data.taskId;
}

async function queryKieTask(
  apiKey: string,
  taskId: string
): Promise<{ state: string; urls: string[] }> {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
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

      const data = (await resp.json()) as KieQueryResponse;
      if (data.code !== 200) {
        throw new Error(
          `recordInfo returned error: ${data.message || data.msg || JSON.stringify(data)}`
        );
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
          urls = resultJson.resultUrls || [];
        }
      }

      return { state, urls };
    } catch (error) {
      lastError = error;
      if (attempt < 3) {
        await sleep(1500 * attempt);
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error('queryKieTask failed');
}

async function waitForKieResult(
  apiKey: string,
  taskId: string,
  label: string
): Promise<string> {
  const maxAttempts = 180;

  for (let i = 1; i <= maxAttempts; i++) {
    const { state, urls } = await queryKieTask(apiKey, taskId);
    console.log(`[${label}] poll ${i}/${maxAttempts} state=${state} urls=${urls.length}`);

    if (state === 'success' && urls.length > 0) {
      return urls[0];
    }
    if (state === 'fail') {
      throw new Error(`task failed: ${taskId}`);
    }

    await sleep(5000);
  }

  throw new Error(`task timeout: ${taskId}`);
}

async function downloadToFile(imageUrl: string, outputPath: string): Promise<void> {
  const resp = await fetch(imageUrl);
  if (!resp.ok) {
    throw new Error(`download failed: ${resp.status} ${resp.statusText}`);
  }

  const arrayBuffer = await resp.arrayBuffer();
  await fs.writeFile(outputPath, Buffer.from(arrayBuffer));
}

function buildBatchTasks(
  adaptiveReferenceUrl: string
): BatchTask[] {
  return STYLE_CONFIGS.flatMap((style) => {
    const referenceUrl =
      style.id === 'adaptive_smart'
        ? adaptiveReferenceUrl
        : REFERENCE_IMAGE_URLS[style.id];

    return [
      {
        style,
        variant: 'reference',
        referenceImageUrl: referenceUrl,
        fileName: `${style.displayName}-参考图版.png`,
      },
      {
        style,
        variant: 'prompt_only',
        fileName: `${style.displayName}-纯提示词版.png`,
      },
    ];
  });
}

async function writeManifest(tasks: Array<BatchTask & { taskId: string; imageUrl: string }>) {
  const manifestPath = path.join(DESKTOP_OUTPUT_DIR, 'manifest.json');
  const manifest = tasks.map((item) => ({
    styleId: item.style.id,
    styleName: item.style.displayName,
    variant: item.variant,
    fileName: item.fileName,
    taskId: item.taskId,
    imageUrl: item.imageUrl,
    referenceImageUrl: item.referenceImageUrl || null,
    resolution: '2K',
    aspectRatio: '16:9',
    prompt: CONTENT,
  }));

  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
}

async function main() {
  await fs.mkdir(DESKTOP_OUTPUT_DIR, { recursive: true });

  console.log(`Output directory: ${DESKTOP_OUTPUT_DIR}`);
  console.log('Preparing adaptive reference image...');
  const adaptiveReferenceUrl = await uploadAdaptiveReference();
  console.log(`Adaptive reference URL: ${adaptiveReferenceUrl}`);

  const apiKey = await getKieApiKey();
  const tasks = buildBatchTasks(adaptiveReferenceUrl);

  console.log(`Submitting ${tasks.length} KIE tasks...`);
  const createdTasks: Array<BatchTask & { taskId: string }> = [];

  for (const task of tasks) {
    const label = `${task.style.displayName}-${task.variant}`;
    console.log(`\n=== Creating: ${label} ===`);
    const taskId = await createKieTask(apiKey, task);
    createdTasks.push({ ...task, taskId });
    console.log(`Created taskId: ${taskId}`);
    await sleep(800);
  }

  console.log('\nWaiting for all tasks to complete...');
  const settled = await Promise.all(
    createdTasks.map(async (task) => {
      const label = `${task.style.displayName}-${task.variant}`;
      const imageUrl = await waitForKieResult(apiKey, task.taskId, label);
      const outputPath = path.join(DESKTOP_OUTPUT_DIR, task.fileName);
      await downloadToFile(imageUrl, outputPath);
      console.log(`Saved: ${outputPath}`);
      return { ...task, imageUrl };
    })
  );

  await writeManifest(settled);

  console.log('\nAll done. Files saved to desktop folder:');
  for (const item of settled) {
    console.log(`- ${item.fileName}`);
  }
}

main().catch((error) => {
  console.error('batch-generate-infographic-comparison failed:', error);
  process.exit(1);
});

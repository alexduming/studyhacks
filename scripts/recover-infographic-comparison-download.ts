import 'dotenv/config';

import fs from 'fs/promises';
import path from 'path';

import { systemConfig } from '../src/config/db/schema';
import { db } from '../src/core/db';

const KIE_BASE_URL = 'https://api.kie.ai/api/v1';
const DESKTOP_OUTPUT_DIR = path.join(process.env.USERPROFILE || '', 'Desktop', 'Infographic');
const CONTENT =
  'Gateway 像小区门禁，Agent 像小区里的住户。OpenClaw 的意思是：外人不能直接去敲住户门，必须先过门禁；门禁通过了，才会被带到具体住户。';

interface RecoveryTask {
  styleId: string;
  styleName: string;
  variant: 'reference' | 'prompt_only';
  fileName: string;
  taskId: string;
  referenceImageUrl?: string;
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

const RECOVERY_TASKS: RecoveryTask[] = [
  {
    styleId: 'adaptive_smart',
    styleName: '智能适配风格',
    variant: 'reference',
    fileName: '智能适配风格-参考图版.png',
    taskId: '64275dd996c924b2e7760e8125b3c368',
    referenceImageUrl:
      'https://cdn.studyhacks.ai/infographic/style-presets/v1/adaptive_smart_reference.png',
  },
  {
    styleId: 'adaptive_smart',
    styleName: '智能适配风格',
    variant: 'prompt_only',
    fileName: '智能适配风格-纯提示词版.png',
    taskId: 'c281e711a4135d65e9ece727e9207d75',
  },
  {
    styleId: 'hand_drawn_infographic',
    styleName: '手绘卡通风',
    variant: 'reference',
    fileName: '手绘卡通风-参考图版.png',
    taskId: '9e8d728ec58e87f372c8a9c964d46e13',
    referenceImageUrl:
      'https://cdn.studyhacks.ai/infographic/style-presets/v1/hand_drawn_infographic.png',
  },
  {
    styleId: 'hand_drawn_infographic',
    styleName: '手绘卡通风',
    variant: 'prompt_only',
    fileName: '手绘卡通风-纯提示词版.png',
    taskId: 'ff975492de79acde03d9a4c7a0340307',
  },
  {
    styleId: 'isometric_thick_line_macaron',
    styleName: '等距粗线马卡龙',
    variant: 'reference',
    fileName: '等距粗线马卡龙-参考图版.png',
    taskId: '214d2d739d272b322072622c1e69466c',
    referenceImageUrl:
      'https://cdn.studyhacks.ai/infographic/style-presets/v1/isometric_thick_line_macaron.png',
  },
  {
    styleId: 'isometric_thick_line_macaron',
    styleName: '等距粗线马卡龙',
    variant: 'prompt_only',
    fileName: '等距粗线马卡龙-纯提示词版.png',
    taskId: '0b446ea82e46af4c06b57b0b2fe46a08',
  },
  {
    styleId: 'minimal_line_storytelling_compare',
    styleName: '极简线条对比风',
    variant: 'reference',
    fileName: '极简线条对比风-参考图版.png',
    taskId: '4c84c15557680565cf83da9f32657123',
    referenceImageUrl:
      'https://cdn.studyhacks.ai/infographic/style-presets/v1/minimal_line_storytelling_compare.png',
  },
  {
    styleId: 'minimal_line_storytelling_compare',
    styleName: '极简线条对比风',
    variant: 'prompt_only',
    fileName: '极简线条对比风-纯提示词版.png',
    taskId: 'e97eefeac39b2f00097495eb365e20fa',
  },
  {
    styleId: 'flat_vector_education',
    styleName: '教育扁平矢量风',
    variant: 'reference',
    fileName: '教育扁平矢量风-参考图版.png',
    taskId: '36fdabde14f47ce9a4fa582736e2a364',
    referenceImageUrl:
      'https://cdn.studyhacks.ai/infographic/style-presets/v1/flat_vector_education.png',
  },
  {
    styleId: 'flat_vector_education',
    styleName: '教育扁平矢量风',
    variant: 'prompt_only',
    fileName: '教育扁平矢量风-纯提示词版.png',
    taskId: 'a6affbd66e812100301aea21df2395dd',
  },
  {
    styleId: 'flat_design_modern',
    styleName: '扁平插画设计',
    variant: 'reference',
    fileName: '扁平插画设计-参考图版.png',
    taskId: '0c2d78bdbcb62e5976a76e26c255df54',
    referenceImageUrl:
      'https://cdn.studyhacks.ai/infographic/style-presets/v1/flat_design_modern.png',
  },
  {
    styleId: 'flat_design_modern',
    styleName: '扁平插画设计',
    variant: 'prompt_only',
    fileName: '扁平插画设计-纯提示词版.png',
    taskId: '6c2e4c6a51caab326a3acbf5f3bca2d2',
  },
];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getKieApiKey(): Promise<string> {
  const rows = await db().select().from(systemConfig);
  const configs: Record<string, string> = {};

  for (const item of rows) {
    configs[item.name] = item.value || '';
  }

  const apiKey =
    configs.kie_api_key ||
    process.env.KIE_NANO_BANANA_PRO_KEY ||
    process.env.KIE_API_KEY ||
    '';

  if (!apiKey) {
    throw new Error('KIE API key not found in environment');
  }

  return apiKey;
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

async function writeManifest(tasks: Array<RecoveryTask & { imageUrl: string }>) {
  const manifestPath = path.join(DESKTOP_OUTPUT_DIR, 'manifest.json');
  const manifest = tasks.map((item) => ({
    styleId: item.styleId,
    styleName: item.styleName,
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

  const apiKey = await getKieApiKey();
  const settled = await Promise.allSettled(
    RECOVERY_TASKS.map(async (task) => {
      const label = `${task.styleName}-${task.variant}`;
      const imageUrl = await waitForKieResult(apiKey, task.taskId, label);
      const outputPath = path.join(DESKTOP_OUTPUT_DIR, task.fileName);
      await downloadToFile(imageUrl, outputPath);
      console.log(`Saved: ${outputPath}`);
      return { ...task, imageUrl };
    })
  );

  const successItems = settled
    .filter(
      (item): item is PromiseFulfilledResult<RecoveryTask & { imageUrl: string }> =>
        item.status === 'fulfilled'
    )
    .map((item) => item.value);

  const failedItems = settled.filter(
    (item): item is PromiseRejectedResult => item.status === 'rejected'
  );

  await writeManifest(successItems);

  console.log(`Downloaded ${successItems.length}/${RECOVERY_TASKS.length} images.`);

  if (failedItems.length > 0) {
    failedItems.forEach((item, index) => {
      console.error(`Failure ${index + 1}:`, item.reason);
    });
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('recover-infographic-comparison-download failed:', error);
  process.exit(1);
});

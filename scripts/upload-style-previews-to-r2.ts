import 'dotenv/config';

import fs from 'fs/promises';
import path from 'path';

import { systemConfig } from '../src/config/db/schema';
import { db } from '../src/core/db';
import { getStorageServiceWithConfigs } from '../src/shared/services/storage';

type StylePresetId =
  | 'hand_drawn_infographic'
  | 'isometric_thick_line_macaron'
  | 'minimal_line_storytelling_compare'
  | 'flat_vector_education'
  | 'flat_design_modern';

const LOCAL_PREVIEW_FILES: Record<StylePresetId, string> = {
  hand_drawn_infographic: '1.Hand_drawn_doodle.png',
  isometric_thick_line_macaron: '2.isometric_minimal.png',
  minimal_line_storytelling_compare: '3.whiteboard_animation.png',
  flat_vector_education: '5.flac_vector.png',
  flat_design_modern: '4. flat_illustration.png',
};

const STYLE_ORDER: StylePresetId[] = [
  'hand_drawn_infographic',
  'isometric_thick_line_macaron',
  'minimal_line_storytelling_compare',
  'flat_vector_education',
  'flat_design_modern',
];

async function resolveSourceDir(): Promise<string> {
  const websitesDir = path.dirname(process.cwd());
  const entries = await fs.readdir(websitesDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (!entry.name.startsWith('studyhacks')) continue;

    const candidate = path.join(websitesDir, entry.name, "Infographic_styles");
    try {
      await fs.access(candidate);
      return candidate;
    } catch {}
  }

  throw new Error('Could not find local Infographic_styles source directory next to the workspace');
}

async function loadConfigsFromDb() {
  const rows = await db().select().from(systemConfig);
  const configs: Record<string, string> = {};

  for (const item of rows) {
    configs[item.name] = item.value || '';
  }

  const r2Bucket = configs.r2_bucket_name || process.env.R2_BUCKET_NAME || '';
  const r2Key = configs.r2_access_key || process.env.R2_ACCESS_KEY || '';
  const r2Secret = configs.r2_secret_key || process.env.R2_SECRET_KEY || '';
  const r2Endpoint = configs.r2_endpoint || process.env.R2_ENDPOINT || '';
  const r2Domain = configs.r2_domain || process.env.R2_DOMAIN || '';
  const r2AccountId = configs.r2_account_id || process.env.R2_ACCOUNT_ID || '';

  if (!r2Bucket || !r2Key || !r2Secret) {
    throw new Error(
      'R2 config missing: r2_bucket_name/r2_access_key/r2_secret_key'
    );
  }

  return {
    ...configs,
    r2_bucket_name: r2Bucket,
    r2_access_key: r2Key,
    r2_secret_key: r2Secret,
    r2_endpoint: r2Endpoint,
    r2_domain: r2Domain,
    r2_account_id: r2AccountId,
  };
}

async function main() {
  console.log('Uploading style preview images to R2...');

  const sourceDir = await resolveSourceDir();
  const configs = await loadConfigsFromDb();
  const storageService = getStorageServiceWithConfigs(configs as any);

  const output: Record<string, string> = {};

  for (const style of STYLE_ORDER) {
    const filename = LOCAL_PREVIEW_FILES[style];
    const localPath = path.join(sourceDir, filename);
    const key = `infographic/style-presets/v1/${style}.png`;

    console.log(`\n[${style}]`);
    console.log(`  local: ${localPath}`);
    console.log(`  target: ${key}`);

    const body = await fs.readFile(localPath);
    const uploadResult = await storageService.uploadFile({
      body,
      key,
      contentType: 'image/png',
      disposition: 'inline',
    });

    if (!uploadResult.success || !uploadResult.url) {
      throw new Error(
        `Upload failed for ${style}: ${uploadResult.error || 'unknown error'}`
      );
    }

    output[style] = uploadResult.url;
    console.log(`  uploaded: ${uploadResult.url}`);
  }

  console.log('\n=== R2 URLs ===');
  for (const style of STYLE_ORDER) {
    console.log(`${style}: ${output[style]}`);
  }
}

main().catch((error) => {
  console.error('upload-style-previews-to-r2 failed:', error);
  process.exit(1);
});

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { MetadataRoute } from 'next';

import { envConfigs } from '@/config';
import { defaultLocale, locales } from '@/config/locale';

type ChangeFrequency = NonNullable<
  MetadataRoute.Sitemap[number]['changeFrequency']
>;
type Priority = NonNullable<MetadataRoute.Sitemap[number]['priority']>;

type StaticRoute = {
  path: string;
  changeFrequency: ChangeFrequency;
  priority: Priority;
};

type ContentRoute = StaticRoute & {
  locale: string;
  lastModified: string;
};

const PROJECT_ROOT = process.cwd();

/**
 * 生产环境域名（硬编码，确保 sitemap 始终使用正确域名）
 * 非程序员解释：
 * - 这是网站的正式域名，Google Search Console 需要这个来验证 sitemap
 * - 即使环境变量配置错误，这里也会强制使用正确的域名，避免出现 "your-domain.com" 这样的占位符
 */
const PRODUCTION_DOMAIN = 'https://www.studyhacks.ai';

/**
 * 获取 sitemap 使用的 base URL
 * 非程序员解释：
 * - 优先使用环境变量配置的域名
 * - 如果环境变量是 localhost 或包含占位符（your-domain.com），则使用生产域名
 * - 这样可以确保生产环境的 sitemap 始终使用正确的域名
 */
function getSitemapBaseUrl(): string {
  const envUrl = envConfigs.app_url.replace(/\/$/, '');

  // 如果环境变量包含占位符或 localhost，使用生产域名
  if (
    envUrl.includes('your-domain.com') ||
    envUrl.includes('localhost') ||
    envUrl.includes('127.0.0.1')
  ) {
    return PRODUCTION_DOMAIN;
  }

  // 如果环境变量是有效的生产域名，直接使用
  if (envUrl.includes('studyhacks.ai')) {
    return envUrl;
  }

  // 其他情况（如 Vercel 预览域名），也使用生产域名以确保 sitemap 一致性
  // 注意：这可能会导致预览环境的 sitemap 指向生产域名，但这是可接受的权衡
  return PRODUCTION_DOMAIN;
}

/**
 * 非程序员解释：
 * - Search Console 只需要一个 `/sitemap.xml` 地址，我们让 Next.js 在服务端实时生成
 * - `STATIC_MARKETING_ROUTES` 维护首页、功能页等"固定"链接；文档、博客等内容页会自动扫描 MDX 文件生成
 * - 以后新增 mdx 文档或博客，无需再手动维护 sitemap，只要有对应文件就会自动更新
 */
const STATIC_MARKETING_ROUTES: StaticRoute[] = [
  { path: '/', changeFrequency: 'daily', priority: 1 },
  { path: '/ai-note-taker', changeFrequency: 'weekly', priority: 0.9 },
  { path: '/flashcards', changeFrequency: 'weekly', priority: 0.9 },
  { path: '/quiz', changeFrequency: 'weekly', priority: 0.9 },
  { path: '/slides', changeFrequency: 'weekly', priority: 0.9 },
  { path: '/infographic', changeFrequency: 'weekly', priority: 0.85 },
  { path: '/podcast', changeFrequency: 'weekly', priority: 0.85 },
  { path: '/pricing', changeFrequency: 'weekly', priority: 0.8 },
  { path: '/collaboration', changeFrequency: 'monthly', priority: 0.7 },
  { path: '/showcases', changeFrequency: 'monthly', priority: 0.7 },
  { path: '/sync', changeFrequency: 'monthly', priority: 0.65 },
  { path: '/ai-audio-generator', changeFrequency: 'monthly', priority: 0.7 },
  { path: '/ai-chatbot', changeFrequency: 'monthly', priority: 0.7 },
  { path: '/ai-image-generator', changeFrequency: 'monthly', priority: 0.7 },
  { path: '/ai-music-generator', changeFrequency: 'monthly', priority: 0.7 },
  { path: '/ai-video-generator', changeFrequency: 'monthly', priority: 0.7 },
  { path: '/blog', changeFrequency: 'daily', priority: 0.8 },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // 使用专门的函数获取 base URL，确保不会出现占位符域名
  const baseUrl = getSitemapBaseUrl();
  const generatedAt = new Date().toISOString();

  const sitemapEntries: MetadataRoute.Sitemap = [];

  // 生成营销页：保证中英文都有条目
  locales.forEach((locale) => {
    STATIC_MARKETING_ROUTES.forEach((route) => {
      sitemapEntries.push(
        createEntry({
          baseUrl,
          locale,
          path: route.path,
          changeFrequency: route.changeFrequency,
          priority: route.priority,
          lastModified: generatedAt,
        })
      );
    });
  });

  const [blogRoutes, legalPageRoutes, docsRoutes] = await Promise.all([
    collectContentRoutes({
      rootDir: path.join(PROJECT_ROOT, 'content', 'posts'),
      routePrefix: '/blog',
      changeFrequency: 'weekly',
      priority: 0.6,
    }),
    collectContentRoutes({
      rootDir: path.join(PROJECT_ROOT, 'content', 'pages'),
      routePrefix: '/',
      changeFrequency: 'yearly',
      priority: 0.4,
    }),
    collectContentRoutes({
      rootDir: path.join(PROJECT_ROOT, 'content', 'docs'),
      routePrefix: '/docs',
      changeFrequency: 'monthly',
      priority: 0.5,
    }),
  ]);

  [...blogRoutes, ...legalPageRoutes, ...docsRoutes].forEach((route) => {
    sitemapEntries.push(
      createEntry({
        baseUrl,
        ...route,
      })
    );
  });

  return deduplicateEntries(sitemapEntries);
}

function createEntry({
  baseUrl,
  locale,
  path: pathname,
  lastModified,
  changeFrequency,
  priority,
}: {
  baseUrl: string;
  locale: string;
  path: string;
  lastModified: string;
  changeFrequency: ChangeFrequency;
  priority: Priority;
}): MetadataRoute.Sitemap[number] {
  const normalizedPath =
    pathname === '/'
      ? ''
      : pathname.startsWith('/')
        ? pathname
        : `/${pathname}`;
  const localePrefix =
    locale === defaultLocale ? '' : `/${locale.replace(/^\//, '')}`;

  return {
    url: `${baseUrl}${localePrefix}${normalizedPath}`,
    lastModified,
    changeFrequency,
    priority,
  };
}

async function collectContentRoutes({
  rootDir,
  routePrefix,
  changeFrequency,
  priority,
}: {
  rootDir: string;
  routePrefix: string;
  changeFrequency: ChangeFrequency;
  priority: Priority;
}): Promise<ContentRoute[]> {
  // 非程序员解释：这段只是“扫描 mdx 文件夹，顺势带上更新时间”，不会影响业务逻辑
  if (!(await directoryExists(rootDir))) {
    return [];
  }

  const files = await readMdxFiles(rootDir);
  const routes: ContentRoute[] = [];

  for (const filePath of files) {
    const relativePath = path.relative(rootDir, filePath).replace(/\\/g, '/');

    const locale = relativePath.endsWith('.zh.mdx') ? 'zh' : defaultLocale;
    const slug = normalizeSlug(relativePath);
    const normalizedRoute = buildRoutePath(routePrefix, slug);
    const stats = await fs.stat(filePath);

    routes.push({
      locale,
      path: normalizedRoute,
      lastModified: stats.mtime.toISOString(),
      changeFrequency,
      priority,
    });
  }

  return routes;
}

async function directoryExists(dir: string): Promise<boolean> {
  try {
    await fs.access(dir);
    return true;
  } catch {
    return false;
  }
}

async function readMdxFiles(dir: string): Promise<string[]> {
  const dirents = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    dirents.map(async (dirent) => {
      const fullPath = path.join(dir, dirent.name);
      if (dirent.isDirectory()) {
        return readMdxFiles(fullPath);
      }

      return fullPath.endsWith('.mdx') ? [fullPath] : [];
    })
  );

  return files.flat();
}

function normalizeSlug(relativePath: string): string {
  const withoutLocale = relativePath
    .replace(/\.zh\.mdx$/, '')
    .replace(/\.mdx$/, '');
  const segments = withoutLocale.split('/').filter(Boolean);

  if (segments[segments.length - 1] === 'index') {
    segments.pop();
  }

  return segments.join('/');
}

function buildRoutePath(prefix: string, slug: string): string {
  if (!slug) {
    return prefix;
  }

  if (prefix === '/') {
    return `/${slug}`;
  }

  return `${prefix}/${slug}`.replace(/\/{2,}/g, '/');
}

function deduplicateEntries(
  entries: MetadataRoute.Sitemap
): MetadataRoute.Sitemap {
  const seen = new Set<string>();

  return entries.filter((entry) => {
    if (seen.has(entry.url)) {
      return false;
    }
    seen.add(entry.url);
    return true;
  });
}

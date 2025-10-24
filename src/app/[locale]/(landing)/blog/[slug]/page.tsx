import { getTranslations, setRequestLocale } from 'next-intl/server';

import { postsSource } from '@/core/docs/source';
import { getThemePage } from '@/core/theme';
import { envConfigs } from '@/config';
import { Empty } from '@/shared/blocks/common';
import { getPost } from '@/shared/services/post';

// Use ISR (Incremental Static Regeneration) to support both:
// 1. Static MDX files (pre-rendered at build time)
// 2. Dynamic database posts (rendered on-demand and cached)
export const revalidate = 60; // Revalidate every 1 minute
export const dynamicParams = true; // Allow dynamic routes not in generateStaticParams

export async function generateStaticParams() {
  // Pre-render MDX files at build time
  return postsSource.generateParams();
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  const t = await getTranslations('blog.metadata');

  const canonicalUrl =
    locale !== envConfigs.locale
      ? `${envConfigs.app_url}/${locale}/blog/${slug}`
      : `${envConfigs.app_url}/blog/${slug}`;

  const post = await getPost({ slug, locale });
  if (!post) {
    return {
      title: `${slug} | ${t('title')}`,
      description: t('description'),
      alternates: {
        canonical: canonicalUrl,
      },
    };
  }

  return {
    title: `${post.title} | ${t('title')}`,
    description: post.description,
    alternates: {
      canonical: canonicalUrl,
    },
  };
}

export default async function BlogDetailPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  // load blog data
  const t = await getTranslations('blog');

  const post = await getPost({ slug, locale });

  if (!post) {
    return <Empty message={`Post not found`} />;
  }

  const Page = await getThemePage('blog-detail');

  return <Page locale={locale} post={post} />;
}

import bundleAnalyzer from '@next/bundle-analyzer';
import { createMDX } from 'fumadocs-mdx/next';
import createNextIntlPlugin from 'next-intl/plugin';

const withMDX = createMDX();

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});

const withNextIntl = createNextIntlPlugin({
  requestConfig: './src/core/i18n/request.ts',
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: process.env.VERCEL ? undefined : 'standalone',
  reactStrictMode: false,
  pageExtensions: ['ts', 'tsx', 'js', 'jsx', 'md', 'mdx'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*',
      },
      {
        protocol: 'http',
        hostname: '*',
      },
    ],
  },
  async redirects() {
    // 说明（给非程序员看的注释）：
    // - 这里配置的是“旧地址自动跳到新地址”的规则（301 重定向）
    // - 现在把原来的 /aippt 自动跳转到新的 /slides，避免老用户的收藏链接失效
    return [
      {
        // 处理带语言前缀的路径，例如 /en/aippt 或 /zh/aippt
        source: '/:locale/aippt',
        destination: '/:locale/slides',
        permanent: true,
      },
      {
        // 兜底：如果没有语言前缀，访问 /aippt 也跳转到 /slides
        source: '/aippt',
        destination: '/slides',
        permanent: true,
      },
    ];
  },
  turbopack: {
    resolveAlias: {
      // fs: {
      //   browser: './empty.ts', // We recommend to fix code imports before using this method
      // },
    },
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
    // 禁用 Turbopack 文件系统缓存（解决 Windows 上的并发写入错误）
    // 这会导致首次编译稍慢，但可以避免 "Persisting failed" 错误
    // 如果不需要缓存，可以设置为 false；如果需要缓存但想减少错误，可以保持 true 但接受偶尔的错误
    turbopackFileSystemCacheForDev: false, // 改为 false 可以完全避免缓存写入错误
    // Disable mdxRs for Vercel deployment compatibility with fumadocs-mdx
    ...(process.env.VERCEL ? {} : { mdxRs: true }),
  },
  reactCompiler: true,
};

export default withBundleAnalyzer(withNextIntl(withMDX(nextConfig)));

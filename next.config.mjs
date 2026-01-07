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
  // 配置 CORS 头，告知浏览器只允许特定域名访问
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          {
            key: 'Access-Control-Allow-Origin',
            // 注意：标准的 Access-Control-Allow-Origin 只能是一个域名或 *。
            // 如果你需要支持多个域名，通常需要使用 Middleware 动态设置。
            // 这里我们为了简单兼容，如果未设置 ALLOWED_ORIGINS，默认允许所有（*），
            // 但我们在 API 路由代码中已经做了 checkApiOrigin 的严格逻辑检查，所以这里宽容一点没关系。
            // 建议：在 Vercel 环境变量中设置 ALLOWED_ORIGINS 为你的主域名。
            value: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',')[0] : '*',
          },
          {
            key: 'Access-Control-Allow-Methods',
            value: 'GET, POST, PUT, DELETE, OPTIONS',
          },
          {
            key: 'Access-Control-Allow-Headers',
            value: 'Content-Type, Authorization',
          },
        ],
      },
    ];
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

import '@/config/style/global.css';

// import { JetBrains_Mono, Merriweather, Outfit } from 'next/font/google';
import { getLocale, setRequestLocale } from 'next-intl/server';
import NextTopLoader from 'nextjs-toploader';

import { envConfigs } from '@/config';
import { locales } from '@/config/locale';
import { getAllConfigs } from '@/shared/models/config';
import { getAdsManagerWithConfigs } from '@/shared/services/ads';
import { getAffiliateManagerWithConfigs } from '@/shared/services/affiliate';
import { getAnalyticsManagerWithConfigs } from '@/shared/services/analytics';
import { getCustomerServiceWithConfigs } from '@/shared/services/customer_service';

// Outfit 字体 - 统一主题字体
// 暂时禁用 Google Fonts 以解决中国地区构建和访问问题。
// 使用系统默认字体栈 (System UI) 替代，速度最快且无外部依赖。
const outfit = {
  variable: '--font-sans',
  style: { fontFamily: 'system-ui, sans-serif' },
};

const merriweather = {
  variable: '--font-serif',
  style: { fontFamily: 'Georgia, serif' },
};

const jetbrainsMono = {
  variable: '--font-mono',
  style: { fontFamily: 'Consolas, monospace' },
};

/*
const outfit = Outfit({
  subsets: ['latin'],
  weight: ['100', '200', '300', '400', '500', '600', '700', '800', '900'],
  variable: '--font-sans',
});

const merriweather = Merriweather({
  subsets: ['latin'],
  weight: ['300', '400', '700', '900'],
  variable: '--font-serif',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
});
*/

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  setRequestLocale(locale);

  const isProduction = process.env.NODE_ENV === 'production';
  const isDebug = process.env.NEXT_PUBLIC_DEBUG === 'true';

  // app url
  const appUrl = envConfigs.app_url || '';

  // ads components
  let adsMetaTags = null;
  let adsHeadScripts = null;
  let adsBodyScripts = null;

  // analytics components
  let analyticsMetaTags = null;
  let analyticsHeadScripts = null;
  let analyticsBodyScripts = null;

  // affiliate components
  let affiliateMetaTags = null;
  let affiliateHeadScripts = null;
  let affiliateBodyScripts = null;

  // customer service components
  let customerServiceMetaTags = null;
  let customerServiceHeadScripts = null;
  let customerServiceBodyScripts = null;

  if (isProduction || isDebug) {
    // 🔧 优化：将原来的 4 次数据库查询合并为 1 次
    // 原因：每个 getXxxService() 都会调用 getAllConfigs()，冷启动时会触发 4 次 DB 查询
    // 现在：只查询 1 次，然后用 WithConfigs 版本的函数创建各个服务实例
    // 效果：减少 75% 的数据库查询，大幅降低冷启动超时概率
    try {
      const configs = await getAllConfigs();

      // get ads components
      const adsService = getAdsManagerWithConfigs(configs);
      adsMetaTags = adsService.getMetaTags();
      adsHeadScripts = adsService.getHeadScripts();
      adsBodyScripts = adsService.getBodyScripts();

      // get analytics components
      const analyticsService = getAnalyticsManagerWithConfigs(configs);
      analyticsMetaTags = analyticsService.getMetaTags();
      analyticsHeadScripts = analyticsService.getHeadScripts();
      analyticsBodyScripts = analyticsService.getBodyScripts();

      // get affiliate components
      const affiliateService = getAffiliateManagerWithConfigs(configs);
      affiliateMetaTags = affiliateService.getMetaTags();
      affiliateHeadScripts = affiliateService.getHeadScripts();
      affiliateBodyScripts = affiliateService.getBodyScripts();

      // get customer service components
      const customerService = getCustomerServiceWithConfigs(configs);
      customerServiceMetaTags = customerService.getMetaTags();
      customerServiceHeadScripts = customerService.getHeadScripts();
      customerServiceBodyScripts = customerService.getBodyScripts();
    } catch (error) {
      // 配置获取失败时，静默处理，页面仍可正常渲染（只是没有第三方服务脚本）
      // 这样即使数据库连接超时，用户也能看到页面内容，而不是 500 错误
      console.warn('[Layout] 配置获取失败，跳过第三方服务注入:', error);
    }
  }

  return (
    <html
      lang={locale}
      className={`${outfit.variable} ${merriweather.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <link rel="icon" href="/favicon.ico" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />

        {/* inject locales */}
        {locales ? (
          <>
            {locales.map((loc) => (
              <link
                key={loc}
                rel="alternate"
                hrefLang={loc}
                href={`${appUrl}${loc === 'en' ? '' : `/${loc}`}`}
              />
            ))}
          </>
        ) : null}

        {/* inject ads meta tags */}
        {adsMetaTags}
        {/* inject ads head scripts */}
        {adsHeadScripts}

        {/* inject analytics meta tags */}
        {analyticsMetaTags}
        {/* inject analytics head scripts */}
        {analyticsHeadScripts}

        {/* inject affiliate meta tags */}
        {affiliateMetaTags}
        {/* inject affiliate head scripts */}
        {affiliateHeadScripts}

        {/* inject customer service meta tags */}
        {customerServiceMetaTags}
        {/* inject customer service head scripts */}
        {customerServiceHeadScripts}
      </head>
      <body suppressHydrationWarning className="overflow-x-hidden">
        <NextTopLoader
          color="#6466F1"
          initialPosition={0.08}
          crawlSpeed={200}
          height={3}
          crawl={true}
          showSpinner={true}
          easing="ease"
          speed={200}
        />

        {children}

        {/* inject ads body scripts */}
        {adsBodyScripts}

        {/* inject analytics body scripts */}
        {analyticsBodyScripts}

        {/* inject affiliate body scripts */}
        {affiliateBodyScripts}

        {/* inject customer service body scripts */}
        {customerServiceBodyScripts}
      </body>
    </html>
  );
}

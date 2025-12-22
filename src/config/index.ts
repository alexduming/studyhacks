// Load .env files for scripts (tsx/ts-node) - but NOT in Edge Runtime or browser
// This ensures scripts can read DATABASE_URL and other env vars
// Check for real Node.js environment by looking at global 'process' properties
if (
  typeof process !== 'undefined' &&
  typeof process.cwd === 'function' &&
  !process.env.NEXT_RUNTIME // Skip if in Next.js runtime (already loaded)
) {
  try {
    const dotenv = require('dotenv');
    dotenv.config({ path: '.env.development' });
    dotenv.config({ path: '.env', override: false });
  } catch (e) {
    // Silently fail - dotenv might not be available in some environments
  }
}

export type ConfigMap = Record<string, string>;

/**
 * 环境变量配置
 * 作用：从 .env 文件或 Vercel 环境变量中读取配置
 * 优先级：数据库配置 > 环境变量配置
 *
 * 非程序员解释：
 * - 这个对象包含了所有系统需要的配置项
 * - 在 Vercel 部署时，如果数据库连接失败，会使用这里的环境变量配置作为备用方案
 * - 支付配置（Stripe）现在可以通过环境变量配置，提高部署可靠性
 */
/**
 * 获取应用 URL
 * 作用：确保生产环境不会使用 localhost
 *
 * 非程序员解释：
 * - 在生产环境（Vercel）上，如果配置了 VERCEL_URL，会自动使用
 * - 开发环境使用 localhost
 * - 防止支付回调跳转到 localhost 的问题
 */
function getAppUrl(): string {
  // 优先使用明确设置的 APP_URL
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL;
  }

  // Vercel 部署时，使用 VERCEL_URL（自动提供）
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  // 开发环境默认值
  return 'http://localhost:3000';
}

export const envConfigs = {
  app_url: getAppUrl(),
  app_name: process.env.NEXT_PUBLIC_APP_NAME ?? 'ShipAny App',
  theme: process.env.NEXT_PUBLIC_THEME ?? 'default',
  // 非程序员解释：
  // - appearance 控制网站的整体外观（亮色/暗色/跟随系统）
  // - 默认值从 'system'（跟随系统）改为 'dark'（默认暗色模式）
  // - 如果用户想改回跟随系统，可以在 .env.development 中设置 NEXT_PUBLIC_APPEARANCE=system
  appearance: process.env.NEXT_PUBLIC_APPEARANCE ?? 'dark',
  locale: process.env.NEXT_PUBLIC_DEFAULT_LOCALE ?? 'en',
  default_locale: process.env.NEXT_PUBLIC_DEFAULT_LOCALE ?? 'en', // 添加 default_locale 配置（用于支付回调 URL）
  database_url: process.env.DATABASE_URL ?? '',
  database_provider: process.env.DATABASE_PROVIDER ?? 'postgresql',
  db_singleton_enabled: process.env.DB_SINGLETON_ENABLED || 'false',
  auth_url: process.env.AUTH_URL || getAppUrl(), // 使用与 app_url 相同的逻辑
  auth_secret: process.env.AUTH_SECRET ?? '', // openssl rand -base64 32

  // ====== 社交登录配置 (Social Auth) ======
  // 允许通过环境变量配置社交登录，方便本地开发和部署
  google_auth_enabled: process.env.GOOGLE_AUTH_ENABLED ?? 'false',
  google_client_id: process.env.GOOGLE_CLIENT_ID ?? '',
  google_client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '',
  google_one_tap_enabled: process.env.GOOGLE_ONE_TAP_ENABLED ?? 'false',

  github_auth_enabled: process.env.GITHUB_AUTH_ENABLED ?? 'false',
  github_client_id: process.env.GITHUB_CLIENT_ID ?? '',
  github_client_secret: process.env.GITHUB_CLIENT_SECRET ?? '',

  // ====== 支付配置（Payment Configuration） ======
  // 非程序员解释：
  // - 这些配置控制支付功能（Stripe/PayPal/Creem）
  // - 即使数据库连接失败，也能从环境变量读取支付配置
  // - 在 Vercel 部署时特别有用，确保支付功能不会因为数据库问题而失败

  // 默认支付提供商（stripe/paypal/creem）
  default_payment_provider: process.env.DEFAULT_PAYMENT_PROVIDER ?? '',

  // Stripe 配置
  stripe_enabled: process.env.STRIPE_ENABLED ?? 'false', // 必须设置为 'true' 才能启用
  stripe_publishable_key: process.env.STRIPE_PUBLISHABLE_KEY ?? '', // Stripe 公钥（以 pk_ 开头）
  stripe_secret_key: process.env.STRIPE_SECRET_KEY ?? '', // Stripe 密钥（以 sk_ 开头）
  stripe_signing_secret: process.env.STRIPE_SIGNING_SECRET ?? '', // Stripe Webhook 签名密钥（以 whsec_ 开头）
  stripe_payment_methods: process.env.STRIPE_PAYMENT_METHODS ?? '["card"]', // 支持的支付方式（JSON 数组字符串）

  // PayPal 配置
  paypal_enabled: process.env.PAYPAL_ENABLED ?? 'false',
  paypal_client_id: process.env.PAYPAL_CLIENT_ID ?? '',
  paypal_client_secret: process.env.PAYPAL_CLIENT_SECRET ?? '',
  paypal_environment: process.env.PAYPAL_ENVIRONMENT ?? 'sandbox', // sandbox 或 production

  // Creem 配置
  creem_enabled: process.env.CREEM_ENABLED ?? 'false',
  creem_api_key: process.env.CREEM_API_KEY ?? '',
  creem_environment: process.env.CREEM_ENVIRONMENT ?? 'sandbox', // sandbox 或 production
  creem_signing_secret: process.env.CREEM_SIGNING_SECRET ?? '',
  creem_product_ids: process.env.CREEM_PRODUCT_IDS ?? '', // JSON 字符串，映射产品 ID

  // ====== R2 存储配置（支持直接用环境变量配置）======
  // 非程序员解释：
  // - 如果你不想每次在 /admin 里点来点去，可以直接在 .env 或部署平台的环境变量里写好
  // - key 名称与数据库中的配置名保持一致：r2_access_key / r2_secret_key / r2_bucket_name 等
  r2_access_key: process.env.R2_ACCESS_KEY ?? '',
  r2_secret_key: process.env.R2_SECRET_KEY ?? '',
  r2_bucket_name: process.env.R2_BUCKET_NAME ?? '',
  r2_account_id: process.env.R2_ACCOUNT_ID ?? '',
  // 可选：自定义 R2 Endpoint，比如 https://<account-id>.r2.cloudflarestorage.com
  r2_endpoint: process.env.R2_ENDPOINT ?? '',
  // 可选：对外访问域名，比如 https://cdn.example.com/your-bucket
  r2_domain: process.env.R2_DOMAIN ?? '',
};

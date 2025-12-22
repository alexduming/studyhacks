import { db } from '@/core/db';
import { envConfigs } from '@/config';
import { config } from '@/config/db/schema';

import { publicSettingNames } from '../services/settings';

export type Config = typeof config.$inferSelect;
export type NewConfig = typeof config.$inferInsert;
export type UpdateConfig = Partial<Omit<NewConfig, 'name'>>;

export type Configs = Record<string, string>;

export async function saveConfigs(configs: Record<string, string>) {
  const result = await db().transaction(async (tx) => {
    const configEntries = Object.entries(configs);
    const results = [];

    for (const [name, configValue] of configEntries) {
      const [upsertResult] = await tx
        .insert(config)
        .values({ name, value: configValue })
        .onConflictDoUpdate({
          target: config.name,
          set: { value: configValue },
        })
        .returning();

      results.push(upsertResult);
    }

    return results;
  });

  return result;
}

export async function addConfig(newConfig: NewConfig) {
  const [result] = await db().insert(config).values(newConfig).returning();

  return result;
}

/**
 * 从数据库获取配置信息
 * 添加了重试机制和错误处理，提高连接稳定性
 * @returns 配置对象
 */
export async function getConfigs(): Promise<Configs> {
  const configs: Record<string, string> = {};

  // 如果没有配置数据库 URL，直接返回空配置
  if (!envConfigs.database_url) {
    return configs;
  }

  // 优化重试策略：只在开发环境且是网络错误时重试1次，快速失败
  // 生产环境：不重试，直接失败并回退到环境变量配置（避免用户等待）
  const isDevelopment = process.env.NODE_ENV === 'development';
  const maxRetries = isDevelopment ? 1 : 0; // 开发环境最多重试1次，生产环境不重试
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      // 执行数据库查询
      const result = await db().select().from(config);

      // 如果查询结果为空，返回空配置对象
      if (!result || result.length === 0) {
        return configs;
      }

      // 将查询结果转换为配置对象
      for (const configItem of result) {
        configs[configItem.name] = configItem.value ?? '';
      }

      // 成功获取配置，返回结果
      return configs;
    } catch (error) {
      lastError = error as Error;

      // 记录错误信息（包含重试次数）
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorCode = (error as any)?.code || '';

      // 判断是否为网络相关错误（超时、连接失败等）
      const isNetworkError =
        errorMessage.includes('CONNECT_TIMEOUT') ||
        errorMessage.includes('timeout') ||
        errorMessage.includes('ETIMEDOUT') ||
        errorMessage.includes('ECONNREFUSED') ||
        errorMessage.includes('ENOTFOUND') ||
        errorCode === 'CONNECT_TIMEOUT';

      // 只在开发环境且是网络错误时重试（最多1次）
      if (isNetworkError && attempt <= maxRetries) {
        // 快速重试：等待500ms后重试（不等待太久）
        console.warn(
          `[配置] 数据库网络错误，快速重试 (${attempt}/${maxRetries + 1})...`
        );
        await new Promise((resolve) => setTimeout(resolve, 500));
        continue; // 继续下一次重试
      }

      // 如果不是网络错误，或者已经达到最大重试次数，直接抛出错误
      // 让调用者（getAllConfigs）处理错误并回退到环境变量配置
      throw error;
    }
  }

  // 如果所有重试都失败了，抛出最后一个错误
  throw lastError || new Error('获取配置失败：未知错误');
}

/**
 * 获取所有配置（环境变量 + 数据库配置）
 * 数据库配置失败时，会回退到仅使用环境变量配置
 * @returns 合并后的配置对象
 */
export async function getAllConfigs(): Promise<Configs> {
  let dbConfigs: Configs = {};

  // 只在服务器端从数据库获取配置
  if (envConfigs.database_url) {
    try {
      dbConfigs = await getConfigs();
    } catch (e) {
      // 改进错误日志：提供更详细的错误信息
      const error = e as Error;
      const errorMessage = error.message || String(e);
      const errorCode = (error as any)?.code || 'UNKNOWN';

      // 减少日志噪音：只在开发环境显示详细错误，生产环境静默处理
      // 使用错误抑制机制，避免重复打印相同的错误
      const isDevelopment = process.env.NODE_ENV === 'development';

      if (isDevelopment) {
        // 开发环境：显示详细错误信息
        if (
          errorMessage.includes('CONNECT_TIMEOUT') ||
          errorCode === 'CONNECT_TIMEOUT'
        ) {
          // 连接超时错误：减少日志频率（每10次只打印一次）
          const shouldLog = Math.random() < 0.1; // 10% 的概率打印
          if (shouldLog) {
            console.warn(
              `[配置] 数据库连接超时，使用环境变量配置作为回退方案（已抑制部分重复日志）`
            );
          }
        } else if (errorMessage.includes('DATABASE_URL is not set')) {
          // 只在第一次出现时打印
          console.warn(`[配置] 数据库 URL 未设置，跳过数据库配置获取`);
        } else {
          // 其他错误：减少日志频率
          const shouldLog = Math.random() < 0.1; // 10% 的概率打印
          if (shouldLog) {
            console.warn(
              `[配置] 从数据库获取配置失败，使用环境变量配置作为回退方案（已抑制部分重复日志）`
            );
          }
        }
      }
      // 生产环境：完全静默处理，不打印任何日志

      // 发生错误时，使用空对象作为数据库配置，后续会回退到环境变量配置
      dbConfigs = {};
    }
  }

  // 合并配置：数据库配置会覆盖环境变量配置（如果存在）
  // 但对于关键配置（app_url、auth_url），如果环境变量已明确设置，则优先使用环境变量
  // 这样可以防止数据库中的 localhost 配置泄露到生产环境
  const configs = {
    ...envConfigs,
    ...dbConfigs,
  };

  // 关键配置列表：如果环境变量已明确设置，则强制使用环境变量（不被数据库覆盖）
  // 原因：防止本地开发时在数据库中配置的 localhost 地址影响生产环境
  
  // app_url: 应用访问 URL（防止 localhost 泄露到生产环境）
  if (process.env.NEXT_PUBLIC_APP_URL) {
    const envValue = process.env.NEXT_PUBLIC_APP_URL;
    if (dbConfigs.app_url && dbConfigs.app_url !== envValue) {
      console.warn(
        `[配置警告] app_url 环境变量 (${envValue}) 覆盖了数据库配置 (${dbConfigs.app_url})`
      );
    }
    configs.app_url = envValue;
  }

  // auth_url: 认证 URL（防止 localhost 泄露到生产环境）
  if (process.env.AUTH_URL) {
    const envValue = process.env.AUTH_URL;
    if (dbConfigs.auth_url && dbConfigs.auth_url !== envValue) {
      console.warn(
        `[配置警告] auth_url 环境变量 (${envValue}) 覆盖了数据库配置 (${dbConfigs.auth_url})`
      );
    }
    configs.auth_url = envValue;
  }

  // ====== 社交登录配置强制使用环境变量 ======
  // Google
  if (process.env.GOOGLE_AUTH_ENABLED) {
    configs.google_auth_enabled = process.env.GOOGLE_AUTH_ENABLED;
  }
  if (process.env.GOOGLE_CLIENT_ID) {
    configs.google_client_id = process.env.GOOGLE_CLIENT_ID;
  }
  if (process.env.GOOGLE_CLIENT_SECRET) {
    configs.google_client_secret = process.env.GOOGLE_CLIENT_SECRET;
  }
  if (process.env.GOOGLE_ONE_TAP_ENABLED) {
    configs.google_one_tap_enabled = process.env.GOOGLE_ONE_TAP_ENABLED;
  }

  // Github
  if (process.env.GITHUB_AUTH_ENABLED) {
    configs.github_auth_enabled = process.env.GITHUB_AUTH_ENABLED;
  }
  if (process.env.GITHUB_CLIENT_ID) {
    configs.github_client_id = process.env.GITHUB_CLIENT_ID;
  }
  if (process.env.GITHUB_CLIENT_SECRET) {
    configs.github_client_secret = process.env.GITHUB_CLIENT_SECRET;
  }

  // ====== 支付配置强制使用环境变量（防止测试密钥泄露到生产环境） ======
  // 原因：Stripe、PayPal、Creem 的生产密钥通常在 Vercel 等平台设置为环境变量
  //      如果数据库中还保存着测试密钥，会导致生产环境使用测试密钥的问题
  
  // Stripe 配置：如果环境变量已设置，强制使用环境变量
  if (process.env.STRIPE_ENABLED) {
    configs.stripe_enabled = process.env.STRIPE_ENABLED;
  }
  if (process.env.STRIPE_PUBLISHABLE_KEY) {
    const envValue = process.env.STRIPE_PUBLISHABLE_KEY;
    if (dbConfigs.stripe_publishable_key && dbConfigs.stripe_publishable_key !== envValue) {
      // 隐藏密钥内容，只显示前缀
      const dbKeyPrefix = dbConfigs.stripe_publishable_key.substring(0, 10);
      const envKeyPrefix = envValue.substring(0, 10);
      console.warn(
        `[配置警告] stripe_publishable_key 环境变量 (${envKeyPrefix}...) 覆盖了数据库配置 (${dbKeyPrefix}...)`
      );
    }
    configs.stripe_publishable_key = envValue;
  }
  if (process.env.STRIPE_SECRET_KEY) {
    const envValue = process.env.STRIPE_SECRET_KEY;
    if (dbConfigs.stripe_secret_key && dbConfigs.stripe_secret_key !== envValue) {
      // 隐藏密钥内容，只显示前缀
      const dbKeyPrefix = dbConfigs.stripe_secret_key.substring(0, 10);
      const envKeyPrefix = envValue.substring(0, 10);
      console.warn(
        `[配置警告] stripe_secret_key 环境变量 (${envKeyPrefix}...) 覆盖了数据库配置 (${dbKeyPrefix}...)`
      );
    }
    configs.stripe_secret_key = envValue;
  }
  if (process.env.STRIPE_SIGNING_SECRET) {
    const envValue = process.env.STRIPE_SIGNING_SECRET;
    if (dbConfigs.stripe_signing_secret && dbConfigs.stripe_signing_secret !== envValue) {
      const dbKeyPrefix = dbConfigs.stripe_signing_secret.substring(0, 10);
      const envKeyPrefix = envValue.substring(0, 10);
      console.warn(
        `[配置警告] stripe_signing_secret 环境变量 (${envKeyPrefix}...) 覆盖了数据库配置 (${dbKeyPrefix}...)`
      );
    }
    configs.stripe_signing_secret = envValue;
  }
  if (process.env.STRIPE_PAYMENT_METHODS) {
    configs.stripe_payment_methods = process.env.STRIPE_PAYMENT_METHODS;
  }

  // PayPal 配置：如果环境变量已设置，强制使用环境变量
  if (process.env.PAYPAL_ENABLED) {
    configs.paypal_enabled = process.env.PAYPAL_ENABLED;
  }
  if (process.env.PAYPAL_CLIENT_ID) {
    configs.paypal_client_id = process.env.PAYPAL_CLIENT_ID;
  }
  if (process.env.PAYPAL_CLIENT_SECRET) {
    configs.paypal_client_secret = process.env.PAYPAL_CLIENT_SECRET;
  }
  if (process.env.PAYPAL_ENVIRONMENT) {
    configs.paypal_environment = process.env.PAYPAL_ENVIRONMENT;
  }

  // Creem 配置：如果环境变量已设置，强制使用环境变量
  if (process.env.CREEM_ENABLED) {
    configs.creem_enabled = process.env.CREEM_ENABLED;
  }
  if (process.env.CREEM_API_KEY) {
    configs.creem_api_key = process.env.CREEM_API_KEY;
  }
  if (process.env.CREEM_ENVIRONMENT) {
    configs.creem_environment = process.env.CREEM_ENVIRONMENT;
  }
  if (process.env.CREEM_SIGNING_SECRET) {
    configs.creem_signing_secret = process.env.CREEM_SIGNING_SECRET;
  }

  return configs;
}

/**
 * 获取公开配置（仅包含允许公开的配置项）
 * 只在服务器端执行，避免在客户端暴露敏感信息
 * @returns 公开配置对象
 */
export async function getPublicConfigs(): Promise<Configs> {
  let dbConfigs: Configs = {};

  // 只在服务器端从数据库获取配置（避免在客户端执行）
  if (typeof window === 'undefined' && envConfigs.database_url) {
    try {
      dbConfigs = await getConfigs();
    } catch (e) {
      // 使用与 getAllConfigs 相同的错误处理逻辑
      const error = e as Error;
      const errorMessage = error.message || String(e);
      const errorCode = (error as any)?.code || 'UNKNOWN';

      // 减少日志噪音：只在开发环境显示，生产环境静默处理
      const isDevelopment = process.env.NODE_ENV === 'development';

      if (isDevelopment) {
        // 开发环境：减少日志频率
        const shouldLog = Math.random() < 0.1; // 10% 的概率打印
        if (shouldLog) {
          if (
            errorMessage.includes('CONNECT_TIMEOUT') ||
            errorCode === 'CONNECT_TIMEOUT'
          ) {
            console.warn(
              `[公开配置] 数据库连接超时，无法获取公开配置（已抑制部分重复日志）`
            );
          } else {
            console.warn(
              `[公开配置] 从数据库获取配置失败（已抑制部分重复日志）`
            );
          }
        }
      }
      // 生产环境：完全静默处理

      dbConfigs = {};
    }
  }

  const publicConfigs: Record<string, string> = {};

  // 只提取允许公开的配置项
  for (const key in dbConfigs) {
    if (publicSettingNames.includes(key)) {
      publicConfigs[key] = dbConfigs[key];
    }
  }

  const configs = {
    ...publicConfigs,
  };

  return configs;
}

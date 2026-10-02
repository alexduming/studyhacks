import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { oneTap } from 'better-auth/plugins';

import { db } from '@/core/db';
import { envConfigs } from '@/config';
import * as schema from '@/config/db/schema';
import { getSnowId, getUuid } from '@/shared/lib/hash';
import { getAllConfigs } from '@/shared/models/config';
import {
  createCredit,
  CreditStatus,
  CreditTransactionScene,
  CreditTransactionType,
} from '@/shared/models/credit';
import { EmailService } from '@/shared/services/email-service';

// Static auth options - NO database connection
// This ensures zero database calls during build time
export const authOptions = {
  appName: envConfigs.app_name,
  baseURL: envConfigs.auth_url,
  secret: envConfigs.auth_secret,
  trustedOrigins: envConfigs.app_url ? [envConfigs.app_url] : [],
  advanced: {
    database: {
      generateId: () => getUuid(),
    },
  },
  emailAndPassword: {
    enabled: true,
    // 禁用自动注册，强制使用我们的自定义 API
    autoSignIn: false,
    sendVerificationEmail: false,
  },
  logger: {
    verboseLogging: false,
    // Disable all logs during build and production
    disabled: true,
  },
};

// Dynamic auth options - WITH database connection
// Only used in API routes that actually need database access
export async function getAuthOptions() {
  // 获取配置，即使失败也返回空对象（使用环境变量作为回退）
  let configs: Record<string, string> = {};
  try {
    configs = await getAllConfigs();
  } catch (error) {
    // 静默处理：配置获取失败时使用环境变量作为回退
    // 只在开发环境显示警告
    if (process.env.NODE_ENV === 'development') {
      console.warn('[Auth] 配置获取失败，使用环境变量配置');
    }
  }

  // 尝试连接数据库，如果失败则返回 null（无数据库模式）
  let databaseAdapter = null;
  if (envConfigs.database_url) {
    try {
      databaseAdapter = drizzleAdapter(db(), {
        provider: getDatabaseProvider(envConfigs.database_provider),
        schema: schema,
      });
    } catch (error) {
      // 数据库连接失败时，继续使用无数据库模式
      // 只在开发环境显示警告
      if (process.env.NODE_ENV === 'development') {
        console.warn('[Auth] 数据库连接失败，使用无数据库模式');
      }
    }
  }

  // 获取社交登录提供商配置（如果失败则返回空对象）
  let socialProviders = {};
  try {
    socialProviders = await getSocialProviders(configs);
  } catch (error) {
    // 社交登录配置获取失败时，继续使用空配置（不影响基础认证功能）
    // 只在开发环境显示警告
    if (process.env.NODE_ENV === 'development') {
      console.warn('[Auth] 社交登录配置获取失败，跳过社交登录:', error);
    }
  }

  // 获取插件配置（如果失败则返回空数组）
  let plugins: any[] = [];
  try {
    if (configs.google_client_id && configs.google_one_tap_enabled === 'true') {
      plugins = [oneTap()];
    }
  } catch (error) {
    // 插件配置失败时，继续使用空数组（不影响基础认证功能）
    // 只在开发环境显示警告
    if (process.env.NODE_ENV === 'development') {
      console.warn('[Auth] 插件配置失败，跳过插件:', error);
    }
  }

  return {
    ...authOptions,
    // Add database connection only when actually needed (runtime)
    database: databaseAdapter,
    emailAndPassword: {
      enabled: configs.email_auth_enabled !== 'false',
      // 禁用自动注册，强制使用我们的自定义 API
      autoSignIn: false,
      sendVerificationEmail: false,
    },
    socialProviders,
    plugins,
    databaseHooks: {
      user: {
        create: {
          after: async (user: any) => {
            try {
              console.log(`🆕 Social Login User Created: ${user.email}`);

              const now = new Date();
              // Calculate end of month
              const lastDayOfMonth = new Date(
                now.getFullYear(),
                now.getMonth() + 1,
                0,
                23,
                59,
                59,
                999
              );

              // Grant 10 credits
              await createCredit({
                id: getUuid(),
                userId: user.id,
                userEmail: user.email,
                transactionNo: getSnowId(),
                transactionType: CreditTransactionType.GRANT,
                transactionScene: CreditTransactionScene.GIFT,
                credits: 10,
                remainingCredits: 10,
                description:
                  'Monthly free credits for new user registration (Social Login)',
                expiresAt: lastDayOfMonth,
                status: CreditStatus.ACTIVE,
              });

              console.log(
                `🎁 Credits granted for social login user: ${user.email}`
              );

              // Send welcome email
              await EmailService.sendWelcomeEmail(user.email, user.name);
            } catch (error) {
              console.error('❌ Error in user.create.after hook:', error);
            }
          },
        },
      },
    },
  };
}

export async function getSocialProviders(configs: Record<string, string>) {
  // get configs from db
  const providers: any = {};

  if (configs.google_client_id && configs.google_client_secret) {
    providers.google = {
      clientId: configs.google_client_id,
      clientSecret: configs.google_client_secret,
    };
  }

  if (configs.github_client_id && configs.github_client_secret) {
    providers.github = {
      clientId: configs.github_client_id,
      clientSecret: configs.github_client_secret,
    };
  }

  return providers;
}

export function getDatabaseProvider(
  provider: string
): 'sqlite' | 'pg' | 'mysql' {
  switch (provider) {
    case 'sqlite':
      return 'sqlite';
    case 'postgresql':
      return 'pg';
    case 'mysql':
      return 'mysql';
    default:
      throw new Error(
        `Unsupported database provider for auth: ${envConfigs.database_provider}`
      );
  }
}

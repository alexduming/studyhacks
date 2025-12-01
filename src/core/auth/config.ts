import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { oneTap } from 'better-auth/plugins';

import { db } from '@/core/db';
import { envConfigs } from '@/config';
import * as schema from '@/config/db/schema';
import { getUuid } from '@/shared/lib/hash';
import { getAllConfigs } from '@/shared/models/config';

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

  return {
    ...authOptions,
    // Add database connection only when actually needed (runtime)
    database: databaseAdapter,
    emailAndPassword: {
      enabled: configs.email_auth_enabled !== 'false',
    },
    socialProviders: await getSocialProviders(configs),
    plugins:
      configs.google_client_id && configs.google_one_tap_enabled === 'true'
        ? [oneTap()]
        : [],
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

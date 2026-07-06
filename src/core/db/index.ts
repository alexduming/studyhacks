import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { envConfigs } from '@/config';
import { isCloudflareWorker } from '@/shared/lib/env';

// Global database connection instance (singleton pattern)
let dbInstance: ReturnType<typeof drizzle> | null = null;
let client: ReturnType<typeof postgres> | null = null;

export function db() {
  let databaseUrl = envConfigs.database_url;

  let isHyperdrive = false;

  if (isCloudflareWorker) {
    const { env }: { env: any } = { env: {} };
    // Detect if set Hyperdrive
    isHyperdrive = 'HYPERDRIVE' in env;

    if (isHyperdrive) {
      const hyperdrive = env.HYPERDRIVE;
      databaseUrl = hyperdrive.connectionString;
      console.log('using Hyperdrive connection');
    }
  }

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set');
  }

  // In Cloudflare Workers, create new connection each time
  if (isCloudflareWorker) {
    console.log('in Cloudflare Workers environment');
    // Workers environment uses minimal configuration
    const client = postgres(databaseUrl, {
      prepare: false,
      max: 1, // Limit to 1 connection in Workers
      idle_timeout: 10, // Shorter timeout for Workers
      connect_timeout: 5,
    });

    return drizzle(client);
  }

  // Singleton mode: reuse existing connection (good for traditional servers)
  if (envConfigs.db_singleton_enabled === 'true') {
    // Return existing instance if already initialized
    if (dbInstance) {
      return dbInstance;
    }

    // Create connection pool only once
    // 优化连接池配置：快速失败策略，避免首页被数据库连接拖慢
    // 开发环境：5秒超时，快速失败并回退到环境变量配置
    // 生产环境：如果网络稳定，可以适当增加超时时间
    const isDevelopment = process.env.NODE_ENV === 'development';
    client = postgres(databaseUrl, {
      prepare: false,
      max: 10, // Maximum connections in pool
      idle_timeout: 120, // 增加到 120秒，防止 AI 生成期间连接因空闲被断开
      // 开发环境：10秒超时，快速失败（避免首页卡顿）
      // 生产环境：20秒超时（给网络波动留出缓冲）
      connect_timeout: isDevelopment ? 10 : 20,
      // 🔧 移除 max_lifetime 参数（postgres.js 3.4.7 中存在 bug，会导致负数 timeout 警告）
      // max_lifetime: 60 * 30, // ❌ 此参数在某些版本中会计算出负数，导致 TimeoutNegativeWarning
      // 针对 Supabase 连接池的优化
      connection: {
        application_name: 'study-app',
        // 🔧 增加语句超时时间，处理大字段更新（如包含历史记录的 taskResult）
        statement_timeout: 300000, // 5分钟（毫秒）
      },
      // 启用连接池健康检查
      onnotice: () => {}, // 静默处理通知
      // 连接错误处理
      transform: {
        undefined: null, // 将 undefined 转换为 null
      },
    });

    dbInstance = drizzle(client);
    return dbInstance;
  }

  // Non-singleton mode: create new connection each time (good for serverless)
  // In serverless, the connection will be cleaned up when the function instance is destroyed
  // 优化 serverless 模式的连接配置：快速失败策略
  const isDevelopment = process.env.NODE_ENV === 'development';
  const serverlessClient = postgres(databaseUrl, {
    prepare: false,
    max: 1, // Use single connection in serverless
    idle_timeout: 60, // 增加到 60秒
    // 开发环境：10秒超时，快速失败
    // 生产环境：20秒超时
    connect_timeout: isDevelopment ? 10 : 20,
    // 🔧 移除 max_lifetime 参数（postgres.js 3.4.7 中存在 bug，会导致负数 timeout 警告）
    // max_lifetime: 60 * 10, // ❌ 此参数在某些版本中会计算出负数，导致 TimeoutNegativeWarning
    connection: {
      application_name: 'study-app-serverless',
    },
    transform: {
      undefined: null,
    },
  });

  return drizzle(serverlessClient);
}

// Optional: Function to close database connection (useful for testing or graceful shutdown)
// Note: Only works in singleton mode
export async function closeDb() {
  if (envConfigs.db_singleton_enabled && client) {
    await client.end();
    client = null;
    dbInstance = null;
  }
}

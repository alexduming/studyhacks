import { defineConfig } from 'drizzle-kit';

import { envConfigs } from '@/config';

/**
 * Drizzle Kit 配置文件
 *
 * 注意：drizzle-kit@0.24 只支持 'postgresql' | 'mysql' | 'sqlite' 三种 dialect。
 * 如果使用 Turso 或其他数据库，请升级 drizzle-kit 或使用对应的适配器。
 */
export default defineConfig({
  out: './src/config/db/migrations',
  schema: './src/config/db/schema.ts',
  // 使用类型断言确保兼容性，运行时会根据环境变量实际值执行
  dialect: envConfigs.database_provider as 'postgresql' | 'mysql' | 'sqlite',
  dbCredentials: {
    url: envConfigs.database_url ?? '',
  },
});

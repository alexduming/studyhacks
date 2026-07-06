/**
 * 创建 affiliate_application 表的脚本
 * 运行方式: npx tsx scripts/create-affiliate-application-table.ts
 */

import { config } from 'dotenv';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

// 加载 .env.local
config({ path: '.env.local' });

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
  }

  const client = postgres(connectionString);
  const db = drizzle(client);

  console.log('Creating affiliate_application table...');

  try {
    // 创建表
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS affiliate_application (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'pending',
        reason TEXT,
        social_media TEXT,
        admin_note TEXT,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL,
        processed_at TIMESTAMP
      )
    `);

    console.log('Table created successfully!');

    // 创建索引
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_affiliate_app_user ON affiliate_application(user_id)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_affiliate_app_status ON affiliate_application(status)
    `);

    console.log('Indexes created successfully!');
  } catch (error: any) {
    if (error.message?.includes('already exists')) {
      console.log('Table already exists, skipping...');
    } else {
      throw error;
    }
  }

  await client.end();
  console.log('Done!');
}

main().catch(console.error);

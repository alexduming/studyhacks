/**
 * 分销系统数据库迁移脚本
 *
 * 运行方式: npx tsx scripts/migrate-affiliate.ts
 */

import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as dotenv from 'dotenv';

// 加载环境变量
dotenv.config({ path: '.env.development' });

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL not found in environment');
  process.exit(1);
}

async function migrate() {
  console.log('🚀 Starting affiliate system migration...');

  const client = postgres(DATABASE_URL!);
  const db = drizzle(client);

  try {
    // 1. 检查 referrer_id 字段是否已存在
    const checkColumn = await client`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'order' AND column_name = 'referrer_id'
    `;

    if (checkColumn.length === 0) {
      console.log('📝 Adding referrer_id column to order table...');

      // 添加 referrer_id 字段
      await client`
        ALTER TABLE "order"
        ADD COLUMN IF NOT EXISTS "referrer_id" TEXT
        REFERENCES "user"("id") ON DELETE SET NULL
      `;

      console.log('✅ referrer_id column added');
    } else {
      console.log('ℹ️ referrer_id column already exists');
    }

    // 2. 检查索引是否存在
    const checkIndex = await client`
      SELECT indexname
      FROM pg_indexes
      WHERE tablename = 'order' AND indexname = 'idx_order_referrer'
    `;

    if (checkIndex.length === 0) {
      console.log('📝 Creating index on referrer_id...');

      await client`
        CREATE INDEX IF NOT EXISTS "idx_order_referrer" ON "order"("referrer_id")
      `;

      console.log('✅ Index created');
    } else {
      console.log('ℹ️ Index already exists');
    }

    // 3. 检查 commission 表是否存在
    const checkCommission = await client`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_name = 'commission'
    `;

    if (checkCommission.length === 0) {
      console.log('📝 Creating commission table...');

      await client`
        CREATE TABLE IF NOT EXISTS "commission" (
          "id" TEXT PRIMARY KEY,
          "user_id" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
          "order_id" TEXT NOT NULL REFERENCES "order"("id") ON DELETE CASCADE,
          "amount" INTEGER NOT NULL,
          "currency" TEXT NOT NULL,
          "status" TEXT NOT NULL DEFAULT 'pending',
          "type" TEXT NOT NULL DEFAULT 'one_time',
          "rate" TEXT,
          "description" TEXT,
          "created_at" TIMESTAMP DEFAULT NOW() NOT NULL,
          "updated_at" TIMESTAMP DEFAULT NOW() NOT NULL
        )
      `;

      await client`CREATE INDEX IF NOT EXISTS "idx_commission_user" ON "commission"("user_id")`;
      await client`CREATE INDEX IF NOT EXISTS "idx_commission_order" ON "commission"("order_id")`;
      await client`CREATE INDEX IF NOT EXISTS "idx_commission_status" ON "commission"("status")`;
      await client`CREATE INDEX IF NOT EXISTS "idx_commission_created_at" ON "commission"("created_at")`;

      console.log('✅ Commission table created');
    } else {
      console.log('ℹ️ Commission table already exists');
    }

    // 4. 检查 withdrawal 表是否存在
    const checkWithdrawal = await client`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_name = 'withdrawal'
    `;

    if (checkWithdrawal.length === 0) {
      console.log('📝 Creating withdrawal table...');

      await client`
        CREATE TABLE IF NOT EXISTS "withdrawal" (
          "id" TEXT PRIMARY KEY,
          "user_id" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
          "amount" INTEGER NOT NULL,
          "currency" TEXT NOT NULL,
          "status" TEXT NOT NULL DEFAULT 'pending',
          "method" TEXT NOT NULL,
          "account" TEXT NOT NULL,
          "note" TEXT,
          "created_at" TIMESTAMP DEFAULT NOW() NOT NULL,
          "updated_at" TIMESTAMP DEFAULT NOW() NOT NULL,
          "processed_at" TIMESTAMP
        )
      `;

      await client`CREATE INDEX IF NOT EXISTS "idx_withdrawal_user" ON "withdrawal"("user_id")`;
      await client`CREATE INDEX IF NOT EXISTS "idx_withdrawal_status" ON "withdrawal"("status")`;
      await client`CREATE INDEX IF NOT EXISTS "idx_withdrawal_created_at" ON "withdrawal"("created_at")`;

      console.log('✅ Withdrawal table created');
    } else {
      console.log('ℹ️ Withdrawal table already exists');
    }

    // 5. 检查 affiliate_application 表是否存在
    const checkAffiliateApp = await client`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_name = 'affiliate_application'
    `;

    if (checkAffiliateApp.length === 0) {
      console.log('📝 Creating affiliate_application table...');

      await client`
        CREATE TABLE IF NOT EXISTS "affiliate_application" (
          "id" TEXT PRIMARY KEY,
          "user_id" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
          "status" TEXT NOT NULL DEFAULT 'pending',
          "reason" TEXT,
          "social_media" TEXT,
          "admin_note" TEXT,
          "created_at" TIMESTAMP DEFAULT NOW() NOT NULL,
          "updated_at" TIMESTAMP DEFAULT NOW() NOT NULL,
          "processed_at" TIMESTAMP
        )
      `;

      await client`CREATE INDEX IF NOT EXISTS "idx_affiliate_app_user" ON "affiliate_application"("user_id")`;
      await client`CREATE INDEX IF NOT EXISTS "idx_affiliate_app_status" ON "affiliate_application"("status")`;

      console.log('✅ Affiliate application table created');
    } else {
      console.log('ℹ️ Affiliate application table already exists');
    }

    console.log('\n🎉 Migration completed successfully!');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

migrate();

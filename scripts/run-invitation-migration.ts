/**
 * 执行邀请表迁移脚本
 * 
 * 非程序员解释：
 * - 这个脚本会直接连接到数据库并执行 SQL 语句
 * - 用于创建 invitation 表和相关索引
 * - 如果表已存在，不会报错（使用 IF NOT EXISTS）
 * 
 * 使用方法：
 * npx tsx scripts/run-invitation-migration.ts
 */

import postgres from 'postgres';
import { envConfigs } from '@/config';

async function runMigration() {
  const databaseUrl = envConfigs.database_url;

  if (!databaseUrl) {
    console.error('❌ DATABASE_URL 环境变量未设置');
    process.exit(1);
  }

  console.log('🚀 开始执行邀请表迁移...');
  console.log('📡 连接到数据库...');

  // 创建数据库连接
  const sql = postgres(databaseUrl, {
    max: 1,
    idle_timeout: 20,
    connect_timeout: 10,
  });

  try {
    // 执行迁移 SQL
    const migrationSQL = `
-- 邀请表：用于存储用户邀请码和邀请关系
CREATE TABLE IF NOT EXISTS "invitation" (
  "id" text PRIMARY KEY NOT NULL,
  "inviter_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "inviter_email" text,
  "invitee_id" text REFERENCES "user"("id") ON DELETE SET NULL,
  "invitee_email" text,
  "code" text NOT NULL UNIQUE,
  "status" text NOT NULL DEFAULT 'pending',
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp NOT NULL DEFAULT now(),
  "accepted_at" timestamp,
  "expires_at" timestamp,
  "inviter_credit_id" text,
  "invitee_credit_id" text,
  "note" text
);

-- 创建索引
CREATE INDEX IF NOT EXISTS "idx_invitation_inviter_id" ON "invitation" ("inviter_id", "status");
CREATE INDEX IF NOT EXISTS "idx_invitation_code" ON "invitation" ("code", "status");
CREATE INDEX IF NOT EXISTS "idx_invitation_invitee_id" ON "invitation" ("invitee_id");
CREATE INDEX IF NOT EXISTS "idx_invitation_created_at" ON "invitation" ("created_at");
    `;

    console.log('📝 执行 SQL 迁移...');
    await sql.unsafe(migrationSQL);

    console.log('✅ 迁移执行成功！');
    console.log('📊 验证表是否创建成功...');

    // 验证表是否创建成功
    const tables = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'invitation'
    `;

    if (tables.length > 0) {
      console.log('✅ invitation 表已成功创建！');
      
      // 检查索引
      const indexes = await sql`
        SELECT indexname 
        FROM pg_indexes 
        WHERE tablename = 'invitation'
      `;
      
      console.log(`✅ 已创建 ${indexes.length} 个索引`);
      indexes.forEach((idx: any) => {
        console.log(`   - ${idx.indexname}`);
      });
    } else {
      console.error('❌ invitation 表创建失败');
      process.exit(1);
    }
  } catch (error: any) {
    console.error('❌ 迁移执行失败:', error.message);
    console.error('详细错误:', error);
    process.exit(1);
  } finally {
    // 关闭数据库连接
    await sql.end();
    console.log('🔌 数据库连接已关闭');
  }
}

// 运行迁移
runMigration()
  .then(() => {
    console.log('🎉 迁移完成！');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ 迁移过程中发生错误:', error);
    process.exit(1);
  });


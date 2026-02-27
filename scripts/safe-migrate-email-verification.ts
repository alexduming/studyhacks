/**
 * 安全迁移 email_verification 表脚本
 * 
 * 功能：
 * 1. 检查表是否已存在
 * 2. 如果不存在，创建表（使用 IF NOT EXISTS 确保安全）
 * 3. 如果存在但缺少字段，添加缺失字段
 * 
 * 使用方法：
 * npx tsx scripts/safe-migrate-email-verification.ts
 */

import { db } from '@/core/db';
import { sql } from 'drizzle-orm';
import { envConfigs } from '@/config';

async function safeMigrate() {
  console.log('🚀 开始安全迁移 email_verification 表...\n');

  const database = db();

  try {
    // 1. 检查表是否存在
    const tableExists = await database.execute(sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'email_verification'
      );
    `);

    const exists = (tableExists as any)[0]?.exists || false;

    if (!exists) {
      console.log('📝 表不存在，开始创建...\n');

      // 创建表（使用 IF NOT EXISTS 确保安全）
      const createTableSQL = `
        CREATE TABLE IF NOT EXISTS "email_verification" (
          "id" text PRIMARY KEY NOT NULL,
          "email" text NOT NULL,
          "token" text NOT NULL,
          "type" text NOT NULL,
          "attempts" integer DEFAULT 0 NOT NULL,
          "is_verified" boolean DEFAULT false NOT NULL,
          "verified_at" timestamp,
          "expires_at" timestamp NOT NULL,
          "created_at" timestamp DEFAULT now() NOT NULL,
          "last_sent_at" timestamp,
          "invite_code" text
        );
      `;

      await database.execute(sql.raw(createTableSQL));
      console.log('✅ 表创建成功\n');

      // 创建索引
      console.log('📝 创建索引...');
      await database.execute(sql`
        CREATE INDEX IF NOT EXISTS "idx_email_verification_email" 
        ON "email_verification" ("email");
      `);
      await database.execute(sql`
        CREATE INDEX IF NOT EXISTS "idx_email_verification_token" 
        ON "email_verification" ("token");
      `);
      console.log('✅ 索引创建成功\n');
    } else {
      console.log('✅ 表已存在，检查是否需要添加字段...\n');

      // 检查现有字段
      const columns = await database.execute(sql`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public' 
        AND table_name = 'email_verification';
      `);

      const columnNames = (columns as any[]).map((col: any) => col.column_name);
      const requiredColumns = [
        'id', 'email', 'token', 'type', 'attempts', 
        'is_verified', 'verified_at', 'expires_at', 
        'created_at', 'last_sent_at', 'invite_code'
      ];

      const missingColumns = requiredColumns.filter(col => !columnNames.includes(col));

      if (missingColumns.length > 0) {
        console.log(`⚠️  发现缺失字段: ${missingColumns.join(', ')}\n`);
        console.log('📝 开始添加缺失字段...\n');

        // 添加缺失字段（这里只处理常见的缺失字段）
        if (missingColumns.includes('invite_code')) {
          try {
            await database.execute(sql`
              ALTER TABLE "email_verification" 
              ADD COLUMN IF NOT EXISTS "invite_code" text;
            `);
            console.log('✅ 已添加 invite_code 字段');
          } catch (error: any) {
            console.log(`⚠️  添加 invite_code 字段失败: ${error.message}`);
          }
        }

        // 可以根据需要添加其他字段的迁移逻辑
      } else {
        console.log('✅ 表结构完整，无需修改\n');
      }

      // 确保索引存在
      console.log('📝 检查索引...');
      try {
        await database.execute(sql`
          CREATE INDEX IF NOT EXISTS "idx_email_verification_email" 
          ON "email_verification" ("email");
        `);
      } catch (error: any) {
        console.log(`⚠️  索引可能已存在: ${error.message}`);
      }

      try {
        await database.execute(sql`
          CREATE INDEX IF NOT EXISTS "idx_email_verification_token" 
          ON "email_verification" ("token");
        `);
      } catch (error: any) {
        console.log(`⚠️  索引可能已存在: ${error.message}`);
      }
      console.log('✅ 索引检查完成\n');
    }

    console.log('🎉 迁移完成！');
    console.log('\n📊 验证表结构...');

    // 最终验证
    const finalCheck = await database.execute(sql`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public' 
      AND table_name = 'email_verification'
      ORDER BY ordinal_position;
    `);

    console.log('\n✅ 最终表结构：');
    (finalCheck as any[]).forEach((col: any) => {
      console.log(`  - ${col.column_name}: ${col.data_type}`);
    });

    process.exit(0);
  } catch (error: any) {
    console.error('\n❌ 迁移失败:', error.message);
    console.error('\n💡 建议：');
    console.error('  1. 检查数据库连接是否正常');
    console.error('  2. 检查是否有足够的权限');
    console.error('  3. 查看详细错误信息');
    process.exit(1);
  }
}

safeMigrate();


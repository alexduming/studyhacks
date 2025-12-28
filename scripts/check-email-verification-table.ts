/**
 * 检查 email_verification 表是否已存在的脚本
 * 
 * 用途：在执行迁移前，先检查表是否已存在，避免重复创建
 * 
 * 使用方法：
 * npx tsx scripts/check-email-verification-table.ts
 */

import { db } from '@/core/db';
import { sql } from 'drizzle-orm';
import { envConfigs } from '@/config';

async function checkTableExists() {
  console.log('🔍 检查 email_verification 表是否存在...\n');

  const database = db();

  try {
    // 检查表是否存在
    const result = await database.execute(sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'email_verification'
      );
    `);

    const exists = (result as any)[0]?.exists || false;

    if (exists) {
      console.log('✅ email_verification 表已存在！');
      console.log('📝 建议：如果表结构已正确，无需执行迁移');
      
      // 检查表结构
      const columns = await database.execute(sql`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'public' 
        AND table_name = 'email_verification'
        ORDER BY ordinal_position;
      `);

      console.log('\n📊 当前表结构：');
      (columns as any[]).forEach((col: any) => {
        console.log(`  - ${col.column_name}: ${col.data_type} (${col.is_nullable === 'YES' ? 'nullable' : 'not null'})`);
      });

      // 检查是否有 invite_code 字段
      const hasInviteCode = (columns as any[]).some((col: any) => col.column_name === 'invite_code');
      if (!hasInviteCode) {
        console.log('\n⚠️  警告：表缺少 invite_code 字段，可能需要添加');
      } else {
        console.log('\n✅ 表结构完整，包含 invite_code 字段');
      }
    } else {
      console.log('❌ email_verification 表不存在');
      console.log('📝 建议：需要执行迁移创建该表');
    }

    process.exit(0);
  } catch (error: any) {
    console.error('❌ 检查失败:', error.message);
    process.exit(1);
  }
}

checkTableExists();


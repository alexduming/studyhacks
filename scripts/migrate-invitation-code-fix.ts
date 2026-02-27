/**
 * 邀请码修复 - 数据库迁移脚本
 * 
 * 功能：
 * 1. 移除 invitation.code 的 UNIQUE 约束
 * 2. 添加 (code, invitee_id) 的组合唯一约束
 * 
 * 这样可以让一个邀请码被多人使用（类似推广码）
 */

import { db } from '@/core/db';
import { sql } from 'drizzle-orm';

async function migrateInvitationConstraints() {
  console.log('🔧 开始迁移 invitation 表约束...\n');

  const database = db();

  try {
    // 1. 移除 code 的 UNIQUE 约束（如果存在）
    console.log('🗑️  移除 code 的 UNIQUE 约束...');
    try {
      await database.execute(sql`
        ALTER TABLE invitation 
        DROP CONSTRAINT IF EXISTS invitation_code_unique;
      `);
      console.log('✅ 成功移除 invitation_code_unique 约束\n');
    } catch (error: any) {
      console.log(`⚠️  约束可能不存在或已被移除: ${error.message}\n`);
    }

    // 2. 移除可能存在的旧唯一索引
    console.log('🗑️  移除可能存在的旧唯一索引...');
    try {
      await database.execute(sql`
        DROP INDEX IF EXISTS invitation_code_key;
      `);
      console.log('✅ 成功移除 invitation_code_key 索引\n');
    } catch (error: any) {
      console.log(`⚠️  索引可能不存在: ${error.message}\n`);
    }

    // 3. 添加 (code, invitee_id) 的组合唯一约束
    console.log('➕ 添加 (code, invitee_id) 组合唯一约束...');
    try {
      await database.execute(sql`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_invitation_code_invitee 
        ON invitation (code, invitee_id)
        WHERE invitee_id IS NOT NULL;
      `);
      console.log('✅ 成功创建 idx_invitation_code_invitee 唯一索引\n');
    } catch (error: any) {
      if (error.message?.includes('already exists')) {
        console.log('⚠️  索引已存在，跳过创建\n');
      } else {
        throw error;
      }
    }

    console.log('✅ 数据库迁移完成！');
    console.log('\n📝 迁移说明：');
    console.log('  - 移除了 invitation.code 的 UNIQUE 约束');
    console.log('  - 添加了 (code, invitee_id) 的组合唯一约束');
    console.log('  - 现在一个邀请码可以被多人使用');
    console.log('  - 但同一个用户不能重复使用同一个邀请码');

  } catch (error) {
    console.error('\n❌ 迁移失败:', error);
    throw error;
  }
}

// 运行迁移
migrateInvitationConstraints()
  .then(() => {
    console.log('\n🎉 迁移脚本执行完成');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 迁移脚本执行失败:', error);
    process.exit(1);
  });


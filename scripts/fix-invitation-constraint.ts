/**
 * 删除 invitation 表的 code 唯一约束，并修复遗漏的邀请记录
 * 运行方式: npx tsx scripts/fix-invitation-constraint.ts
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { getUuid } from '../src/shared/lib/hash';

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
  }

  const client = postgres(connectionString);
  const db = drizzle(client);

  console.log('=== 修复 invitation 表约束 ===\n');

  // 1. 删除唯一约束
  console.log('1. 删除 invitation_code_key 唯一约束...');
  try {
    await db.execute(sql`
      ALTER TABLE invitation DROP CONSTRAINT IF EXISTS invitation_code_key
    `);
    console.log('✅ 唯一约束已删除');
  } catch (error: any) {
    if (error.message?.includes('does not exist')) {
      console.log('⚠️ 约束不存在，跳过');
    } else {
      throw error;
    }
  }

  // 2. 创建遗漏的邀请记录
  console.log('\n2. 创建遗漏的邀请记录...');

  const inviteeEmail = '364016623@qq.com';
  const inviteCode = 'GWHBHXON';
  const inviterId = 'ad36a3ba-d828-4bf0-b909-7b71bc2afdbf';
  const inviterEmail = 'duming243@hotmail.com';
  const inviteeId = 'ee5ab0d5-6108-4a98-b501-8ef292a51cdc';
  const inviteeCreatedAt = '2026-02-15T08:37:16.924Z';

  // 检查是否已存在
  const existing = await db.execute(sql`
    SELECT id FROM invitation WHERE invitee_id = ${inviteeId}
  `);

  if (existing.length > 0) {
    console.log('⚠️ 邀请记录已存在，跳过创建');
  } else {
    const newId = getUuid();
    await db.execute(sql`
      INSERT INTO invitation (
        id, inviter_id, inviter_email, invitee_id, invitee_email,
        code, status, reward_amount, invitee_reward_amount,
        accepted_at, note
      ) VALUES (
        ${newId}, ${inviterId}, ${inviterEmail}, ${inviteeId}, ${inviteeEmail},
        ${inviteCode}, 'accepted', 0, 0,
        ${inviteeCreatedAt}::timestamp, '手动补录：注册时邀请记录遗漏'
      )
    `);
    console.log('✅ 邀请记录创建成功');
    console.log(`  ID: ${newId}`);
    console.log(`  邀请人: ${inviterEmail}`);
    console.log(`  被邀请人: ${inviteeEmail}`);
  }

  await client.end();
  console.log('\n=== 修复完成 ===');
}

main().catch(console.error);

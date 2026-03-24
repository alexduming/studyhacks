/**
 * 诊断分销邀请记录问题
 * 运行方式: npx tsx scripts/diagnose-affiliate-invitation.ts
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { db } from '../src/core/db';
import { invitation, user } from '../src/config/db/schema';
import { eq, desc, or } from 'drizzle-orm';

async function main() {
  console.log('=== 诊断分销邀请记录 ===\n');

  // 1. 查找邀请人（duming243@hotmail.com）
  const inviterEmail = 'duming243@hotmail.com';
  const inviteeEmail = '364016623@qq.com';

  console.log(`邀请人: ${inviterEmail}`);
  console.log(`被邀请人: ${inviteeEmail}\n`);

  // 获取邀请人信息
  const [inviter] = await db()
    .select()
    .from(user)
    .where(eq(user.email, inviterEmail))
    .limit(1);

  if (!inviter) {
    console.error('❌ 找不到邀请人');
    return;
  }
  console.log(`✅ 邀请人ID: ${inviter.id}`);

  // 获取被邀请人信息
  const [invitee] = await db()
    .select()
    .from(user)
    .where(eq(user.email, inviteeEmail))
    .limit(1);

  if (!invitee) {
    console.error('❌ 找不到被邀请人');
    return;
  }
  console.log(`✅ 被邀请人ID: ${invitee.id}`);
  console.log(`   被邀请人注册时间: ${invitee.createdAt}\n`);

  // 2. 查找邀请人的所有邀请码
  console.log('--- 邀请人的邀请码 ---');
  const inviterCodes = await db()
    .select()
    .from(invitation)
    .where(eq(invitation.inviterId, inviter.id))
    .orderBy(desc(invitation.createdAt));

  if (inviterCodes.length === 0) {
    console.log('❌ 邀请人没有任何邀请码记录');
  } else {
    console.log(`找到 ${inviterCodes.length} 条邀请记录:`);
    inviterCodes.forEach((inv, i) => {
      console.log(`  ${i + 1}. 邀请码: ${inv.code}`);
      console.log(`     状态: ${inv.status}`);
      console.log(`     被邀请人邮箱: ${inv.inviteeEmail || '(空)'}`);
      console.log(`     被邀请人ID: ${inv.inviteeId || '(空)'}`);
      console.log(`     创建时间: ${inv.createdAt}`);
      console.log(`     接受时间: ${inv.acceptedAt || '(未接受)'}`);
      console.log('');
    });
  }

  // 3. 查找被邀请人相关的邀请记录
  console.log('--- 被邀请人相关的邀请记录 ---');
  const inviteeRecords = await db()
    .select()
    .from(invitation)
    .where(
      or(
        eq(invitation.inviteeId, invitee.id),
        eq(invitation.inviteeEmail, inviteeEmail)
      )
    );

  if (inviteeRecords.length === 0) {
    console.log('❌ 没有找到被邀请人的邀请记录');
    console.log('   这说明注册时邀请码没有被正确处理');
  } else {
    console.log(`找到 ${inviteeRecords.length} 条记录:`);
    inviteeRecords.forEach((inv, i) => {
      console.log(`  ${i + 1}. 邀请码: ${inv.code}`);
      console.log(`     邀请人邮箱: ${inv.inviterEmail}`);
      console.log(`     状态: ${inv.status}`);
      console.log(`     创建时间: ${inv.createdAt}`);
      console.log('');
    });
  }

  // 4. 检查所有邀请记录
  console.log('--- 最近的所有邀请记录 ---');
  const allInvitations = await db()
    .select()
    .from(invitation)
    .orderBy(desc(invitation.createdAt))
    .limit(10);

  console.log(`最近 ${allInvitations.length} 条邀请记录:`);
  allInvitations.forEach((inv, i) => {
    console.log(`  ${i + 1}. 邀请码: ${inv.code} | 邀请人: ${inv.inviterEmail} | 被邀请人: ${inv.inviteeEmail || '(空)'} | 状态: ${inv.status}`);
  });

  console.log('\n=== 诊断完成 ===');
}

main().catch(console.error);

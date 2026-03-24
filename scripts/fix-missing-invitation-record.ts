/**
 * 手动修复遗漏的邀请记录
 * 运行方式: npx tsx scripts/fix-missing-invitation-record.ts
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { db } from '../src/core/db';
import { invitation, user, emailVerification } from '../src/config/db/schema';
import { eq } from 'drizzle-orm';
import { getUuid } from '../src/shared/lib/hash';
import { InvitationStatus, INVITATION_REWARD_AMOUNT } from '../src/shared/models/invitation';

async function main() {
  console.log('=== 修复遗漏的邀请记录 ===\n');

  const inviteeEmail = '364016623@qq.com';
  const inviteCode = 'GWHBHXON';

  // 1. 获取被邀请人信息
  const [invitee] = await db()
    .select()
    .from(user)
    .where(eq(user.email, inviteeEmail))
    .limit(1);

  if (!invitee) {
    console.error('❌ 找不到被邀请人');
    return;
  }
  console.log(`✅ 被邀请人: ${invitee.email} (ID: ${invitee.id})`);

  // 2. 获取邀请码对应的邀请人信息
  const [inviterRecord] = await db()
    .select()
    .from(invitation)
    .where(eq(invitation.code, inviteCode))
    .limit(1);

  if (!inviterRecord) {
    console.error('❌ 找不到邀请码记录');
    return;
  }
  console.log(`✅ 邀请人: ${inviterRecord.inviterEmail} (ID: ${inviterRecord.inviterId})`);

  // 3. 检查是否已有邀请记录
  const [existingInvitation] = await db()
    .select()
    .from(invitation)
    .where(eq(invitation.inviteeId, invitee.id))
    .limit(1);

  if (existingInvitation) {
    console.log('⚠️ 已存在邀请记录，无需修复');
    console.log(`  邀请码: ${existingInvitation.code}`);
    console.log(`  状态: ${existingInvitation.status}`);
    return;
  }

  // 4. 创建新的邀请记录
  console.log('\n创建新的邀请记录...');
  const newInvitationId = getUuid();
  const now = new Date();

  const [newRecord] = await db()
    .insert(invitation)
    .values({
      id: newInvitationId,
      inviterId: inviterRecord.inviterId,
      inviterEmail: inviterRecord.inviterEmail,
      inviteeId: invitee.id,
      inviteeEmail: invitee.email,
      code: inviteCode,
      status: InvitationStatus.ACCEPTED,
      acceptedAt: invitee.createdAt, // 使用用户注册时间
      rewardAmount: 0, // 补录不发放奖励
      inviteeRewardAmount: 0, // 补录不发放奖励
      note: '手动补录：注册时邀请记录遗漏',
    })
    .returning();

  console.log('✅ 邀请记录创建成功:');
  console.log(`  ID: ${newRecord.id}`);
  console.log(`  邀请码: ${newRecord.code}`);
  console.log(`  邀请人: ${newRecord.inviterEmail}`);
  console.log(`  被邀请人: ${newRecord.inviteeEmail}`);
  console.log(`  状态: ${newRecord.status}`);

  console.log('\n=== 修复完成 ===');
}

main().catch(console.error);

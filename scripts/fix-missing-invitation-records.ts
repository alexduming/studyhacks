/**
 * 修复缺失的 invitation 记录
 *
 * 功能：
 * 为已经补发了积分但缺少 invitation 记录的用户创建记录
 */

import { and, eq } from 'drizzle-orm';

import { db } from '@/core/db';
import { credit, invitation, user } from '@/config/db/schema';
import { getUuid } from '@/shared/lib/hash';
import { createInvitation, InvitationStatus } from '@/shared/models/invitation';

async function fixMissingInvitationRecords() {
  console.log('🔧 开始修复缺失的 invitation 记录...\n');

  const database = db();

  try {
    // 查找所有标记为"补偿"的积分记录
    const compensatedCredits = await database
      .select()
      .from(credit)
      .where(eq(credit.transactionScene, 'award'));

    console.log(`📊 找到 ${compensatedCredits.length} 条奖励积分记录\n`);

    let fixedCount = 0;
    let skippedCount = 0;

    for (const creditRecord of compensatedCredits) {
      // 解析 metadata
      let metadata: any = {};
      try {
        if (creditRecord.metadata) {
          metadata = JSON.parse(creditRecord.metadata);
        }
      } catch (e) {
        continue;
      }

      // 只处理补偿的记录且是被邀请人的记录
      if (!metadata.compensated || metadata.role !== 'invitee') {
        continue;
      }

      const inviteCode = metadata.inviteCode;
      const inviteeUserId = creditRecord.userId;

      if (!inviteCode || !inviteeUserId) {
        continue;
      }

      // 检查是否已有 invitation 记录
      const existingInvitation = await database
        .select()
        .from(invitation)
        .where(
          and(
            eq(invitation.code, inviteCode),
            eq(invitation.inviteeId, inviteeUserId)
          )
        )
        .limit(1);

      if (existingInvitation.length > 0) {
        skippedCount++;
        continue;
      }

      // 获取被邀请人信息
      const [inviteeUser] = await database
        .select()
        .from(user)
        .where(eq(user.id, inviteeUserId))
        .limit(1);

      if (!inviteeUser) {
        console.log(`⚠️  找不到用户: ${inviteeUserId}`);
        continue;
      }

      // 获取邀请人信息（从同一邀请码的其他记录中查找）
      const [inviterInfo] = await database
        .select()
        .from(invitation)
        .where(eq(invitation.code, inviteCode))
        .limit(1);

      if (!inviterInfo) {
        console.log(`⚠️  找不到邀请码 ${inviteCode} 的邀请人信息`);
        continue;
      }

      // 查找邀请人的积分记录
      const inviterCredits = await database
        .select()
        .from(credit)
        .where(
          and(
            eq(credit.userId, inviterInfo.inviterId),
            eq(credit.transactionScene, 'award')
          )
        );

      let inviterCreditId = '';
      for (const ic of inviterCredits) {
        try {
          const icMetadata = JSON.parse(ic.metadata || '{}');
          if (
            icMetadata.compensated &&
            icMetadata.role === 'inviter' &&
            icMetadata.inviteCode === inviteCode &&
            ic.description?.includes(inviteeUser.email)
          ) {
            inviterCreditId = ic.id;
            break;
          }
        } catch (e) {
          continue;
        }
      }

      // 创建 invitation 记录
      const now = new Date();
      const newInvitationId = getUuid();

      try {
        await createInvitation({
          id: newInvitationId,
          inviterId: inviterInfo.inviterId,
          inviterEmail: inviterInfo.inviterEmail,
          inviteeId: inviteeUserId,
          inviteeEmail: inviteeUser.email,
          code: inviteCode,
          status: InvitationStatus.ACCEPTED,
          createdAt: inviteeUser.createdAt,
          updatedAt: now,
          acceptedAt: inviteeUser.createdAt,
          inviterCreditId: inviterCreditId || undefined,
          inviteeCreditId: creditRecord.id,
          note: '补充创建（历史数据补偿）',
        });

        console.log(
          `✅ 已创建 invitation 记录: ${inviteeUser.email} (邀请码: ${inviteCode})`
        );
        fixedCount++;
      } catch (error: any) {
        console.error(`❌ 创建失败: ${inviteeUser.email}`, error.message);
      }
    }

    console.log(`\n📊 修复完成：`);
    console.log(`  - 已创建: ${fixedCount} 条记录`);
    console.log(`  - 已存在: ${skippedCount} 条记录`);
  } catch (error) {
    console.error('\n❌ 修复失败:', error);
    throw error;
  }
}

// 运行修复
fixMissingInvitationRecords()
  .then(() => {
    console.log('\n🎉 修复脚本执行完成');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 修复脚本执行失败:', error);
    process.exit(1);
  });

/**
 * 邀请码积分补偿脚本
 *
 * 功能：
 * 1. 查找所有使用了邀请码但没有收到奖励的用户
 * 2. 为这些用户补发100积分（被邀请人）
 * 3. 为邀请人补发对应的100积分
 * 4. 创建邀请记录
 *
 * 使用方法：
 * - 只读模式（查看需要补偿的用户）：npx tsx scripts/compensate-invitation-credits.ts --dry-run
 * - 执行补偿：npx tsx scripts/compensate-invitation-credits.ts --execute
 */

import { and, eq, isNotNull } from 'drizzle-orm';

import { db } from '@/core/db';
import {
  credit,
  emailVerification,
  invitation,
  user,
} from '@/config/db/schema';
import { getSnowId, getUuid } from '@/shared/lib/hash';
import {
  createCredit,
  CreditStatus,
  CreditTransactionScene,
  CreditTransactionType,
} from '@/shared/models/credit';
import { createInvitation, InvitationStatus } from '@/shared/models/invitation';

interface CompensationRecord {
  inviteeEmail: string;
  inviteeUserId: string;
  inviteCode: string;
  inviterUserId: string;
  inviterEmail: string;
  registrationTime: Date;
}

async function findUsersNeedingCompensation(): Promise<CompensationRecord[]> {
  console.log('🔍 查找需要补偿的用户...\n');

  const database = db();
  const compensationRecords: CompensationRecord[] = [];

  // 1. 查询所有有邀请码的邮箱验证记录
  const verificationsWithInviteCode = await database
    .select()
    .from(emailVerification)
    .where(isNotNull(emailVerification.inviteCode));

  console.log(
    `📧 找到 ${verificationsWithInviteCode.length} 条有邀请码的验证记录\n`
  );

  // 2. 对每个验证记录，检查用户是否已注册且是否收到了邀请奖励
  for (const verification of verificationsWithInviteCode) {
    if (!verification.inviteCode) continue;

    // 检查用户是否已注册
    const [registeredUser] = await database
      .select()
      .from(user)
      .where(eq(user.email, verification.email))
      .limit(1);

    if (!registeredUser) {
      console.log(`⏭️  跳过：${verification.email} - 尚未注册`);
      continue;
    }

    // 检查用户是否已有邀请奖励积分
    const userCredits = await database
      .select()
      .from(credit)
      .where(eq(credit.userId, registeredUser.id));

    const hasInvitationReward = userCredits.some(
      (c) =>
        c.transactionScene === 'award' &&
        (c.description?.includes('Invitation reward') ||
          (verification.inviteCode &&
            c.metadata?.includes(verification.inviteCode)))
    );

    if (hasInvitationReward) {
      console.log(`✅ 跳过：${verification.email} - 已有邀请奖励`);
      continue;
    }

    // 查找邀请人信息（从 invitation 表获取 ID，然后从 user 表获取邮箱）
    const [invitationRecord] = await database
      .select()
      .from(invitation)
      .where(eq(invitation.code, verification.inviteCode.toUpperCase()))
      .limit(1);

    if (!invitationRecord) {
      console.log(
        `⚠️  跳过：${verification.email} - 找不到邀请码 ${verification.inviteCode} 的邀请人信息`
      );
      continue;
    }

    // 获取邀请人邮箱
    const [inviterUser] = await database
      .select()
      .from(user)
      .where(eq(user.id, invitationRecord.inviterId))
      .limit(1);

    if (!inviterUser) {
      console.log(
        `⚠️  跳过：${verification.email} - 找不到邀请人用户 (ID: ${invitationRecord.inviterId})`
      );
      continue;
    }

    // 确保不是自己邀请自己
    if (invitationRecord.inviterId === registeredUser.id) {
      console.log(`⚠️  跳过：${verification.email} - 使用了自己的邀请码`);
      continue;
    }

    // 添加到补偿列表
    compensationRecords.push({
      inviteeEmail: verification.email,
      inviteeUserId: registeredUser.id,
      inviteCode: verification.inviteCode.toUpperCase(),
      inviterUserId: invitationRecord.inviterId,
      inviterEmail: inviterUser.email,
      registrationTime: registeredUser.createdAt,
    });

    console.log(
      `💰 需要补偿：${verification.email} (邀请码: ${verification.inviteCode})`
    );
  }

  return compensationRecords;
}

async function compensateUser(
  record: CompensationRecord,
  dryRun: boolean = true
) {
  const database = db();

  console.log(`\n处理补偿：${record.inviteeEmail}`);
  console.log(`  邀请码: ${record.inviteCode}`);
  console.log(`  邀请人: ${record.inviterEmail}`);
  console.log(`  注册时间: ${record.registrationTime}`);

  if (dryRun) {
    console.log(`  [只读模式] 将会补偿：`);
    console.log(`    - 被邀请人 ${record.inviteeEmail}: 100积分`);
    console.log(`    - 邀请人 ${record.inviterEmail}: 100积分`);
    console.log(`    - 创建邀请记录`);
    return;
  }

  try {
    // 计算积分过期时间（1个月后）
    const creditExpiresAt = new Date();
    creditExpiresAt.setMonth(creditExpiresAt.getMonth() + 1);
    creditExpiresAt.setHours(23, 59, 59, 999);

    // 1. 给被邀请人补发100积分
    const inviteeCreditId = getUuid();
    await createCredit({
      id: inviteeCreditId,
      userId: record.inviteeUserId,
      transactionNo: getSnowId(),
      transactionType: CreditTransactionType.GRANT,
      transactionScene: CreditTransactionScene.AWARD,
      credits: 100,
      remainingCredits: 100,
      description: `[补偿] Invitation reward for new user (invited by ${record.inviterEmail})`,
      expiresAt: creditExpiresAt,
      status: CreditStatus.ACTIVE,
      metadata: JSON.stringify({
        inviteCode: record.inviteCode,
        role: 'invitee',
        compensated: true,
        compensationDate: new Date().toISOString(),
      }),
    });
    console.log(`  ✅ 已补发被邀请人积分`);

    // 2. 给邀请人补发100积分
    const inviterCreditId = getUuid();
    await createCredit({
      id: inviterCreditId,
      userId: record.inviterUserId,
      transactionNo: getSnowId(),
      transactionType: CreditTransactionType.GRANT,
      transactionScene: CreditTransactionScene.AWARD,
      credits: 100,
      remainingCredits: 100,
      description: `[补偿] Invitation reward for referring ${record.inviteeEmail}`,
      expiresAt: creditExpiresAt,
      status: CreditStatus.ACTIVE,
      metadata: JSON.stringify({
        inviteCode: record.inviteCode,
        role: 'inviter',
        compensated: true,
        compensationDate: new Date().toISOString(),
      }),
    });
    console.log(`  ✅ 已补发邀请人积分`);

    // 3. 创建邀请记录
    const now = new Date();
    const newInvitationId = getUuid();
    await createInvitation({
      id: newInvitationId,
      inviterId: record.inviterUserId,
      inviteeId: record.inviteeUserId,
      inviteeEmail: record.inviteeEmail,
      code: record.inviteCode,
      status: InvitationStatus.ACCEPTED,
      createdAt: record.registrationTime,
      updatedAt: now, // 添加 updatedAt 字段
      acceptedAt: record.registrationTime,
      inviterCreditId: inviterCreditId,
      inviteeCreditId: inviteeCreditId,
      note: '历史数据补偿',
    });
    console.log(`  ✅ 已创建邀请记录`);
  } catch (error: any) {
    console.error(`  ❌ 补偿失败:`, error.message);
    throw error;
  }
}

async function runCompensation() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes('--execute');

  console.log('🎁 邀请码积分补偿脚本\n');

  if (dryRun) {
    console.log('⚠️  当前为只读模式（--dry-run）');
    console.log('   只会显示需要补偿的用户，不会实际执行补偿');
    console.log(
      '   如需执行补偿，请使用: npx tsx scripts/compensate-invitation-credits.ts --execute\n'
    );
  } else {
    console.log('🚀 执行模式：将实际补发积分\n');
  }

  try {
    // 1. 查找需要补偿的用户
    const compensationRecords = await findUsersNeedingCompensation();

    console.log(`\n\n📊 补偿统计：`);
    console.log(`  - 需要补偿的用户数: ${compensationRecords.length}`);

    if (compensationRecords.length === 0) {
      console.log('\n✅ 没有需要补偿的用户！');
      return;
    }

    // 按邀请码分组统计
    const codeStats: Record<string, number> = {};
    compensationRecords.forEach((record) => {
      codeStats[record.inviteCode] = (codeStats[record.inviteCode] || 0) + 1;
    });

    console.log(`\n  按邀请码分组：`);
    Object.entries(codeStats).forEach(([code, count]) => {
      console.log(`    - ${code}: ${count} 人`);
    });

    // 2. 执行补偿
    console.log(`\n\n${dryRun ? '📋 预览补偿计划' : '💰 开始执行补偿'}：\n`);

    let successCount = 0;
    let failCount = 0;

    for (const record of compensationRecords) {
      try {
        await compensateUser(record, dryRun);
        successCount++;
      } catch (error) {
        failCount++;
        console.error(`❌ 补偿失败: ${record.inviteeEmail}`);
      }
    }

    // 3. 总结
    console.log(`\n\n📊 补偿结果：`);
    if (dryRun) {
      console.log(`  - 预计补偿用户数: ${compensationRecords.length}`);
      console.log(
        `  - 预计补发被邀请人积分: ${compensationRecords.length * 100}`
      );
      console.log(
        `  - 预计补发邀请人积分: ${compensationRecords.length * 100}`
      );
      console.log(`\n⚠️  这是只读模式，没有实际执行补偿`);
      console.log(
        `   如需执行，请运行: npx tsx scripts/compensate-invitation-credits.ts --execute`
      );
    } else {
      console.log(`  - 成功补偿: ${successCount} 人`);
      console.log(`  - 失败: ${failCount} 人`);
      console.log(
        `  - 总共补发积分: ${successCount * 200} (被邀请人 ${successCount * 100} + 邀请人 ${successCount * 100})`
      );

      if (successCount > 0) {
        console.log(`\n✅ 补偿完成！`);
      }
      if (failCount > 0) {
        console.log(`\n⚠️  有 ${failCount} 个用户补偿失败，请检查日志`);
      }
    }
  } catch (error) {
    console.error('\n❌ 补偿脚本执行失败:', error);
    throw error;
  }
}

// 运行补偿
runCompensation()
  .then(() => {
    console.log('\n🎉 补偿脚本执行完成');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 补偿脚本执行失败:', error);
    process.exit(1);
  });

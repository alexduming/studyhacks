/**
 * 邀请码积分诊断脚本
 * 
 * 功能：
 * 1. 检查 email_verification 表中有邀请码的记录
 * 2. 检查这些用户是否已注册（user 表）
 * 3. 检查这些用户是否收到了邀请奖励积分（credit 表）
 * 4. 检查邀请人是否收到了邀请奖励积分
 * 5. 检查 invitation 表中的邀请记录状态
 */

import { db } from '@/core/db';
import { emailVerification, invitation, user, credit } from '@/config/db/schema';
import { eq, and, isNotNull } from 'drizzle-orm';

async function diagnoseInvitationCredits() {
  console.log('🔍 开始诊断邀请码积分问题...\n');

  const database = db();

  try {
    // 1. 查询所有有邀请码的邮箱验证记录
    console.log('📧 第一步：查询 email_verification 表中有邀请码的记录...');
    const verificationsWithInviteCode = await database
      .select()
      .from(emailVerification)
      .where(isNotNull(emailVerification.inviteCode));

    console.log(`✅ 找到 ${verificationsWithInviteCode.length} 条有邀请码的验证记录\n`);

    if (verificationsWithInviteCode.length === 0) {
      console.log('⚠️ 没有找到任何有邀请码的验证记录');
      return;
    }

    // 统计邀请码使用情况
    const inviteCodeStats: Record<string, number> = {};
    verificationsWithInviteCode.forEach(v => {
      if (v.inviteCode) {
        inviteCodeStats[v.inviteCode] = (inviteCodeStats[v.inviteCode] || 0) + 1;
      }
    });

    console.log('📊 邀请码使用统计：');
    Object.entries(inviteCodeStats).forEach(([code, count]) => {
      console.log(`   - ${code}: ${count} 次`);
    });
    console.log('');

    // 2. 针对特定邀请码 "ZVVOEZIC" 进行详细分析
    const targetInviteCode = 'ZVVOEZIC';
    console.log(`🎯 详细分析邀请码: ${targetInviteCode}\n`);

    const targetVerifications = verificationsWithInviteCode.filter(
      v => v.inviteCode === targetInviteCode
    );

    console.log(`📧 使用邀请码 ${targetInviteCode} 的邮箱：`);
    for (const verification of targetVerifications) {
      console.log(`\n   邮箱: ${verification.email}`);
      console.log(`   是否已验证: ${verification.isVerified ? '是' : '否'}`);
      console.log(`   验证时间: ${verification.verifiedAt || '未验证'}`);
      console.log(`   创建时间: ${verification.createdAt}`);

      // 检查该邮箱是否已注册用户
      const [registeredUser] = await database
        .select()
        .from(user)
        .where(eq(user.email, verification.email))
        .limit(1);

      if (registeredUser) {
        console.log(`   ✅ 用户已注册 - UserID: ${registeredUser.id}`);
        console.log(`   用户名: ${registeredUser.name}`);
        console.log(`   注册时间: ${registeredUser.createdAt}`);

        // 检查该用户的积分记录
        const userCredits = await database
          .select()
          .from(credit)
          .where(eq(credit.userId, registeredUser.id));

        console.log(`   💰 积分记录数量: ${userCredits.length}`);
        
        if (userCredits.length > 0) {
          console.log(`   积分详情：`);
          userCredits.forEach(c => {
            console.log(`      - ${c.description}`);
            console.log(`        积分: ${c.credits}, 剩余: ${c.remainingCredits}`);
            console.log(`        类型: ${c.transactionType}, 场景: ${c.transactionScene}`);
            console.log(`        状态: ${c.status}, 创建时间: ${c.createdAt}`);
            if (c.metadata) {
              console.log(`        元数据: ${c.metadata}`);
            }
          });
        } else {
          console.log(`   ❌ 该用户没有任何积分记录！`);
        }

        // 检查是否有邀请奖励积分
        const invitationRewardCredits = userCredits.filter(
          c => c.transactionScene === 'award' && c.description?.includes('Invitation reward')
        );

        if (invitationRewardCredits.length === 0) {
          console.log(`   ⚠️ 该用户没有收到邀请奖励积分！`);
        } else {
          console.log(`   ✅ 该用户已收到 ${invitationRewardCredits.length} 笔邀请奖励积分`);
        }
      } else {
        console.log(`   ❌ 该邮箱尚未注册用户`);
      }
    }

    // 3. 检查 invitation 表中的邀请记录
    console.log(`\n\n📋 第三步：检查 invitation 表中的邀请记录...\n`);
    
    const [invitationRecord] = await database
      .select()
      .from(invitation)
      .where(eq(invitation.code, targetInviteCode))
      .limit(1);

    if (invitationRecord) {
      console.log(`✅ 找到邀请记录：`);
      console.log(`   邀请码: ${invitationRecord.code}`);
      console.log(`   邀请人ID: ${invitationRecord.inviterId}`);
      console.log(`   邀请人邮箱: ${invitationRecord.inviterEmail}`);
      console.log(`   被邀请人ID: ${invitationRecord.inviteeId || '未设置'}`);
      console.log(`   被邀请人邮箱: ${invitationRecord.inviteeEmail || '未设置'}`);
      console.log(`   状态: ${invitationRecord.status}`);
      console.log(`   创建时间: ${invitationRecord.createdAt}`);
      console.log(`   接受时间: ${invitationRecord.acceptedAt || '未接受'}`);
      console.log(`   邀请人积分ID: ${invitationRecord.inviterCreditId || '未设置'}`);
      console.log(`   被邀请人积分ID: ${invitationRecord.inviteeCreditId || '未设置'}`);

      // 检查邀请人的积分情况
      if (invitationRecord.inviterId) {
        console.log(`\n   🔍 检查邀请人的积分情况...`);
        const [inviter] = await database
          .select()
          .from(user)
          .where(eq(user.id, invitationRecord.inviterId))
          .limit(1);

        if (inviter) {
          console.log(`   邀请人: ${inviter.name} (${inviter.email})`);

          const inviterCredits = await database
            .select()
            .from(credit)
            .where(eq(credit.userId, inviter.id));

          console.log(`   💰 邀请人积分记录数量: ${inviterCredits.length}`);

          const inviterRewardCredits = inviterCredits.filter(
            c => c.transactionScene === 'award' && c.description?.includes('Invitation reward')
          );

          if (inviterRewardCredits.length === 0) {
            console.log(`   ⚠️ 邀请人没有收到任何邀请奖励积分！`);
          } else {
            console.log(`   ✅ 邀请人已收到 ${inviterRewardCredits.length} 笔邀请奖励积分`);
            inviterRewardCredits.forEach(c => {
              console.log(`      - ${c.description}`);
              console.log(`        积分: ${c.credits}, 剩余: ${c.remainingCredits}`);
              console.log(`        创建时间: ${c.createdAt}`);
            });
          }
        }
      }
    } else {
      console.log(`❌ 未找到邀请码 ${targetInviteCode} 的邀请记录！`);
      console.log(`⚠️ 这可能是问题的根源：邀请码存在于 email_verification 表，但不存在于 invitation 表`);
    }

    // 4. 总结问题
    console.log(`\n\n📊 问题总结：\n`);
    
    const registeredUsersWithCode = [];
    for (const verification of targetVerifications) {
      const [registeredUser] = await database
        .select()
        .from(user)
        .where(eq(user.email, verification.email))
        .limit(1);
      
      if (registeredUser) {
        const userCredits = await database
          .select()
          .from(credit)
          .where(eq(credit.userId, registeredUser.id));
        
        const hasInvitationReward = userCredits.some(
          c => c.transactionScene === 'award' && c.description?.includes('Invitation reward')
        );

        registeredUsersWithCode.push({
          email: verification.email,
          userId: registeredUser.id,
          hasInvitationReward,
          totalCredits: userCredits.length,
        });
      }
    }

    console.log(`使用邀请码 ${targetInviteCode} 的用户：`);
    console.log(`   - 总数: ${targetVerifications.length}`);
    console.log(`   - 已注册: ${registeredUsersWithCode.length}`);
    console.log(`   - 收到邀请奖励: ${registeredUsersWithCode.filter(u => u.hasInvitationReward).length}`);
    console.log(`   - 未收到邀请奖励: ${registeredUsersWithCode.filter(u => !u.hasInvitationReward).length}`);

    if (registeredUsersWithCode.filter(u => !u.hasInvitationReward).length > 0) {
      console.log(`\n❌ 发现问题：有用户使用了邀请码注册，但没有收到邀请奖励积分！`);
      console.log(`\n未收到奖励的用户：`);
      registeredUsersWithCode
        .filter(u => !u.hasInvitationReward)
        .forEach(u => {
          console.log(`   - ${u.email} (UserID: ${u.userId})`);
        });
    }

    console.log(`\n✅ 诊断完成！`);

  } catch (error) {
    console.error('❌ 诊断过程中出错:', error);
    throw error;
  }
}

// 运行诊断
diagnoseInvitationCredits()
  .then(() => {
    console.log('\n🎉 诊断脚本执行完成');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 诊断脚本执行失败:', error);
    process.exit(1);
  });


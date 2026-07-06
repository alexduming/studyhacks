/**
 * 检查邮箱验证记录中的邀请码
 * 运行方式: npx tsx scripts/check-invite-code-in-verification.ts
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { db } from '../src/core/db';
import { emailVerification, user } from '../src/config/db/schema';
import { eq, desc } from 'drizzle-orm';

async function main() {
  console.log('=== 检查邮箱验证记录中的邀请码 ===\n');

  const inviteeEmail = '364016623@qq.com';
  console.log(`检查邮箱: ${inviteeEmail}\n`);

  // 1. 检查 email_verification 表
  console.log('--- email_verification 表 ---');
  const verifications = await db()
    .select()
    .from(emailVerification)
    .where(eq(emailVerification.email, inviteeEmail));

  if (verifications.length === 0) {
    console.log('❌ 没有找到验证记录（可能已被删除）');
  } else {
    verifications.forEach((v, i) => {
      console.log(`记录 ${i + 1}:`);
      console.log(`  邮箱: ${v.email}`);
      console.log(`  邀请码: ${v.inviteCode || '(空)'}`);
      console.log(`  类型: ${v.type}`);
      console.log(`  已验证: ${v.isVerified}`);
      console.log(`  创建时间: ${v.createdAt}`);
    });
  }

  // 2. 检查用户表
  console.log('\n--- user 表 ---');
  const [userRecord] = await db()
    .select()
    .from(user)
    .where(eq(user.email, inviteeEmail))
    .limit(1);

  if (userRecord) {
    console.log(`用户ID: ${userRecord.id}`);
    console.log(`邮箱: ${userRecord.email}`);
    console.log(`姓名: ${userRecord.name}`);
    console.log(`创建时间: ${userRecord.createdAt}`);
  } else {
    console.log('❌ 用户不存在');
  }

  // 3. 检查最近的验证记录
  console.log('\n--- 最近的验证记录 ---');
  const recentVerifications = await db()
    .select()
    .from(emailVerification)
    .orderBy(desc(emailVerification.createdAt))
    .limit(10);

  console.log(`最近 ${recentVerifications.length} 条验证记录:`);
  recentVerifications.forEach((v, i) => {
    console.log(`  ${i + 1}. ${v.email} | 邀请码: ${v.inviteCode || '(空)'} | 已验证: ${v.isVerified} | ${v.createdAt}`);
  });

  console.log('\n=== 检查完成 ===');
}

main().catch(console.error);

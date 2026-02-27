/**
 * 测试邀请码查询
 * 运行方式: npx tsx scripts/test-invite-code-lookup.ts
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { db } from '../src/core/db';
import { invitation } from '../src/config/db/schema';
import { eq } from 'drizzle-orm';
import { getInvitationByCode } from '../src/shared/models/invitation';

async function main() {
  const inviteCode = 'GWHBHXON';
  console.log(`=== 测试邀请码查询: ${inviteCode} ===\n`);

  // 1. 直接查询 invitation 表
  console.log('--- 直接查询 invitation 表 ---');
  const [directResult] = await db()
    .select()
    .from(invitation)
    .where(eq(invitation.code, inviteCode))
    .limit(1);

  if (directResult) {
    console.log('✅ 找到邀请记录:');
    console.log(`  ID: ${directResult.id}`);
    console.log(`  邀请码: ${directResult.code}`);
    console.log(`  邀请人ID: ${directResult.inviterId}`);
    console.log(`  邀请人邮箱: ${directResult.inviterEmail}`);
    console.log(`  状态: ${directResult.status}`);
    console.log(`  被邀请人ID: ${directResult.inviteeId || '(空)'}`);
    console.log(`  被邀请人邮箱: ${directResult.inviteeEmail || '(空)'}`);
  } else {
    console.log('❌ 没有找到邀请记录');
  }

  // 2. 使用 getInvitationByCode 函数
  console.log('\n--- 使用 getInvitationByCode 函数 ---');
  const funcResult = await getInvitationByCode(inviteCode);

  if (funcResult) {
    console.log('✅ 函数返回结果:');
    console.log(`  ID: ${funcResult.id}`);
    console.log(`  邀请码: ${funcResult.code}`);
    console.log(`  邀请人ID: ${funcResult.inviterId}`);
    console.log(`  邀请人邮箱: ${funcResult.inviterEmail}`);
    console.log(`  状态: ${funcResult.status}`);
  } else {
    console.log('❌ 函数返回 null');
  }

  console.log('\n=== 测试完成 ===');
}

main().catch(console.error);

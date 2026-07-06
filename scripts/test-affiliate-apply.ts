/**
 * 测试分销员申请功能
 * 运行方式: npx tsx scripts/test-affiliate-apply.ts
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { db } from '../src/core/db';
import { affiliateApplication, user } from '../src/config/db/schema';
import { eq, desc } from 'drizzle-orm';
import { getUuid } from '../src/shared/lib/hash';

async function main() {
  console.log('Testing affiliate application...');

  // 1. 获取一个测试用户
  const [testUser] = await db()
    .select()
    .from(user)
    .limit(1);

  if (!testUser) {
    console.error('No user found in database');
    return;
  }

  console.log('Test user:', testUser.email);

  // 2. 检查是否已有申请
  const [existingApp] = await db()
    .select()
    .from(affiliateApplication)
    .where(eq(affiliateApplication.userId, testUser.id))
    .orderBy(desc(affiliateApplication.createdAt))
    .limit(1);

  if (existingApp) {
    console.log('Existing application found:', existingApp);
    return;
  }

  // 3. 创建新申请
  console.log('Creating new application...');
  const [newApp] = await db()
    .insert(affiliateApplication)
    .values({
      id: getUuid(),
      userId: testUser.id,
      reason: '测试申请',
      socialMedia: 'https://twitter.com/test',
      status: 'pending',
    })
    .returning();

  console.log('Application created:', newApp);

  // 4. 验证查询
  const [verifyApp] = await db()
    .select()
    .from(affiliateApplication)
    .where(eq(affiliateApplication.id, newApp.id));

  console.log('Verified application:', verifyApp);

  console.log('Test completed successfully!');
}

main().catch(console.error);

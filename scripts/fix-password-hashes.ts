/**
 * 修复已有用户的密码哈希格式
 * 将使用 bcryptjs 创建的密码哈希转换为 better-auth 兼容的格式
 * 
 * 重要说明：
 * - 由于我们无法从哈希值还原原始密码，这个脚本会为所有受影响的用户设置临时密码
 * - 受影响的用户需要使用"忘记密码"功能重置密码
 * - 这个脚本只处理 providerId 为 'credential' 的账户
 */

import { eq, and, desc } from 'drizzle-orm';
import { hashPassword } from 'better-auth/crypto';
import { compare } from 'bcryptjs';

import { db } from '../src/core/db';
import { user, account } from '../src/config/db/schema';
import { getUuid } from '../src/shared/lib/hash';

async function fixPasswordHashes() {
  const database = db();
  
  console.log('🔧 开始修复密码哈希格式...\n');
  
  // 获取所有使用 credential 提供者的账户
  const credentialAccounts = await database
    .select({
      accountId: account.id,
      userId: account.userId,
      email: user.email,
      password: account.password,
    })
    .from(account)
    .innerJoin(user, eq(user.id, account.userId))
    .where(
      and(
        eq(account.providerId, 'credential')
      )
    )
    .orderBy(desc(account.createdAt));
  
  console.log(`📊 找到 ${credentialAccounts.length} 个使用邮箱密码登录的账户\n`);
  
  if (credentialAccounts.length === 0) {
    console.log('✅ 没有需要修复的账户');
    return;
  }
  
  // 为每个账户重新生成密码哈希
  const results = [];
  
  for (const acc of credentialAccounts) {
    if (!acc.password) {
      console.log(`⚠️  账户 ${acc.email} 没有密码，跳过`);
      results.push({
        email: acc.email,
        status: 'skipped',
        reason: 'no_password',
      });
      continue;
    }
    
    try {
      // 生成一个临时密码（用户需要重置）
      const tempPassword = `Temp${getUuid().substring(0, 8)}!`;
      
      // 使用 better-auth 的 hashPassword 函数
      const newHash = await hashPassword(tempPassword);
      
      // 更新数据库
      await database
        .update(account)
        .set({
          password: newHash,
          updatedAt: new Date(),
        })
        .where(eq(account.id, acc.accountId));
      
      console.log(`✅ 已更新账户 ${acc.email} 的密码哈希`);
      console.log(`   临时密码: ${tempPassword}`);
      console.log(`   （用户需要通过"忘记密码"功能重置）\n`);
      
      results.push({
        email: acc.email,
        status: 'updated',
        tempPassword,
      });
    } catch (error: any) {
      console.error(`❌ 更新账户 ${acc.email} 失败:`, error.message);
      results.push({
        email: acc.email,
        status: 'failed',
        error: error.message,
      });
    }
  }
  
  // 输出汇总
  console.log('\n' + '='.repeat(60));
  console.log('📊 修复汇总:');
  console.log('='.repeat(60));
  console.log(`总计: ${credentialAccounts.length} 个账户`);
  console.log(`已更新: ${results.filter((r) => r.status === 'updated').length} 个`);
  console.log(`跳过: ${results.filter((r) => r.status === 'skipped').length} 个`);
  console.log(`失败: ${results.filter((r) => r.status === 'failed').length} 个`);
  console.log('='.repeat(60));
  
  console.log('\n⚠️  重要提醒:');
  console.log('   所有受影响的用户需要使用"忘记密码"功能重置密码');
  console.log('   建议向这些用户发送密码重置邮件');
}

fixPasswordHashes()
  .catch(console.error)
  .finally(() => process.exit(0));


/**
 * 诊断账户密码问题
 * 检查最近创建的账户的密码字段状态
 */

import { eq, desc, and } from 'drizzle-orm';
import { db } from '../src/core/db';
import { user, account } from '../src/config/db/schema';

async function diagnoseAccountPassword() {
  const database = db();
  
  console.log('🔍 开始诊断账户密码...\n');
  
  // 获取最近创建的 5 个用户
  const recentUsers = await database
    .select()
    .from(user)
    .orderBy(desc(user.createdAt))
    .limit(5);
  
  console.log(`📊 最近 5 个用户:\n`);
  
  for (const u of recentUsers) {
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`👤 用户: ${u.email}`);
    console.log(`   ID: ${u.id}`);
    console.log(`   Name: ${u.name}`);
    console.log(`   Email Verified: ${u.emailVerified}`);
    console.log(`   Created: ${u.createdAt.toISOString()}`);
    
    // 查找对应的所有 account
    const accounts = await database
      .select()
      .from(account)
      .where(eq(account.userId, u.id));
    
    console.log(`\n   📋 Account 记录 (${accounts.length} 条):`);
    
    if (accounts.length === 0) {
      console.log(`      ❌ 没有 account 记录！`);
    } else {
      for (const acc of accounts) {
        console.log(`\n      ┌─ Account ID: ${acc.id}`);
        console.log(`      ├─ Account ID (field): ${acc.accountId}`);
        console.log(`      ├─ Provider ID: ${acc.providerId}`);
        console.log(`      ├─ Created: ${acc.createdAt.toISOString()}`);
        console.log(`      ├─ Has Password: ${acc.password ? '✅ Yes' : '❌ No'}`);
        
        if (acc.password) {
          console.log(`      ├─ Password Length: ${acc.password.length}`);
          console.log(`      ├─ Password Prefix: ${acc.password.substring(0, 10)}...`);
          console.log(`      ├─ Password Format: ${acc.password.startsWith('$2a$') || acc.password.startsWith('$2b$') ? '✅ bcrypt' : '❌ Unknown'}`);
          
          // 检查是否是 better-auth 的 hashPassword 格式
          const isBcrypt = acc.password.startsWith('$2a$') || acc.password.startsWith('$2b$') || acc.password.startsWith('$2y$');
          if (isBcrypt) {
            const parts = acc.password.split('$');
            console.log(`      ├─ Bcrypt Version: ${parts[1]}`);
            console.log(`      ├─ Bcrypt Rounds: ${parts[2]}`);
          }
        } else {
          console.log(`      ├─ ⚠️  密码字段为空！这可能导致登录失败`);
        }
        console.log(`      └─`);
      }
    }
    console.log('');
  }
  
  // 统计分析
  console.log(`\n${'='.repeat(60)}`);
  console.log('📊 统计分析:');
  console.log('='.repeat(60));
  
  const credentialAccounts = await database
    .select()
    .from(account)
    .where(eq(account.providerId, 'credential'));
  
  const accountsWithPassword = credentialAccounts.filter(acc => acc.password);
  const accountsWithoutPassword = credentialAccounts.filter(acc => !acc.password);
  
  console.log(`总 credential accounts: ${credentialAccounts.length}`);
  console.log(`有密码: ${accountsWithPassword.length} (${((accountsWithPassword.length / credentialAccounts.length) * 100).toFixed(1)}%)`);
  console.log(`无密码: ${accountsWithoutPassword.length} (${((accountsWithoutPassword.length / credentialAccounts.length) * 100).toFixed(1)}%)`);
  
  if (accountsWithoutPassword.length > 0) {
    console.log(`\n⚠️  发现 ${accountsWithoutPassword.length} 个没有密码的 credential account！`);
    console.log('这些账户无法登录，需要修复。');
  }
  
  console.log('\n✅ 诊断完成');
}

diagnoseAccountPassword()
  .catch(console.error)
  .finally(() => process.exit(0));


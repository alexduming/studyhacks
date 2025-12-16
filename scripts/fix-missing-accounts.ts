/**
 * 数据修复脚本：为缺少 account 记录的用户创建 account 记录
 * 
 * 问题描述：
 * - 某些用户在 user 表中存在，email_verified 为 true
 * - 但在 account 表中没有对应的记录
 * - 这导致用户无法登录
 * 
 * 解决方案：
 * - 查找所有缺少 account 的用户
 * - 为这些用户创建临时的 account 记录
 * - 用户需要通过"忘记密码"功能重置密码后才能登录
 * 
 * 使用方法：
 * - 在项目根目录运行: npx tsx scripts/fix-missing-accounts.ts
 */

import { db } from '../src/core/db';
import { user, account } from '../src/config/db/schema';
import { eq, and } from 'drizzle-orm';
import { getUuid } from '../src/shared/lib/hash';
import { hash } from 'bcryptjs';

/**
 * 查找所有缺少 account 记录的用户
 * 
 * 非程序员解释：
 * - 先查询所有用户
 * - 然后检查每个用户是否有对应的 account 记录
 * - 如果没有 account 记录，说明数据不一致，需要修复
 */
async function findUsersWithoutAccounts() {
  const database = db();
  
  // 1. 查询所有用户
  const allUsers = await database
    .select({
      id: user.id,
      email: user.email,
      name: user.name,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt,
    })
    .from(user);

  // 2. 检查每个用户是否有 credential account 记录
  const usersWithoutAccounts = [];
  
  for (const u of allUsers) {
    const existingAccount = await database
      .select()
      .from(account)
      .where(
        and(
          eq(account.userId, u.id),
          eq(account.providerId, 'credential')
        )
      )
      .limit(1);

    // 如果没有 account 记录，添加到需要修复的列表
    if (existingAccount.length === 0) {
      usersWithoutAccounts.push(u);
    }
  }

  return usersWithoutAccounts;
}

/**
 * 为缺少 account 的用户创建临时 account 记录
 * 注意：这些用户需要通过"忘记密码"功能重置密码
 */
async function createMissingAccounts(userIds: string[], emails: string[]) {
  const database = db();
  const results = [];

  for (let i = 0; i < userIds.length; i++) {
    const userId = userIds[i];
    const email = emails[i];

    try {
      // 检查是否已经存在 account（防止重复创建）
      const existingAccount = await database
        .select()
        .from(account)
        .where(
          and(
            eq(account.userId, userId),
            eq(account.providerId, 'credential')
          )
        )
        .limit(1);

      if (existingAccount.length > 0) {
        console.log(`⚠️  用户 ${email} 已有 account 记录，跳过`);
        results.push({
          email,
          status: 'skipped',
          message: '已有 account 记录',
        });
        continue;
      }

      // 创建一个临时密码（用户需要通过"忘记密码"重置）
      // 使用一个不可能被猜到的临时密码
      const tempPassword = `temp_${getUuid()}_${Date.now()}`;
      const hashedPassword = await hash(tempPassword, 10);

      // 创建 account 记录
      const accountId = getUuid();
      await database.insert(account).values({
        id: accountId,
        accountId: email, // better-auth 使用邮箱作为 accountId
        providerId: 'credential', // better-auth 的邮箱密码提供者
        userId: userId,
        password: hashedPassword, // 临时密码，用户需要重置
      });

      console.log(`✅ 为用户 ${email} 创建了 account 记录`);
      results.push({
        email,
        status: 'created',
        message: '已创建 account 记录，用户需要通过"忘记密码"功能重置密码',
      });
    } catch (error: any) {
      console.error(`❌ 为用户 ${email} 创建 account 失败:`, error.message);
      results.push({
        email,
        status: 'error',
        message: error.message,
      });
    }
  }

  return results;
}

/**
 * 主函数
 */
async function main() {
  console.log('🔍 开始查找缺少 account 记录的用户...\n');

  try {
    // 查找缺少 account 的用户
    const usersWithoutAccounts = await findUsersWithoutAccounts();

    if (usersWithoutAccounts.length === 0) {
      console.log('✅ 没有发现缺少 account 记录的用户，数据库状态正常！');
      return;
    }

    console.log(`⚠️  发现 ${usersWithoutAccounts.length} 个缺少 account 记录的用户：\n`);
    
    // 显示用户列表
    usersWithoutAccounts.forEach((user, index) => {
      console.log(`${index + 1}. ${user.email} (ID: ${user.id})`);
      console.log(`   - 姓名: ${user.name}`);
      console.log(`   - 邮箱已验证: ${user.emailVerified ? '是' : '否'}`);
      console.log(`   - 注册时间: ${user.createdAt}`);
      console.log('');
    });

    // 询问是否继续修复
    console.log('📝 注意：');
    console.log('   - 这些用户需要通过"忘记密码"功能重置密码后才能登录');
    console.log('   - 修复后，用户可以使用邮箱和重置后的密码登录\n');

    // 提取用户 ID 和邮箱
    const userIds = usersWithoutAccounts.map(u => u.id);
    const emails = usersWithoutAccounts.map(u => u.email);

    // 执行修复
    console.log('🔧 开始创建缺失的 account 记录...\n');
    const results = await createMissingAccounts(userIds, emails);

    // 显示结果统计
    console.log('\n📊 修复结果统计：');
    const created = results.filter(r => r.status === 'created').length;
    const skipped = results.filter(r => r.status === 'skipped').length;
    const errors = results.filter(r => r.status === 'error').length;

    console.log(`   ✅ 成功创建: ${created} 个`);
    console.log(`   ⚠️  跳过: ${skipped} 个`);
    console.log(`   ❌ 失败: ${errors} 个`);

    if (created > 0) {
      console.log('\n📧 下一步操作：');
      console.log('   1. 通知这些用户使用"忘记密码"功能重置密码');
      console.log('   2. 或者，让用户重新完成注册流程（系统会自动检测并补全 account）');
    }

  } catch (error) {
    console.error('❌ 脚本执行失败:', error);
    process.exit(1);
  }
}

// 运行脚本
main()
  .then(() => {
    console.log('\n✅ 脚本执行完成');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ 脚本执行出错:', error);
    process.exit(1);
  });


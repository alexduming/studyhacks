/**
 * 通知旧用户重置密码
 * 
 * 用途：给所有使用旧密码格式的用户发送邮件，提示他们重置密码
 */

import { eq, and } from 'drizzle-orm';
import { db } from '../src/core/db';
import { user, account } from '../src/config/db/schema';
import { resend } from '../src/extensions/email/resend';

async function notifyUsers() {
  const database = db();
  
  console.log('📧 开始通知用户重置密码...\n');
  
  // 获取所有 credential 账户
  const credentialAccounts = await database
    .select({
      userId: account.userId,
      email: user.email,
      name: user.name,
      password: account.password,
    })
    .from(account)
    .innerJoin(user, eq(user.id, account.userId))
    .where(eq(account.providerId, 'credential'));
  
  console.log(`找到 ${credentialAccounts.length} 个邮箱账户\n`);
  
  // 过滤出需要重置密码的用户（密码是 bcrypt 格式的）
  const usersNeedReset = credentialAccounts.filter(acc => {
    if (!acc.password) return false;
    // bcrypt 格式：$2a$ 或 $2b$ 开头，60 字符
    return (acc.password.startsWith('$2a$') || acc.password.startsWith('$2b$')) 
           && acc.password.length === 60;
  });
  
  console.log(`其中需要重置密码的用户: ${usersNeedReset.length} 个\n`);
  
  if (usersNeedReset.length === 0) {
    console.log('✅ 没有用户需要通知');
    return;
  }
  
  // 询问是否继续
  console.log('将通知以下用户:');
  usersNeedReset.forEach((u, i) => {
    console.log(`  ${i + 1}. ${u.email} (${u.name})`);
  });
  console.log('\n⚠️  这会给这些用户发送邮件，请确认是否继续？');
  console.log('   要继续，请取消注释下面的发送代码\n');
  
  // TODO: 取消注释以下代码来实际发送邮件
  /*
  let successCount = 0;
  let failCount = 0;
  
  for (const u of usersNeedReset) {
    try {
      // 构建邮件内容
      const emailContent = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #6366f1;">StudyHacks 系统升级通知</h2>
          
          <p>尊敬的 ${u.name}，</p>
          
          <p>为了提升账户安全性，我们最近对系统进行了安全升级。</p>
          
          <p><strong>为确保您能正常登录，请按以下步骤重置密码：</strong></p>
          
          <ol>
            <li>访问 <a href="https://www.studyhacks.ai/sign-in">登录页面</a></li>
            <li>点击"忘记密码？"</li>
            <li>输入您的邮箱：<strong>${u.email}</strong></li>
            <li>收到邮件后设置新密码</li>
          </ol>
          
          <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0;">
            <strong>提示：</strong>如果您近期已重置过密码，可以忽略此邮件。
          </div>
          
          <p>感谢您的理解与配合！</p>
          
          <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
            StudyHacks 团队<br>
            <a href="https://www.studyhacks.ai">www.studyhacks.ai</a>
          </p>
        </div>
      `;
      
      // 发送邮件
      await resend.sendEmail({
        to: u.email,
        subject: 'StudyHacks 系统升级通知 - 需要重置密码',
        html: emailContent,
      });
      
      console.log(`✅ 已发送给: ${u.email}`);
      successCount++;
      
      // 避免发送过快
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (error) {
      console.error(`❌ 发送失败: ${u.email}`, error);
      failCount++;
    }
  }
  
  console.log(`\n📊 发送完成:`);
  console.log(`   成功: ${successCount}`);
  console.log(`   失败: ${failCount}`);
  */
  
  console.log('\n💡 提示: 如需实际发送邮件，请编辑此脚本，取消注释发送代码部分');
}

notifyUsers()
  .catch(console.error)
  .finally(() => process.exit(0));


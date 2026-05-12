import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { db } from '@/core/db';

(async () => {
  console.log('=== 执行修复 SQL ===\n');
  
  // 1. 修复订阅状态
  console.log('1. 修复订阅状态...');
  await db().execute(sql`
    UPDATE subscription 
    SET status = 'active', updated_at = NOW() 
    WHERE subscription_no = '81053737789926972'
  `);
  console.log('   ✅ done\n');
  
  // 2. 补发第2月积分
  console.log('2. 补发第2月积分...');
  await db().execute(sql`
    INSERT INTO credit (id, user_id, user_email, subscription_no, transaction_no, transaction_type, transaction_scene, credits, remaining_credits, description, metadata, expires_at, status, created_at, updated_at)
    VALUES (
      gen_random_uuid()::text,
      '4457cd5e-5629-4f79-b094-ada6862f9f7a',
      'm15316000028@163.com',
      '81053737789926972',
      gen_random_uuid()::text,
      'grant',
      'subscription',
      2000,
      2000,
      'Subscription credits - month 2 of subscription (StudyHacks Pro Yearly)',
      '{"monthNumber":2,"cycleStart":"2026-04-09T00:05:01.934Z"}',
      NOW() + interval '30 days',
      'active',
      NOW(),
      NOW()
    )
  `);
  console.log('   ✅ done\n');
  
  // 3. 验证
  console.log('3. 验证...');
  const subResult = await db().execute(sql`SELECT status FROM subscription WHERE subscription_no = '81053737789926972'`);
  console.log('   订阅状态:', subResult.rows[0]?.status);
  
  const creditResult = await db().execute(sql`SELECT COUNT(*) as cnt FROM credit WHERE user_id = '4457cd5e-5629-4f79-b094-ada6862f9f7a' AND transaction_type = 'grant'`);
  console.log('   GRANT积分:', creditResult.rows[0]?.cnt);
  
  console.log('\n=== 完成 ===');
})();

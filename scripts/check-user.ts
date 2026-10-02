import 'dotenv/config';
import { db } from '@/core/db';
import { sql } from 'drizzle-orm';
import { user as userTable } from '@/config/db/schema';

async function main() {
  const database = db();

  const userId = '8c7b6d34-b9a7-422b-b15b-195f00bec8cb';

  // 找 grant 类型的积分记录（发放的积分）
  console.log('=== 积分发放记录 (grant) ===');
  const credits = await database.execute(sql`
    SELECT id, credits, remaining_credits, expires_at, created_at, subscription_no, description
    FROM credit
    WHERE user_id = ${userId} AND transaction_type = 'grant'
    ORDER BY created_at DESC
  `);
  console.dir(credits, { depth: null });
}

main();
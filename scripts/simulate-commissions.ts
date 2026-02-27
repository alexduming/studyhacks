/**
 * 模拟佣金数据脚本
 * 为 duming243@hotmail.com 创建5条佣金记录用于测试提现功能
 *
 * 运行方式: npx tsx scripts/simulate-commissions.ts
 */

import 'dotenv/config';
import { db } from '../src/core/db';
import { user, commission, order } from '../src/config/db/schema';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';

async function main() {
  const targetEmail = 'duming243@hotmail.com';

  // 查找用户
  const [targetUser] = await db()
    .select()
    .from(user)
    .where(eq(user.email, targetEmail));

  if (!targetUser) {
    console.error(`用户 ${targetEmail} 不存在`);
    process.exit(1);
  }

  console.log(`找到用户: ${targetUser.email} (ID: ${targetUser.id})`);

  // 模拟订单和佣金数据
  const testData = [
    { orderAmount: 2990, commissionAmount: 299, desc: '用户 test1@example.com 购买月度会员' },
    { orderAmount: 5990, commissionAmount: 599, desc: '用户 test2@example.com 购买季度会员' },
    { orderAmount: 11990, commissionAmount: 1199, desc: '用户 test3@example.com 购买年度会员' },
    { orderAmount: 2990, commissionAmount: 299, desc: '用户 test4@example.com 购买月度会员' },
    { orderAmount: 8990, commissionAmount: 899, desc: '用户 test5@example.com 购买积分包' },
  ];

  for (const data of testData) {
    const orderId = nanoid();
    const commissionId = nanoid();
    const orderNo = `TEST${Date.now()}${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

    // 创建模拟订单
    await db().insert(order).values({
      id: orderId,
      orderNo: orderNo,
      userId: targetUser.id, // 使用同一用户作为订单用户（简化测试）
      referrerId: targetUser.id, // 推荐人是自己（模拟数据）
      amount: data.orderAmount,
      currency: 'USD',
      status: 'paid',
      paymentProvider: 'test',
      productId: 'test_product',
      productName: 'Test Product',
      checkoutInfo: '{}', // 必填字段
    });

    // 创建佣金记录
    await db().insert(commission).values({
      id: commissionId,
      userId: targetUser.id,
      orderId: orderId,
      amount: data.commissionAmount,
      currency: 'USD',
      rate: '10%',
      status: 'paid',
      description: data.desc,
    });

    console.log(`创建佣金记录: ${data.desc} - $${(data.commissionAmount / 100).toFixed(2)}`);
  }

  // 计算总佣金
  const totalAmount = testData.reduce((sum, d) => sum + d.commissionAmount, 0);
  console.log(`\n总计创建 ${testData.length} 条佣金记录`);
  console.log(`总佣金金额: $${(totalAmount / 100).toFixed(2)}`);

  process.exit(0);
}

main().catch((error) => {
  console.error('执行失败:', error);
  process.exit(1);
});

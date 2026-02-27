/**
 * 清空数据库中的 Stripe 配置
 * 
 * 用途：当 Vercel 环境变量中设置了生产密钥，但数据库中还保存着测试密钥时，
 *      需要清空数据库配置，让环境变量生效
 * 
 * 运行方法：
 *   npx tsx scripts/clear-stripe-from-db.ts
 */

import { eq, inArray } from 'drizzle-orm';
import { db } from '@/core/db';
import { systemConfig } from '@/config/db/schema';

async function clearStripeConfig() {
  console.log('🔍 开始清理数据库中的 Stripe 配置...\n');

  try {
    // 需要清理的 Stripe 相关配置项
    const stripeConfigKeys = [
      'stripe_enabled',
      'stripe_publishable_key',
      'stripe_secret_key',
      'stripe_signing_secret',
      'stripe_payment_methods',
    ];

    // 先查询现有配置
    console.log('📋 当前数据库中的 Stripe 配置：');
    const existingConfigs = await db()
      .select()
      .from(systemConfig)
      .where(inArray(systemConfig.name, stripeConfigKeys));

    if (existingConfigs.length === 0) {
      console.log('  ✓ 数据库中没有 Stripe 配置（已经清理过或从未设置）\n');
      console.log('✅ 无需清理，环境变量中的生产密钥应该已经生效');
      return;
    }

    for (const cfg of existingConfigs) {
      // 隐藏敏感信息
      let displayValue = cfg.value || '';
      if (cfg.name.includes('key') || cfg.name.includes('secret')) {
        if (displayValue.length > 10) {
          displayValue = displayValue.substring(0, 10) + '...';
        }
      }
      console.log(`  - ${cfg.name}: ${displayValue}`);
    }

    console.log('\n🗑️  正在删除这些配置...');

    // 删除所有 Stripe 配置
    const result = await db()
      .delete(systemConfig)
      .where(inArray(systemConfig.name, stripeConfigKeys))
      .returning();

    console.log(`  ✓ 成功删除 ${result.length} 个配置项\n`);

    console.log('✅ 清理完成！');
    console.log('\n📝 下一步操作：');
    console.log('  1. 确认 Vercel 环境变量中已设置生产密钥：');
    console.log('     - STRIPE_ENABLED=true');
    console.log('     - STRIPE_PUBLISHABLE_KEY=pk_live_...');
    console.log('     - STRIPE_SECRET_KEY=sk_live_...');
    console.log('     - STRIPE_SIGNING_SECRET=whsec_...');
    console.log('  2. 在 Vercel 控制台触发重新部署');
    console.log('  3. 测试支付功能，确认链接不再包含 cs_test_ 前缀');

  } catch (error) {
    console.error('❌ 清理失败：', error);
    throw error;
  }
}

// 执行清理
clearStripeConfig()
  .then(() => {
    console.log('\n✨ 脚本执行完成');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 脚本执行失败：', error);
    process.exit(1);
  });


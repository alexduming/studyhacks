/**
 * 验证生产环境是否使用了正确的密钥
 * 
 * 用途：在部署到生产环境前，检查是否误用了测试密钥
 * 
 * 运行方法：
 *   npx tsx scripts/verify-production-keys.ts
 * 
 * 可以添加到 CI/CD 流程中：
 *   "scripts": {
 *     "verify:keys": "tsx scripts/verify-production-keys.ts"
 *   }
 */

async function verifyProductionKeys() {
  console.log('🔐 验证生产密钥配置...\n');

  const errors: string[] = [];
  const warnings: string[] = [];

  // 检查是否在生产环境
  const isProduction = process.env.NODE_ENV === 'production' || 
                       process.env.VERCEL_ENV === 'production';

  if (!isProduction) {
    console.log('ℹ️  当前不是生产环境，跳过严格检查\n');
  }

  // ====== Stripe 配置检查 ======
  const stripeEnabled = process.env.STRIPE_ENABLED === 'true';
  const stripePublishableKey = process.env.STRIPE_PUBLISHABLE_KEY || '';
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY || '';
  const stripeSigningSecret = process.env.STRIPE_SIGNING_SECRET || '';

  if (stripeEnabled) {
    console.log('📋 Stripe 配置检查：');

    // 检查 Publishable Key
    if (!stripePublishableKey) {
      errors.push('❌ STRIPE_PUBLISHABLE_KEY 未设置');
    } else if (stripePublishableKey.startsWith('pk_test_')) {
      if (isProduction) {
        errors.push('❌ 生产环境不应使用 Stripe 测试密钥 (pk_test_)');
      } else {
        warnings.push('⚠️  当前使用 Stripe 测试密钥 (pk_test_)');
      }
      console.log(`  - Publishable Key: pk_test_... (测试模式) ⚠️`);
    } else if (stripePublishableKey.startsWith('pk_live_')) {
      console.log(`  - Publishable Key: pk_live_... (生产模式) ✅`);
    } else {
      warnings.push('⚠️  STRIPE_PUBLISHABLE_KEY 格式异常');
      console.log(`  - Publishable Key: 格式异常 ⚠️`);
    }

    // 检查 Secret Key
    if (!stripeSecretKey) {
      errors.push('❌ STRIPE_SECRET_KEY 未设置');
    } else if (stripeSecretKey.startsWith('sk_test_')) {
      if (isProduction) {
        errors.push('❌ 生产环境不应使用 Stripe 测试密钥 (sk_test_)');
      } else {
        warnings.push('⚠️  当前使用 Stripe 测试密钥 (sk_test_)');
      }
      console.log(`  - Secret Key: sk_test_... (测试模式) ⚠️`);
    } else if (stripeSecretKey.startsWith('sk_live_')) {
      console.log(`  - Secret Key: sk_live_... (生产模式) ✅`);
    } else {
      warnings.push('⚠️  STRIPE_SECRET_KEY 格式异常');
      console.log(`  - Secret Key: 格式异常 ⚠️`);
    }

    // 检查 Webhook Secret
    if (!stripeSigningSecret) {
      warnings.push('⚠️  STRIPE_SIGNING_SECRET 未设置（Webhook 将无法验证）');
      console.log(`  - Signing Secret: 未设置 ⚠️`);
    } else if (stripeSigningSecret.startsWith('whsec_')) {
      console.log(`  - Signing Secret: whsec_... ✅`);
    } else {
      warnings.push('⚠️  STRIPE_SIGNING_SECRET 格式异常');
      console.log(`  - Signing Secret: 格式异常 ⚠️`);
    }

    // 检查密钥一致性
    const publishableIsTest = stripePublishableKey.startsWith('pk_test_');
    const secretIsTest = stripeSecretKey.startsWith('sk_test_');

    if (publishableIsTest !== secretIsTest) {
      errors.push('❌ Stripe Publishable Key 和 Secret Key 模式不匹配（一个是测试密钥，一个是生产密钥）');
      console.log(`  - 密钥一致性检查: 失败 ❌`);
    } else {
      console.log(`  - 密钥一致性检查: 通过 ✅`);
    }

    console.log('');
  } else {
    console.log('ℹ️  Stripe 未启用\n');
  }

  // ====== PayPal 配置检查 ======
  const paypalEnabled = process.env.PAYPAL_ENABLED === 'true';
  const paypalEnvironment = process.env.PAYPAL_ENVIRONMENT || '';

  if (paypalEnabled) {
    console.log('📋 PayPal 配置检查：');

    if (isProduction && paypalEnvironment !== 'production') {
      errors.push('❌ 生产环境应设置 PAYPAL_ENVIRONMENT=production');
      console.log(`  - Environment: ${paypalEnvironment || '未设置'} ❌`);
    } else {
      console.log(`  - Environment: ${paypalEnvironment || '未设置'} ✅`);
    }

    console.log('');
  } else {
    console.log('ℹ️  PayPal 未启用\n');
  }

  // ====== Creem 配置检查 ======
  const creemEnabled = process.env.CREEM_ENABLED === 'true';
  const creemEnvironment = process.env.CREEM_ENVIRONMENT || '';

  if (creemEnabled) {
    console.log('📋 Creem 配置检查：');

    if (isProduction && creemEnvironment !== 'production') {
      errors.push('❌ 生产环境应设置 CREEM_ENVIRONMENT=production');
      console.log(`  - Environment: ${creemEnvironment || '未设置'} ❌`);
    } else {
      console.log(`  - Environment: ${creemEnvironment || '未设置'} ✅`);
    }

    console.log('');
  } else {
    console.log('ℹ️  Creem 未启用\n');
  }

  // ====== 输出检查结果 ======
  console.log('═══════════════════════════════════════');

  if (errors.length > 0) {
    console.log('\n❌ 发现 ' + errors.length + ' 个错误：');
    errors.forEach(err => console.log('  ' + err));
  }

  if (warnings.length > 0) {
    console.log('\n⚠️  发现 ' + warnings.length + ' 个警告：');
    warnings.forEach(warn => console.log('  ' + warn));
  }

  if (errors.length === 0 && warnings.length === 0) {
    console.log('\n✅ 所有检查通过！');
  }

  console.log('\n═══════════════════════════════════════\n');

  // 如果是生产环境且有错误，返回非零退出码
  if (isProduction && errors.length > 0) {
    console.error('💥 生产环境密钥配置有误，请修复后再部署！');
    process.exit(1);
  }

  if (!isProduction && (errors.length > 0 || warnings.length > 0)) {
    console.log('ℹ️  开发环境发现问题，但不影响继续运行');
  }
}

// 执行验证
verifyProductionKeys()
  .then(() => {
    console.log('✨ 验证完成');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 验证失败：', error);
    process.exit(1);
  });


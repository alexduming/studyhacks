/**
 * 测试 better-auth 的密码 hash 和 verify 是否能正确配对
 */

import { hashPassword, verifyPassword } from 'better-auth/crypto';

async function testPasswordFlow() {
  const testPassword = 'Test123456!';
  
  console.log('🧪 测试 better-auth/crypto 的密码处理流程\n');
  
  // 1. 生成哈希（模拟注册）
  console.log('1️⃣ 生成密码哈希...');
  const hashedPassword = await hashPassword(testPassword);
  console.log(`   原始密码: ${testPassword}`);
  console.log(`   生成哈希: ${hashedPassword}`);
  console.log(`   哈希长度: ${hashedPassword.length}`);
  console.log(`   哈希前缀: ${hashedPassword.substring(0, 10)}...`);
  
  // 2. 验证密码（模拟登录）
  console.log('\n2️⃣ 验证密码...');
  
  // 正确密码
  const correctResult = await verifyPassword({
    password: testPassword,
    hash: hashedPassword,
  });
  console.log(`   正确密码验证: ${correctResult ? '✅ 通过' : '❌ 失败'}`);
  
  // 错误密码
  const wrongResult = await verifyPassword({
    password: 'WrongPassword123',
    hash: hashedPassword,
  });
  console.log(`   错误密码验证: ${wrongResult ? '❌ 不应该通过' : '✅ 正确拒绝'}`);
  
  // 3. 测试多次生成的哈希是否不同（salt 测试）
  console.log('\n3️⃣ 测试 salt 随机性...');
  const hash1 = await hashPassword(testPassword);
  const hash2 = await hashPassword(testPassword);
  console.log(`   哈希1: ${hash1.substring(0, 20)}...`);
  console.log(`   哈希2: ${hash2.substring(0, 20)}...`);
  console.log(`   两次哈希不同: ${hash1 !== hash2 ? '✅ 是（正常）' : '❌ 否（异常）'}`);
  
  // 4. 测试两个哈希都能验证原密码
  const verify1 = await verifyPassword({ password: testPassword, hash: hash1 });
  const verify2 = await verifyPassword({ password: testPassword, hash: hash2 });
  console.log(`   两个哈希都能验证原密码: ${verify1 && verify2 ? '✅ 是' : '❌ 否'}`);
  
  console.log('\n✅ 测试完成');
  
  if (correctResult && !wrongResult && hash1 !== hash2 && verify1 && verify2) {
    console.log('\n📊 结论: better-auth 的 hashPassword 和 verifyPassword 工作正常');
    console.log('   如果注册和登录都用这套函数，应该能正常工作');
  } else {
    console.log('\n⚠️  警告: 发现异常，可能有问题');
  }
}

testPasswordFlow().catch(console.error);



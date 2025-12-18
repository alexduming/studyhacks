import { db } from '../src/core/db';
import { config } from '../src/config/db/schema';
import { eq, inArray } from 'drizzle-orm';
import { envConfigs } from '../src/config';

async function main() {
  console.log('🔄 开始修复数据库配置...');
  
  // 目标值
  const targetUrl = 'https://www.studyhacks.ai';
  const configKeys = ['auth_url', 'app_url'];
  
  console.log(`目标 URL: ${targetUrl}`);
  
  try {
    // 1. 查询当前值
    const currentConfigs = await db()
      .select()
      .from(config)
      .where(inArray(config.name, configKeys));
      
    console.log('当前数据库中的配置:');
    currentConfigs.forEach(c => {
      console.log(`- ${c.name}: ${c.value}`);
    });

    // 2. 更新配置
    console.log('\n正在更新配置...');
    
    for (const key of configKeys) {
      await db()
        .insert(config)
        .values({
          name: key,
          value: targetUrl
        })
        .onConflictDoUpdate({
          target: config.name,
          set: { value: targetUrl }
        });
      
      console.log(`✅ 已更新 ${key} -> ${targetUrl}`);
    }
    
    console.log('\n✨ 修复完成！');
    process.exit(0);
    
  } catch (error) {
    console.error('❌ 修复失败:', error);
    process.exit(1);
  }
}

main();


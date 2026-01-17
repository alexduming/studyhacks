import postgres from 'postgres';
import { envConfigs } from '@/config';

async function runMigration() {
  const databaseUrl = envConfigs.database_url;

  if (!databaseUrl) {
    console.error('❌ DATABASE_URL 环境变量未设置');
    process.exit(1);
  }

  console.log('🚀 开始执行 email_verification 表迁移...');
  console.log('📡 连接到数据库...');

  const sql = postgres(databaseUrl, {
    max: 1,
    idle_timeout: 20,
    connect_timeout: 10,
  });

  try {
    // 检查列是否存在
    const columns = await sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'email_verification' 
      AND column_name = 'invite_code'
    `;

    if (columns.length === 0) {
      console.log('📝 添加 invite_code 列...');
      await sql`
        ALTER TABLE "email_verification" 
        ADD COLUMN "invite_code" text
      `;
      console.log('✅ 列添加成功！');
    } else {
      console.log('⚠️ invite_code 列已存在，跳过。');
    }

  } catch (error: any) {
    console.error('❌ 迁移执行失败:', error.message);
    console.error('详细错误:', error);
    process.exit(1);
  } finally {
    await sql.end();
    console.log('🔌 数据库连接已关闭');
  }
}

runMigration()
  .then(() => {
    console.log('🎉 迁移完成！');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ 迁移过程中发生错误:', error);
    process.exit(1);
  });


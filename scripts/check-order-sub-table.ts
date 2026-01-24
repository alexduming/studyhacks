import { sql } from 'drizzle-orm';
import { db } from '@/core/db';

async function main() {
  console.log('Checking order and subscription table structure...\n');

  try {
    console.log('--- Order Table ---');
    const orderResult = await db().execute(sql`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'order'
      ORDER BY ordinal_position;
    `);
    orderResult.forEach((row: any) => {
      console.log(`- ${row.column_name}: ${row.data_type}`);
    });

    console.log('\n--- Subscription Table ---');
    const subResult = await db().execute(sql`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'subscription'
      ORDER BY ordinal_position;
    `);
    subResult.forEach((row: any) => {
      console.log(`- ${row.column_name}: ${row.data_type}`);
    });

  } catch (e) {
    console.error('Check failed:', e);
  } finally {
    process.exit(0);
  }
}

main();


import { sql } from 'drizzle-orm';
import { db } from '@/core/db';

async function main() {
  console.log('Checking taxonomy table structure...\n');

  try {
    const result = await db().execute(sql`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'taxonomy'
      ORDER BY ordinal_position;
    `);

    result.forEach((row: any) => {
      console.log(`- ${row.column_name}: ${row.data_type}`);
    });

  } catch (e) {
    console.error('Check failed:', e);
  } finally {
    process.exit(0);
  }
}

main();


import { sql } from 'drizzle-orm';
import { db } from '@/core/db';
import * as schema from '@/config/db/schema';

async function main() {
  console.log('Comparing Schema definition with Database tables...\n');

  try {
    // 1. Get all tables from Database
    const dbTablesResult = await db().execute(sql`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public'
      ORDER BY tablename;
    `);
    
    const dbTables = dbTablesResult.map((r: any) => r.tablename);
    console.log('Database Tables:', dbTables);

    // 2. Get all tables from Schema
    // Drizzle schema export keys that are pgTable instances
    const schemaTables = Object.entries(schema)
      .filter(([_, value]) => (value as any)?.[Symbol.for('drizzle:OriginalName')]) // Filter pgTable instances
      .map(([key, value]) => {
         // Get the actual table name defined in pgTable('name', ...)
         return (value as any)[Symbol.for('drizzle:Name')];
      });
      
    console.log('Schema Tables:  ', schemaTables.sort());

    // 3. Find missing tables
    const missingInSchema = dbTables.filter(t => !schemaTables.includes(t));
    const missingInDb = schemaTables.filter(t => !dbTables.includes(t));

    if (missingInSchema.length > 0) {
      console.log('\n❌ MISSING IN SCHEMA (Defined in DB but not in Schema code):');
      missingInSchema.forEach(t => console.log(`   - ${t}`));
    } else {
      console.log('\n✅ No tables missing in Schema.');
    }

    if (missingInDb.length > 0) {
      console.log('\n⚠️ MISSING IN DB (Defined in Schema code but not in DB):');
      missingInDb.forEach(t => console.log(`   - ${t}`));
    }

  } catch (e) {
    console.error('Check failed:', e);
  } finally {
    process.exit(0);
  }
}

main();


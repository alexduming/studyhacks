import { sql } from 'drizzle-orm';
import { db } from '@/core/db';

async function main() {
  console.log('🚀 Starting schema fix for account and user tables...\n');

  const database = db();

  try {
    // 1. Fix account table
    console.log('Checking "account" table...');
    
    // Check if updated_at has default value
    const accountUpdatedAtDefault = await database.execute(sql`
      SELECT column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' 
        AND table_name = 'account' 
        AND column_name = 'updated_at';
    `);

    const updatedDefault = accountUpdatedAtDefault[0]?.column_default;
    console.log(`Current default for account.updated_at: ${updatedDefault}`);

    if (!updatedDefault) {
      console.log('⚠️ Missing DEFAULT for account.updated_at. Fixing...');
      await database.execute(sql`ALTER TABLE "account" ALTER COLUMN "updated_at" SET DEFAULT now();`);
      console.log('✅ Fixed: account.updated_at now has DEFAULT now()');
    } else {
      console.log('✅ account.updated_at already has a default value.');
    }

    // Check if created_at has default value
    const accountCreatedAtDefault = await database.execute(sql`
      SELECT column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' 
        AND table_name = 'account' 
        AND column_name = 'created_at';
    `);

    const createdDefault = accountCreatedAtDefault[0]?.column_default;
    console.log(`Current default for account.created_at: ${createdDefault}`);

    if (!createdDefault) {
      console.log('⚠️ Missing DEFAULT for account.created_at. Fixing...');
      await database.execute(sql`ALTER TABLE "account" ALTER COLUMN "created_at" SET DEFAULT now();`);
      console.log('✅ Fixed: account.created_at now has DEFAULT now()');
    } else {
      console.log('✅ account.created_at already has a default value.');
    }

    // 2. Fix user table (just in case)
    console.log('\nChecking "user" table...');

    // Check updated_at
    const userUpdatedAtDefault = await database.execute(sql`
      SELECT column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' 
        AND table_name = 'user' 
        AND column_name = 'updated_at';
    `);

    const userUpdatedDefault = userUpdatedAtDefault[0]?.column_default;
    if (!userUpdatedDefault) {
        console.log('⚠️ Missing DEFAULT for user.updated_at. Fixing...');
        await database.execute(sql`ALTER TABLE "user" ALTER COLUMN "updated_at" SET DEFAULT now();`);
        console.log('✅ Fixed: user.updated_at now has DEFAULT now()');
    } else {
        console.log('✅ user.updated_at already has a default value.');
    }

    // Check created_at
    const userCreatedAtDefault = await database.execute(sql`
      SELECT column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' 
        AND table_name = 'user' 
        AND column_name = 'created_at';
    `);

    const userCreatedDefault = userCreatedAtDefault[0]?.column_default;
    if (!userCreatedDefault) {
        console.log('⚠️ Missing DEFAULT for user.created_at. Fixing...');
        await database.execute(sql`ALTER TABLE "user" ALTER COLUMN "created_at" SET DEFAULT now();`);
        console.log('✅ Fixed: user.created_at now has DEFAULT now()');
    } else {
        console.log('✅ user.created_at already has a default value.');
    }

    console.log('\n✨ Schema fix completed successfully.');

  } catch (error) {
    console.error('❌ Error fixing schema:', error);
  } finally {
    process.exit(0);
  }
}

main();


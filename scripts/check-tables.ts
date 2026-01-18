import { db } from '../src/core/db';
import { aiTask, credit, presentation } from '../src/config/db/schema';
import { eq, desc } from 'drizzle-orm';

async function main() {
  console.log('--- AI Task Table Sample ---');
  const tasks = await db().select().from(aiTask).limit(5);
  console.log(JSON.stringify(tasks, null, 2));

  console.log('\n--- Presentation Table Sample ---');
  const presentations = await db().select().from(presentation).limit(5);
  console.log(JSON.stringify(presentations, null, 2));

  console.log('\n--- Credit Table Sample (ai_ppt scene) ---');
  const pptCredits = await db()
    .select()
    .from(credit)
    .where(eq(credit.transactionScene, 'ai_ppt'))
    .limit(5);
  console.log(JSON.stringify(pptCredits, null, 2));
}

main().catch(console.error);



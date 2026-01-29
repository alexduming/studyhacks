import { db } from '../src/core/db';
import { aiTask, credit, presentation } from '../src/config/db/schema';
import { eq, desc, isNotNull } from 'drizzle-orm';

async function main() {
  const tasksWithCredit = await db()
    .select({
      id: aiTask.id,
      creditId: aiTask.creditId,
    })
    .from(aiTask)
    .where(isNotNull(aiTask.creditId))
    .limit(5);
  
  console.log('AI Tasks with creditId:', JSON.stringify(tasksWithCredit, null, 2));

  const totalTasks = await db().select().from(aiTask);
  console.log('Total AI Tasks:', totalTasks.length);

  const pptCredits = await db()
    .select({
      id: credit.id,
      transactionNo: credit.transactionNo,
      scene: credit.transactionScene,
    })
    .from(credit)
    .where(eq(credit.transactionScene, 'ai_ppt'))
    .limit(5);
  console.log('PPT Credits Sample:', JSON.stringify(pptCredits, null, 2));
}

main().catch(console.error);







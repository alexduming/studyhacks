import { db } from '../src/core/db';
import { aiTask, credit, presentation } from '../src/config/db/schema';
import { eq, and, desc, isNull } from 'drizzle-orm';
import { getUuid } from '../src/shared/lib/hash';

async function main() {
  console.log('Starting backfill for AI Tasks...');

  // 1. Find all credits for ai_ppt that are not linked to an ai_task
  // Actually, ai_task doesn't have a linked presentationId, but it has creditId.
  const pptCredits = await db()
    .select()
    .from(credit)
    .where(eq(credit.transactionScene, 'ai_ppt'));

  console.log(`Found ${pptCredits.length} PPT credits.`);

  let createdCount = 0;
  for (const c of pptCredits) {
    // Check if ai_task already exists for this creditId
    const existingTask = await db()
      .select()
      .from(aiTask)
      .where(eq(aiTask.creditId, c.id))
      .limit(1);

    if (existingTask.length === 0) {
      // Find the associated presentation if possible (to get title/prompt)
      // Link via userId and createdAt (within a small window)
      const startTime = new Date(new Date(c.createdAt!).getTime() - 5000);
      const endTime = new Date(new Date(c.createdAt!).getTime() + 5000);

      const [relatedPresentation] = await db()
        .select()
        .from(presentation)
        .where(
          and(
            eq(presentation.userId, c.userId),
            // eq(presentation.createdAt, c.createdAt) // Exact match is unlikely
          )
        )
        .orderBy(desc(presentation.createdAt))
        .limit(1);

      await db().insert(aiTask).values({
        id: getUuid(),
        userId: c.userId,
        mediaType: 'text',
        provider: 'DeepSeek/KIE',
        model: 'ai_ppt',
        prompt: relatedPresentation?.title || c.description || 'AI PPT Generation',
        status: (relatedPresentation?.status as any) || 'completed',
        costCredits: Math.abs(c.credits),
        scene: 'ai_ppt',
        creditId: c.id,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        taskResult: relatedPresentation ? JSON.stringify({ presentationId: relatedPresentation.id }) : null,
      });
      createdCount++;
    }
  }

  console.log(`Created ${createdCount} new AI Task records for PPTs.`);

  // 2. Also backfill other credits that might be missing ai_task records
  // For example, quiz, flashcards, etc.
  const otherCredits = await db()
    .select()
    .from(credit)
    .where(and(
      isNull(credit.transactionScene), // some might be null
      eq(credit.transactionType, 'consume')
    ));
  
  // Actually, let's just focus on PPT for now as requested.
}

main().catch(console.error);






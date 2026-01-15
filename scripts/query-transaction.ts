import { db } from '../src/core/db';
import { credit, presentation, user } from '../src/config/db/schema';
import { eq, desc } from 'drizzle-orm';

async function main() {
  const transactionNo = process.argv[2];
  if (!transactionNo) {
    console.log('Usage: npx tsx scripts/query-transaction.ts <TransactionNo>');
    return;
  }

  console.log(`\n🔍 Querying Transaction No: ${transactionNo}\n`);

  // 1. Find the credit record
  const [creditRecord] = await db()
    .select()
    .from(credit)
    .where(eq(credit.transactionNo, transactionNo))
    .limit(1);

  if (!creditRecord) {
    console.log('❌ No credit transaction found with this number.');
    return;
  }

  // 2. Find the user
  const [userInfo] = await db()
    .select()
    .from(user)
    .where(eq(user.id, creditRecord.userId))
    .limit(1);

  console.log('👤 User Information:');
  console.log(`- ID: ${creditRecord.userId}`);
  console.log(`- Name: ${userInfo?.name || 'Unknown'}`);
  console.log(`- Email: ${userInfo?.email || 'Unknown'}`);
  console.log('');

  console.log('💰 Transaction Details:');
  console.log(`- Type: ${creditRecord.transactionType}`);
  console.log(`- Scene: ${creditRecord.transactionScene}`);
  console.log(`- Credits: ${creditRecord.credits}`);
  console.log(`- Description: ${creditRecord.description}`);
  console.log(`- Created At: ${creditRecord.createdAt}`);
  console.log(`- Metadata: ${creditRecord.metadata}`);
  console.log('');

  // 3. Find related presentations around that time
  const startTime = new Date(new Date(creditRecord.createdAt!).getTime() - 60000); // 1 min before
  const endTime = new Date(new Date(creditRecord.createdAt!).getTime() + 600000); // 10 mins after

  const relatedPresentations = await db()
    .select()
    .from(presentation)
    .where(eq(presentation.userId, creditRecord.userId))
    .orderBy(desc(presentation.createdAt))
    .limit(5);

  console.log('📊 Recent Presentations for this user:');
  if (relatedPresentations.length === 0) {
    console.log('  No presentations found.');
  } else {
    relatedPresentations.forEach(p => {
      const isRelated = p.createdAt! >= startTime && p.createdAt! <= endTime;
      console.log(`${isRelated ? '👉' : '  '} [${p.status}] ${p.title} (${p.id})`);
      console.log(`     Created: ${p.createdAt}`);
      if (isRelated && p.status === 'failed') {
        console.log(`     ⚠️  This presentation failed and might be the cause.`);
        try {
           const slides = JSON.parse(p.content || '[]');
           const failedSlides = slides.filter((s: any) => s.status === 'failed');
           console.log(`     Failed slides: ${failedSlides.length}/${slides.length}`);
        } catch (e) {}
      }
    });
  }
  console.log('');
}

main().catch(console.error);


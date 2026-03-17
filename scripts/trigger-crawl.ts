import { Queue } from 'bullmq';
import { getRedis } from '../apps/webhook/src/queue/redis';

const KB_ID = '88b07b02-4e34-46ac-85f8-479e66fe7ace';
const VERSIONS = ['1'];

async function main() {
  const queue = new Queue('crawl', {
    connection: getRedis(),
    defaultJobOptions: { attempts: 2, removeOnComplete: 20, removeOnFail: 20 },
  });

  const job = await queue.add('crawl-eximpe', {
    knowledgeBaseId: KB_ID,
    versions: VERSIONS,
  });

  console.log(`✅ Crawl job enqueued: ${job.id}`);
  console.log(`   KB: ${KB_ID}`);
  console.log(`   Versions: ${VERSIONS.join(', ')}`);
  console.log(`   Pages: 55 total`);
  await queue.close();
}

main().catch((err) => { console.error(err); process.exit(1); });

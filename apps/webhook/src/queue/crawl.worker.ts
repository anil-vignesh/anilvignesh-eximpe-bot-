import 'dotenv/config';
import { Worker, Job, Queue } from 'bullmq';
import { db } from '@eximpe-bot/shared';
import { enqueueIngestion } from './ingestion.queue';
import { getRedis } from './redis';

export interface CrawlJobData {
  knowledgeBaseId: string;
  versions:        string[];  // e.g. ['1']
}

// ── Docs page list ────────────────────────────────────────────────────────────

const INTEGRATION_GUIDE_PAGES = [
  '/getting-started/introduction',
  '/getting-started/steps-to-integrate',
  '/getting-started/register-merchant',
  '/getting-started/test-credentials',
  '/getting-started/account-activation',
  '/getting-started/adding-merchants',
  '/getting-started/faqs',
  '/web-integration/hosted-checkout',
  '/web-integration/payment-links',
  '/web-integration/bin-lookup',
  '/web-integration/subscriptions',
  '/web-integration/webhooks',
  '/web-integration/test-data',
];

const API_REFERENCE_PAGES = [
  '/order/create',
  '/order/get-status',
  '/order/get',
  '/order/update_order',
  '/order/invoice_upload',
  '/payment/list',
  '/payment/get',
  '/card-tokens/save',
  '/card-tokens/list',
  '/card-tokens/delete',
  '/merchant/create',
  '/merchant/list',
  '/merchant/get',
  '/merchant/update',
  '/settlement/list',
  '/settlement/get',
  '/refunds/create',
  '/refunds/list',
  '/refunds/get',
  '/subscriptions/create-intent',
  '/subscriptions/create-card',
  '/subscriptions/get',
  '/subscriptions/modify-mandate',
  '/subscriptions/mandate-status',
  '/subscriptions/cancel-mandate',
  '/subscriptions/pre-debit-notification',
  '/subscriptions/recurring-payment',
  '/payment-link/create',
  '/payment-link/list',
  '/payment-link/retrieve',
  '/payment-link/extend-expiry',
  '/payment-link/deactivate',
  '/payment-link/share',
  '/bin-lookup/lookup',
  '/webhooks/merchant-approved',
  '/webhooks/payment-successful',
  '/webhooks/payment-failed',
  '/webhooks/payment-refunded',
  '/webhooks/payment-settled',
  '/webhooks/subscription-status',
];

const ALL_PAGES = [...INTEGRATION_GUIDE_PAGES, ...API_REFERENCE_PAGES];
const BASE_URL = 'https://docs.eximpe.com';

function buildPageUrl(version: string, pagePath: string): string {
  // e.g. https://docs.eximpe.com/integration-guide/v1/getting-started/introduction
  const section = INTEGRATION_GUIDE_PAGES.includes(pagePath)
    ? 'integration-guide'
    : 'api-reference';
  return `${BASE_URL}/${section}/v${version}${pagePath}`;
}

// ── Job handler ───────────────────────────────────────────────────────────────

async function processCrawlJob(job: Job<CrawlJobData>): Promise<void> {
  const { knowledgeBaseId, versions } = job.data;

  let enqueued = 0;
  const total = ALL_PAGES.length * versions.length;

  for (const version of versions) {
    for (const pagePath of ALL_PAGES) {
      const url = buildPageUrl(version, pagePath);
      const pageName = pagePath.split('/').filter(Boolean).join(' / ');

      // Check if already indexed — re-index in place if so
      const { data: existing } = await db
        .from('documents')
        .select('id')
        .eq('knowledge_base_id', knowledgeBaseId)
        .eq('source_url', url)
        .maybeSingle();

      let documentId: string;

      if (existing) {
        // Re-index: reset status to pending
        await db
          .from('documents')
          .update({ status: 'pending', error_message: null })
          .eq('id', existing.id);
        documentId = existing.id;
      } else {
        // Create new document record
        const { data: doc, error } = await db
          .from('documents')
          .insert({
            knowledge_base_id: knowledgeBaseId,
            name:              `[v${version}] ${pageName}`,
            file_type:         'url',
            source_url:        url,
            api_version:       version,
            status:            'pending',
          })
          .select('id')
          .single();

        if (error || !doc) {
          console.error(`[crawl] Failed to create doc for ${url}:`, error?.message);
          continue;
        }
        documentId = doc.id;
      }

      await enqueueIngestion(documentId, knowledgeBaseId);
      enqueued++;

      // Report progress
      await job.updateProgress(Math.round((enqueued / total) * 100));
      console.log(`[crawl] Queued ${enqueued}/${total}: ${url}`);
    }
  }

  console.log(`[crawl] ✓ Enqueued ${enqueued} pages for KB ${knowledgeBaseId}`);
}

// ── Worker + queue bootstrap ──────────────────────────────────────────────────

let _crawlQueue: Queue<CrawlJobData> | null = null;

export function getCrawlQueue(): Queue<CrawlJobData> {
  if (!_crawlQueue) {
    _crawlQueue = new Queue<CrawlJobData>('crawl', {
      connection: getRedis(),
      defaultJobOptions: {
        attempts: 2,
        removeOnComplete: 20,
        removeOnFail:     20,
      },
    });
  }
  return _crawlQueue;
}

export async function enqueueCrawl(
  knowledgeBaseId: string,
  versions: string[],
): Promise<void> {
  const queue = getCrawlQueue();
  await queue.add('crawl-eximpe', { knowledgeBaseId, versions });
}

export function startCrawlWorker(): Worker {
  const worker = new Worker<CrawlJobData>(
    'crawl',
    processCrawlJob,
    {
      connection:  getRedis(),
      concurrency: 1, // one crawl job at a time
    },
  );

  worker.on('completed', (job) => {
    console.log(`[crawl] Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[crawl] Job ${job?.id} failed:`, err.message);
  });

  return worker;
}

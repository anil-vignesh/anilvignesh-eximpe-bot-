import { Queue } from 'bullmq';
import { getRedis } from './redis';
import type { IngestionJobData } from './ingestion.worker';

let _queue: Queue<IngestionJobData> | null = null;

export function getIngestionQueue(): Queue<IngestionJobData> {
  if (!_queue) {
    _queue = new Queue<IngestionJobData>('ingestion', {
      connection:   getRedis(),
      defaultJobOptions: {
        attempts:  5,
        // Custom backoff: 2 min base, exponential, with ±30 s jitter so retried jobs
        // don't all collide at the same moment after a Voyage 429 wave.
        backoff: {
          type:  'custom',
          delay: 120_000,
        },
        removeOnComplete: 100,
        removeOnFail:     100,
      },
    });
  }
  return _queue;
}

export async function enqueueIngestion(
  documentId:      string,
  knowledgeBaseId: string,
): Promise<void> {
  const queue = getIngestionQueue();
  await queue.add('ingest', { documentId, knowledgeBaseId });
}

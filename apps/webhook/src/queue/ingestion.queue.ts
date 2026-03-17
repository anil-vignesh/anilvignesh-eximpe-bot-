import { Queue } from 'bullmq';
import { getRedis } from './redis';
import type { IngestionJobData } from './ingestion.worker';

let _queue: Queue<IngestionJobData> | null = null;

export function getIngestionQueue(): Queue<IngestionJobData> {
  if (!_queue) {
    _queue = new Queue<IngestionJobData>('ingestion', {
      connection:   getRedis(),
      defaultJobOptions: {
        attempts:  3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 100,
        removeOnFail:     50,
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

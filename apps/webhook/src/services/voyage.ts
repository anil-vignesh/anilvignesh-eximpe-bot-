import { VoyageAIClient } from 'voyageai';

let _client: VoyageAIClient | null = null;

function getClient(): VoyageAIClient {
  if (!_client) {
    const apiKey = process.env.VOYAGE_API_KEY;
    if (!apiKey) throw new Error('VOYAGE_API_KEY is not set');
    _client = new VoyageAIClient({ apiKey });
  }
  return _client;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Voyage AI free tier: 3 RPM = 1 call per 20 s.
// We enforce a 21 s minimum gap between calls in-process so concurrent BullMQ
// jobs can never trigger back-to-back Voyage requests regardless of concurrency config.
const MIN_CALL_INTERVAL_MS = parseInt(process.env.VOYAGE_BATCH_DELAY_MS ?? '21000', 10);
let _lastCallMs = 0;

async function waitForRateLimit(): Promise<void> {
  const elapsed = Date.now() - _lastCallMs;
  if (elapsed < MIN_CALL_INTERVAL_MS) {
    const wait = MIN_CALL_INTERVAL_MS - elapsed;
    console.log(`[voyage] rate-limit guard — waiting ${wait}ms`);
    await sleep(wait);
  }
  _lastCallMs = Date.now();
}

async function embedWithRetry(
  client: VoyageAIClient,
  input: string[],
): Promise<number[][]> {
  await waitForRateLimit();
  try {
    const result = await client.embed({ input, model: 'voyage-3' });
    return result.data!.map((d) => d.embedding as number[]);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const is429 = msg.includes('429') || msg.toLowerCase().includes('rate limit');
    if (is429) {
      // Force a full interval before the next call (could be this job retrying,
      // or a different job — the global timestamp handles both)
      _lastCallMs = Date.now();
      throw err;
    }
    throw err;
  }
}

/**
 * Embed a single text string. Returns a 1024-dimension vector.
 */
export async function embedText(text: string): Promise<number[]> {
  const client = getClient();
  const result = await embedWithRetry(client, [text]);
  return result[0];
}

/**
 * Embed a batch of texts. Returns one vector per input.
 * Voyage AI supports up to 128 texts per batch.
 * Adds a delay between batches to respect free-tier rate limits (3 RPM).
 */
export async function embedBatch(texts: string[]): Promise<number[][]> {
  const client = getClient();
  const BATCH_SIZE = 128;
  const results: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const embeddings = await embedWithRetry(client, batch);
    results.push(...embeddings);
  }

  return results;
}

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

// Delay between embedding batches during ingestion (ms). Free tier = 3 RPM → 20s.
const BATCH_DELAY_MS = parseInt(process.env.VOYAGE_BATCH_DELAY_MS ?? '21000', 10);

async function embedWithRetry(
  client: VoyageAIClient,
  input: string[],
  retries = 5,
): Promise<number[][]> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const result = await client.embed({ input, model: 'voyage-3' });
      return result.data!.map((d) => d.embedding as number[]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const is429 = msg.includes('429') || msg.toLowerCase().includes('rate limit');
      if (is429 && attempt < retries) {
        const wait = BATCH_DELAY_MS * (attempt + 1);
        console.warn(`[voyage] 429 rate limit — retrying in ${wait}ms (attempt ${attempt + 1}/${retries})`);
        await sleep(wait);
        continue;
      }
      throw err;
    }
  }
  throw new Error('embedWithRetry: exhausted retries');
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
    if (i > 0) await sleep(BATCH_DELAY_MS);
    const batch = texts.slice(i, i + BATCH_SIZE);
    const embeddings = await embedWithRetry(client, batch);
    results.push(...embeddings);
  }

  return results;
}

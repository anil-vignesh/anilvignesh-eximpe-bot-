import VoyageAI from 'voyageai';

let _client: VoyageAI | null = null;

function getClient(): VoyageAI {
  if (!_client) {
    const apiKey = process.env.VOYAGE_API_KEY;
    if (!apiKey) throw new Error('VOYAGE_API_KEY is not set');
    _client = new VoyageAI({ apiKey });
  }
  return _client;
}

/**
 * Embed a single text string. Returns a 1024-dimension vector.
 */
export async function embedText(text: string): Promise<number[]> {
  const client = getClient();
  const result = await client.embed({
    input: [text],
    model: 'voyage-3',
  });
  return result.data![0].embedding as number[];
}

/**
 * Embed a batch of texts. Returns one vector per input.
 * Voyage AI supports up to 128 texts per batch.
 */
export async function embedBatch(texts: string[]): Promise<number[][]> {
  const client = getClient();
  const BATCH_SIZE = 128;
  const results: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const result = await client.embed({
      input: batch,
      model: 'voyage-3',
    });
    results.push(...(result.data!.map((d) => d.embedding as number[])));
  }

  return results;
}

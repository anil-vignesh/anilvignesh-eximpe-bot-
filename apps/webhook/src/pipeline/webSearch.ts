import { tavily } from '@tavily/core';

export interface WebSearchResult {
  query:   string;
  content: string;  // summarised result ready to inject into prompt
  urls:    string[];
}

/**
 * Execute a web search via Tavily and return a clean summary
 * ready to be injected into the Claude prompt.
 *
 * Returns null if the search fails — pipeline falls back gracefully.
 */
export async function webSearch(query: string): Promise<WebSearchResult | null> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    console.warn('[webSearch] TAVILY_API_KEY not set — skipping web search');
    return null;
  }

  try {
    const client = tavily({ apiKey });

    const response = await client.search(query, {
      searchDepth:        'basic',
      maxResults:         5,
      includeAnswer:      true,   // Tavily returns an AI-generated answer summary
      includeRawContent:  false,
    });

    // Build a compact content block for the prompt
    const lines: string[] = [];

    if (response.answer) {
      lines.push(response.answer);
    }

    for (const result of response.results ?? []) {
      if (result.content) {
        lines.push(`[${result.title ?? result.url}]: ${result.content}`);
      }
    }

    return {
      query,
      content: lines.join('\n\n'),
      urls:    (response.results ?? []).map((r) => r.url).filter(Boolean),
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[webSearch] Tavily error:', message);
    return null;  // pipeline continues without web search
  }
}

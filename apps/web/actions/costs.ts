'use server'

import { getDb } from '@/lib/supabase'

// ── Pricing (per 1M tokens unless noted) ──────────────────────────────────────

const CLAUDE_PRICING: Record<string, { input: number; output: number }> = {
  'claude-haiku-4-5-20251001': { input: 0.80,  output: 4.00  },
  'claude-haiku-4-5':          { input: 0.80,  output: 4.00  },
  'claude-sonnet-4-6':         { input: 3.00,  output: 15.00 },
  'claude-opus-4-6':           { input: 15.00, output: 75.00 },
}
const DEFAULT_CLAUDE_PRICING = CLAUDE_PRICING['claude-haiku-4-5-20251001']

// Voyage-3: $0.06 / 1M tokens (embeddings)
const VOYAGE_PRICE_PER_M = 0.06
// Avg tokens per chunk ≈ 300 (chunk_size 1200 chars ÷ 4 chars/token)
const AVG_TOKENS_PER_CHUNK = 300

// Tavily: free up to 1000 searches/month, then $0.01/search
const TAVILY_FREE_SEARCHES = 1000
const TAVILY_PRICE_PER_SEARCH = 0.01

function claudeCost(model: string | null, inputTokens: number, outputTokens: number): number {
  const pricing = (model && CLAUDE_PRICING[model]) ? CLAUDE_PRICING[model] : DEFAULT_CLAUDE_PRICING
  return (inputTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DailyBreakdown {
  date:          string   // YYYY-MM-DD
  claudeCost:    number
  tavilySearches: number
  tavilyFree:    boolean  // true if still within free tier on that day
  tokensInput:   number
  tokensOutput:  number
  conversations: number
}

export interface CostSummary {
  period:          string         // e.g. "March 2026"
  claudeTotal:     number
  tavilyTotal:     number
  voyageEstimate:  number
  grandTotal:      number
  totalConversations: number
  totalTokensInput:   number
  totalTokensOutput:  number
  totalSearches:      number
  dailyBreakdown:     DailyBreakdown[]
  // Voyage data
  totalChunks:     number
}

export async function getCostSummary(year: number, month: number): Promise<CostSummary> {
  const db = getDb()

  const startDate = new Date(year, month - 1, 1).toISOString()
  const endDate   = new Date(year, month, 1).toISOString()

  // Fetch all logs for the period
  const { data: logs, error } = await db
    .from('conversation_logs')
    .select('created_at, model, tokens_input, tokens_output, web_search_queries')
    .gte('created_at', startDate)
    .lt('created_at', endDate)
    .order('created_at', { ascending: true })

  if (error) throw new Error(error.message)

  // Fetch total document chunks for Voyage estimate
  const { count: totalChunks } = await db
    .from('document_chunks')
    .select('id', { count: 'exact', head: true })

  // Aggregate by day
  const byDay: Record<string, DailyBreakdown> = {}

  let cumulativeSearches = 0

  for (const log of logs ?? []) {
    const day = log.created_at.slice(0, 10) // YYYY-MM-DD
    if (!byDay[day]) {
      byDay[day] = {
        date: day, claudeCost: 0, tavilySearches: 0,
        tavilyFree: true, tokensInput: 0, tokensOutput: 0, conversations: 0,
      }
    }

    const entry = byDay[day]
    const inputTok  = log.tokens_input  ?? 0
    const outputTok = log.tokens_output ?? 0
    const searches  = (log.web_search_queries as string[] | null)?.length ?? 0

    entry.conversations++
    entry.tokensInput  += inputTok
    entry.tokensOutput += outputTok
    entry.claudeCost   += claudeCost(log.model, inputTok, outputTok)
    entry.tavilySearches += searches
    cumulativeSearches   += searches
    // Mark day as billable if we've gone past the free tier
    if (cumulativeSearches > TAVILY_FREE_SEARCHES) entry.tavilyFree = false
  }

  const dailyBreakdown = Object.values(byDay).sort((a, b) => a.date.localeCompare(b.date))

  const claudeTotal = dailyBreakdown.reduce((s, d) => s + d.claudeCost, 0)
  const totalSearches = dailyBreakdown.reduce((s, d) => s + d.tavilySearches, 0)
  const billableSearches = Math.max(0, totalSearches - TAVILY_FREE_SEARCHES)
  const tavilyTotal = billableSearches * TAVILY_PRICE_PER_SEARCH

  const voyageEstimate = ((totalChunks ?? 0) * AVG_TOKENS_PER_CHUNK / 1_000_000) * VOYAGE_PRICE_PER_M

  const totalTokensInput  = dailyBreakdown.reduce((s, d) => s + d.tokensInput, 0)
  const totalTokensOutput = dailyBreakdown.reduce((s, d) => s + d.tokensOutput, 0)
  const totalConversations = dailyBreakdown.reduce((s, d) => s + d.conversations, 0)

  const periodDate = new Date(year, month - 1, 1)
  const period = periodDate.toLocaleString('en-US', { month: 'long', year: 'numeric' })

  return {
    period,
    claudeTotal,
    tavilyTotal,
    voyageEstimate,
    grandTotal: claudeTotal + tavilyTotal,
    totalConversations,
    totalTokensInput,
    totalTokensOutput,
    totalSearches,
    dailyBreakdown,
    totalChunks: totalChunks ?? 0,
  }
}

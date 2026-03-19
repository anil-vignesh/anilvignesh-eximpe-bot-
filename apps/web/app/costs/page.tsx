import { getCostSummary } from '@/actions/costs'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { MonthPicker } from './month-picker'
import { ExternalLinkIcon } from 'lucide-react'

interface Props {
  searchParams: Promise<{ month?: string }>
}

function fmt(n: number) {
  return n < 0.01 && n > 0 ? '<$0.01' : `$${n.toFixed(2)}`
}

function fmtTokens(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

export default async function CostsPage({ searchParams }: Props) {
  const { month: monthParam } = await searchParams

  const now = new Date()
  let year  = now.getFullYear()
  let month = now.getMonth() + 1 // 1-indexed

  if (monthParam) {
    const [y, m] = monthParam.split('-').map(Number)
    if (y && m && m >= 1 && m <= 12) { year = y; month = m }
  }

  const summary = await getCostSummary(year, month)

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-4 py-8">

        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Cost Tracker</h1>
            <p className="mt-1 text-sm text-muted-foreground">{summary.period}</p>
          </div>
          <MonthPicker year={year} month={month} />
        </div>

        {/* Summary cards */}
        <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard
            label="Claude API"
            value={fmt(summary.claudeTotal)}
            sub={`${fmtTokens(summary.totalTokensInput)} in · ${fmtTokens(summary.totalTokensOutput)} out`}
            note="Haiku default — actual cost varies by model"
          />
          <SummaryCard
            label="Tavily Search"
            value={fmt(summary.tavilyTotal)}
            sub={`${summary.totalSearches} searches total`}
            note={summary.totalSearches <= 1000 ? 'Within free tier (1 000/mo)' : `${Math.max(0, summary.totalSearches - 1000)} billable at $0.01 each`}
          />
          <SummaryCard
            label="Voyage AI"
            value={`~${fmt(summary.voyageEstimate)}`}
            sub={`${summary.totalChunks.toLocaleString()} doc chunks`}
            note="Estimate based on chunk count × 300 tokens"
          />
          <SummaryCard
            label="Total (Claude + Tavily)"
            value={fmt(summary.grandTotal)}
            sub={`${summary.totalConversations} conversations`}
            highlight
          />
        </div>

        {/* Daily breakdown */}
        <div className="rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold">Daily Breakdown</h2>
            <span className="text-xs text-muted-foreground">All times UTC</span>
          </div>

          {summary.dailyBreakdown.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              No conversations in this period.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Conversations</TableHead>
                  <TableHead className="text-right">Tokens In</TableHead>
                  <TableHead className="text-right">Tokens Out</TableHead>
                  <TableHead className="text-right">Claude Cost</TableHead>
                  <TableHead className="text-right">Searches</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...summary.dailyBreakdown].reverse().map((day) => (
                  <TableRow key={day.date}>
                    <TableCell className="text-sm tabular-nums">{day.date}</TableCell>
                    <TableCell className="text-right text-sm tabular-nums">{day.conversations}</TableCell>
                    <TableCell className="text-right text-sm tabular-nums">{fmtTokens(day.tokensInput)}</TableCell>
                    <TableCell className="text-right text-sm tabular-nums">{fmtTokens(day.tokensOutput)}</TableCell>
                    <TableCell className="text-right text-sm tabular-nums">{fmt(day.claudeCost)}</TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {day.tavilySearches > 0 ? (
                        <span className={day.tavilyFree ? 'text-muted-foreground' : 'text-amber-600'}>
                          {day.tavilySearches}
                          {!day.tavilyFree && ' $'}
                        </span>
                      ) : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        {/* External dashboard links */}
        <div className="mt-6 rounded-xl border border-border bg-card p-4">
          <p className="mb-3 text-sm font-semibold">External dashboards</p>
          <div className="flex flex-wrap gap-3">
            <ExternalLink href="https://console.anthropic.com/settings/usage" label="Anthropic Usage" />
            <ExternalLink href="https://dashboard.voyageai.com" label="Voyage AI Usage" />
            <ExternalLink href="https://app.tavily.com/home" label="Tavily Usage" />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Note: Claude costs here cover only the main answer call per conversation.
            The intent classifier, query rewriter, and experience distil calls (all Haiku, ~100 tokens each) are not yet tracked separately — actual Claude spend will be slightly higher.
          </p>
        </div>

      </div>
    </div>
  )
}

function SummaryCard({
  label, value, sub, note, highlight,
}: {
  label: string
  value: string
  sub?: string
  note?: string
  highlight?: boolean
}) {
  return (
    <div className={`rounded-xl border p-4 ${highlight ? 'border-primary/30 bg-primary/5' : 'border-border bg-card'}`}>
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${highlight ? 'text-primary' : ''}`}>{value}</p>
      {sub  && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
      {note && <p className="mt-1 text-xs text-muted-foreground/70">{note}</p>}
    </div>
  )
}

function ExternalLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
    >
      {label}
      <ExternalLinkIcon className="size-3" />
    </a>
  )
}

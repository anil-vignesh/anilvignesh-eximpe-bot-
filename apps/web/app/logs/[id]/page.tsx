import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getLog } from '@/actions/logs'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ChevronLeftIcon, GlobeIcon, SparklesIcon } from 'lucide-react'

interface Props {
  params: Promise<{ id: string }>
}

export default async function LogDetailPage({ params }: Props) {
  const { id } = await params
  const log = await getLog(id)

  if (!log) notFound()

  const docChunks: any[] = Array.isArray(log.doc_chunks_used) ? log.doc_chunks_used : []
  const expEntries: any[] = Array.isArray(log.experience_entries_used) ? log.experience_entries_used : []

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-4 py-8">
        {/* Breadcrumb */}
        <Link
          href="/logs"
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeftIcon className="size-4" />
          Conversation Logs
        </Link>

        {/* Top two-column layout */}
        <div className="mb-6 grid gap-4 md:grid-cols-2">
          {/* Left: Question */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Question
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{log.question}</p>
            </CardContent>
          </Card>

          {/* Right: Metadata */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Metadata
              </CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-2 text-sm">
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-muted-foreground">Bot</dt>
                  <dd className="font-medium">{log.bot_name ?? '—'}</dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-muted-foreground">Channel</dt>
                  <dd>
                    <Badge variant={log.channel_type === 'telegram' ? 'blue' : 'success'}>
                      {log.channel_type}
                    </Badge>
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-muted-foreground">Sender</dt>
                  <dd className="font-mono text-xs">{log.sender_ref ?? '—'}</dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-muted-foreground">Created</dt>
                  <dd>{new Date(log.created_at).toLocaleString()}</dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-muted-foreground">Latency</dt>
                  <dd className="tabular-nums">{log.latency_ms !== null ? `${log.latency_ms}ms` : '—'}</dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-muted-foreground">Tokens (in/out)</dt>
                  <dd className="tabular-nums">
                    {log.tokens_input !== null && log.tokens_output !== null
                      ? `${log.tokens_input} / ${log.tokens_output}`
                      : '—'}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-muted-foreground">Web Search</dt>
                  <dd>
                    {log.web_search_used ? (
                      <span className="flex items-center gap-1 text-blue-600">
                        <GlobeIcon className="size-3.5" />
                        Used
                      </span>
                    ) : (
                      <span className="text-muted-foreground">No</span>
                    )}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-muted-foreground">Experience Generated</dt>
                  <dd>
                    {log.experience_generated ? (
                      <span className="flex items-center gap-1 text-purple-600">
                        <SparklesIcon className="size-3.5" />
                        Yes
                      </span>
                    ) : (
                      <span className="text-muted-foreground">No</span>
                    )}
                  </dd>
                </div>
                {(log.sources_used ?? []).length > 0 && (
                  <div className="flex items-start justify-between gap-4">
                    <dt className="text-muted-foreground shrink-0">Sources</dt>
                    <dd className="flex flex-wrap justify-end gap-1">
                      {(log.sources_used ?? []).map((src, i) => (
                        <Badge key={i} variant="gray" className="text-xs">
                          {src}
                        </Badge>
                      ))}
                    </dd>
                  </div>
                )}
              </dl>
            </CardContent>
          </Card>
        </div>

        {/* Answer */}
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Answer
            </CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">{log.answer}</pre>
          </CardContent>
        </Card>

        {/* Documentation Used */}
        {docChunks.length > 0 && (
          <Card className="mb-6">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Documentation Used</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                {docChunks.map((chunk: any) => (
                  <li key={chunk.id} className="rounded-lg border border-border bg-muted/30 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-medium">{chunk.source_name ?? 'Unknown source'}</span>
                      {chunk.similarity_score !== undefined && chunk.similarity_score !== null && (
                        <Badge variant="gray" className="shrink-0 text-xs tabular-nums">
                          {(chunk.similarity_score * 100).toFixed(1)}% match
                        </Badge>
                      )}
                    </div>
                    {chunk.chunk_text && (
                      <p className="mt-2 text-xs text-muted-foreground line-clamp-3 leading-relaxed">
                        {chunk.chunk_text}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {/* Experience Used */}
        {expEntries.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Experience Used</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                {expEntries.map((entry: any) => (
                  <li key={entry.id} className="rounded-lg border border-border bg-muted/30 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-medium line-clamp-2">
                        {entry.question_summary ?? 'No question'}
                      </span>
                      {entry.similarity_score !== undefined && entry.similarity_score !== null && (
                        <Badge variant="purple" className="shrink-0 text-xs tabular-nums">
                          {(entry.similarity_score * 100).toFixed(1)}% match
                        </Badge>
                      )}
                    </div>
                    {entry.answer_summary && (
                      <p className="mt-2 text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                        {entry.answer_summary}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

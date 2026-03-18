import Link from 'next/link'
import { listLogs, listBotsForFilter } from '@/actions/logs'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { BotFilterSelect } from './bot-filter-select'
import { LogsPagination } from './logs-pagination'
import { GlobeIcon, SparklesIcon, CheckCircle2Icon } from 'lucide-react'

interface Props {
  searchParams: Promise<{ page?: string; botId?: string }>
}

export default async function LogsPage({ searchParams }: Props) {
  const { page: pageParam, botId } = await searchParams
  const page = Math.max(1, parseInt(pageParam ?? '1', 10) || 1)

  const [{ logs, total }, bots] = await Promise.all([
    listLogs(page, botId),
    listBotsForFilter(),
  ])

  const totalPages = Math.ceil(total / 50)

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-4 py-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Conversation Logs</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {total.toLocaleString()} total conversations
            </p>
          </div>
          <BotFilterSelect bots={bots} currentBotId={botId} />
        </div>

        <div className="rounded-xl border border-border bg-card">
          {logs.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              No logs found.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Created At</TableHead>
                  <TableHead>Bot</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead>Sender</TableHead>
                  <TableHead>Question</TableHead>
                  <TableHead>Sources</TableHead>
                  <TableHead className="text-right">Latency</TableHead>
                  <TableHead className="text-right">Tokens</TableHead>
                  <TableHead className="text-center">Web</TableHead>
                  <TableHead className="text-center">Exp</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow
                    key={log.id}
                    className="cursor-pointer"
                    onClick={() => {}}
                  >
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      <Link href={`/logs/${log.id}`} className="block hover:text-foreground transition-colors">
                        {new Date(log.created_at).toLocaleString()}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm">
                      <Link href={`/logs/${log.id}`} className="block hover:text-primary transition-colors">
                        {log.bot_name ?? <span className="text-muted-foreground">—</span>}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link href={`/logs/${log.id}`} className="block">
                        <Badge variant={log.channel_type === 'telegram' ? 'blue' : 'success'}>
                          {log.channel_type}
                        </Badge>
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm font-mono text-muted-foreground">
                      <Link href={`/logs/${log.id}`} className="block">
                        {log.sender_ref ?? '—'}
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-[220px]">
                      <Link href={`/logs/${log.id}`} className="block text-sm hover:text-primary transition-colors">
                        {log.question.length > 60 ? log.question.slice(0, 60) + '…' : log.question}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link href={`/logs/${log.id}`} className="block">
                        <div className="flex flex-wrap gap-1">
                          {(log.sources_used ?? []).slice(0, 2).map((src, i) => (
                            <Badge key={i} variant="gray" className="text-xs max-w-[80px] truncate">
                              {src}
                            </Badge>
                          ))}
                          {(log.sources_used ?? []).length > 2 && (
                            <Badge variant="gray" className="text-xs">
                              +{(log.sources_used ?? []).length - 2}
                            </Badge>
                          )}
                        </div>
                      </Link>
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      <Link href={`/logs/${log.id}`} className="block">
                        {log.latency_ms !== null ? `${log.latency_ms}ms` : '—'}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      <Link href={`/logs/${log.id}`} className="block">
                        {log.tokens_input !== null && log.tokens_output !== null
                          ? `${log.tokens_input}+${log.tokens_output}`
                          : '—'}
                      </Link>
                    </TableCell>
                    <TableCell className="text-center">
                      <Link href={`/logs/${log.id}`} className="flex justify-center">
                        {log.web_search_used ? (
                          <GlobeIcon className="size-4 text-blue-500" />
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </Link>
                    </TableCell>
                    <TableCell className="text-center">
                      <Link href={`/logs/${log.id}`} className="flex justify-center">
                        {log.experience_generated ? (
                          <SparklesIcon className="size-4 text-purple-500" />
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        {totalPages > 1 && (
          <LogsPagination currentPage={page} totalPages={totalPages} botId={botId} />
        )}
      </div>
    </div>
  )
}

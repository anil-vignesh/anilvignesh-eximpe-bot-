import Link from 'next/link'
import { listBots } from '@/actions/bots'
import { StatusBadge } from '@/components/shared/status-badge'
import { ToggleStatusButton } from '@/components/bots/toggle-status-button'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table'
import { BotIcon, PlusIcon } from 'lucide-react'

export default async function BotsPage() {
  const bots = await listBots()

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Bots</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your Telegram and WhatsApp bots.
          </p>
        </div>
        <Link
          href="/bots/new"
          className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80"
        >
          <PlusIcon className="size-4" />
          New Bot
        </Link>
      </div>

      {bots.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 py-20 text-center">
          <BotIcon className="mb-4 size-10 text-muted-foreground" />
          <p className="text-base font-medium">No bots yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Create your first bot to get started.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Knowledge Base</TableHead>
                <TableHead>Experience Store</TableHead>
                <TableHead className="w-[120px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bots.map((bot) => (
                <TableRow key={bot.id} className="cursor-pointer">
                  <TableCell>
                    <Link
                      href={`/bots/${bot.id}`}
                      className="font-medium hover:text-primary transition-colors"
                    >
                      {bot.name}
                      {bot.description && (
                        <span className="block text-xs text-muted-foreground font-normal mt-0.5 line-clamp-1">
                          {bot.description}
                        </span>
                      )}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <span className="capitalize text-sm">{bot.channel_type}</span>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={bot.status} />
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground">
                      {bot.kb_name ?? <span className="italic">None</span>}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground">
                      {bot.exp_name ?? <span className="italic">None</span>}
                    </span>
                  </TableCell>
                  <TableCell>
                    <ToggleStatusButton botId={bot.id} currentStatus={bot.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}

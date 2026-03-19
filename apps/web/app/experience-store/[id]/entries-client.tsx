'use client'

import { useState, useTransition } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle, SheetClose } from '@/components/ui/sheet'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { StatusBadge } from '@/components/status-badge'
import { updateEntryStatus, updateEntry, deleteEntry } from '@/actions/experience-store'
import type { ExperienceEntry } from '@/lib/types'
import { toast } from 'sonner'
import { ArchiveIcon, ArchiveRestoreIcon, FlagIcon, PencilIcon, Trash2Icon } from 'lucide-react'

const STATUS_TABS = ['all', 'active', 'archived', 'flagged'] as const

interface Props {
  storeId: string
  initialEntries: ExperienceEntry[]
  currentStatus: string
}

export function EntriesClient({ storeId, initialEntries, currentStatus }: Props) {
  const [entries, setEntries] = useState<ExperienceEntry[]>(initialEntries)
  const [editEntry, setEditEntry] = useState<ExperienceEntry | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const pathname = usePathname()

  // Edit form state
  const [editQuestion, setEditQuestion] = useState('')
  const [editAnswer, setEditAnswer] = useState('')
  const [editTags, setEditTags] = useState('')

  function openEdit(entry: ExperienceEntry) {
    setEditEntry(entry)
    setEditQuestion(entry.question_summary)
    setEditAnswer(entry.answer_summary)
    setEditTags(entry.tags.join(', '))
  }

  function handleStatusChange(id: string, newStatus: 'active' | 'archived' | 'flagged') {
    startTransition(async () => {
      try {
        await updateEntryStatus(id, newStatus, storeId)
        setEntries((prev) =>
          prev.map((e) => (e.id === id ? { ...e, status: newStatus } : e))
        )
        toast.success(`Entry marked as ${newStatus}`)
      } catch (err: any) {
        toast.error(err.message ?? 'Failed to update status')
      }
    })
  }

  function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editEntry) return

    const tags = editTags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)

    startTransition(async () => {
      try {
        await updateEntry(
          editEntry.id,
          {
            question_summary: editQuestion.trim(),
            answer_summary: editAnswer.trim(),
            tags,
          },
          storeId
        )
        setEntries((prev) =>
          prev.map((e) =>
            e.id === editEntry.id
              ? { ...e, question_summary: editQuestion.trim(), answer_summary: editAnswer.trim(), tags }
              : e
          )
        )
        toast.success('Entry updated')
        setEditEntry(null)
      } catch (err: any) {
        toast.error(err.message ?? 'Failed to update entry')
      }
    })
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      try {
        await deleteEntry(id, storeId)
        setEntries((prev) => prev.filter((e) => e.id !== id))
        toast.success('Entry deleted')
        setDeleteConfirmId(null)
      } catch (err: any) {
        toast.error(err.message ?? 'Failed to delete entry')
      }
    })
  }

  function navigateStatus(status: string) {
    const params = new URLSearchParams()
    if (status !== 'all') params.set('status', status)
    router.push(`${pathname}?${params.toString()}`)
  }

  const activeTab = currentStatus === 'all' || !currentStatus ? 'all' : currentStatus

  return (
    <>
      {/* Status filter tabs */}
      <div className="mb-4 flex gap-1 rounded-lg bg-muted p-1 w-fit">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => navigateStatus(tab)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-colors ${
              activeTab === tab
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-card">
        {entries.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            No entries found.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Question</TableHead>
                <TableHead>Tags</TableHead>
                <TableHead className="text-right">Score</TableHead>
                <TableHead className="text-right">Uses</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-28" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="max-w-[240px]">
                    <span className="text-sm">
                      {entry.question_summary.length > 80
                        ? entry.question_summary.slice(0, 80) + '…'
                        : entry.question_summary}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {entry.tags.map((tag) => (
                        <Badge key={tag} variant="gray" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {entry.quality_score !== null ? entry.quality_score.toFixed(1) : '—'}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {entry.use_count}
                  </TableCell>
                  <TableCell>
                    <Badge variant={entry.source_type === 'auto' ? 'blue' : 'purple'}>
                      {entry.source_type}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={entry.status} />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(entry.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-0.5">
                      {entry.status === 'archived' ? (
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          title="Unarchive"
                          onClick={() => handleStatusChange(entry.id, 'active')}
                          disabled={isPending}
                        >
                          <ArchiveRestoreIcon className="size-3.5 text-muted-foreground" />
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          title="Archive"
                          onClick={() => handleStatusChange(entry.id, 'archived')}
                          disabled={isPending}
                        >
                          <ArchiveIcon className="size-3.5 text-muted-foreground" />
                        </Button>
                      )}
                      {entry.status !== 'flagged' && (
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          title="Flag"
                          onClick={() => handleStatusChange(entry.id, 'flagged')}
                          disabled={isPending}
                        >
                          <FlagIcon className="size-3.5 text-muted-foreground" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        title="Edit"
                        onClick={() => openEdit(entry)}
                      >
                        <PencilIcon className="size-3.5 text-muted-foreground" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        title="Delete"
                        onClick={() => setDeleteConfirmId(entry.id)}
                      >
                        <Trash2Icon className="size-3.5 text-muted-foreground hover:text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Edit Sheet */}
      <Sheet open={editEntry !== null} onOpenChange={(open) => !open && setEditEntry(null)}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Edit Entry</SheetTitle>
            <SheetClose onClose={() => setEditEntry(null)} />
          </SheetHeader>
          <form id="edit-entry-form" onSubmit={handleSaveEdit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="edit-question">Question Summary</Label>
              <Textarea
                id="edit-question"
                value={editQuestion}
                onChange={(e) => setEditQuestion(e.target.value)}
                rows={4}
                className="min-h-[100px]"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-answer">Answer Summary</Label>
              <Textarea
                id="edit-answer"
                value={editAnswer}
                onChange={(e) => setEditAnswer(e.target.value)}
                rows={5}
                className="min-h-[120px]"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-tags">Tags (comma-separated)</Label>
              <Input
                id="edit-tags"
                value={editTags}
                onChange={(e) => setEditTags(e.target.value)}
                placeholder="tag1, tag2, tag3"
              />
            </div>
          </form>
          <SheetFooter>
            <Button variant="outline" onClick={() => setEditEntry(null)}>
              Cancel
            </Button>
            <Button type="submit" form="edit-entry-form" disabled={isPending}>
              {isPending ? 'Saving…' : 'Save Changes'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Delete Confirm Dialog */}
      <Dialog open={deleteConfirmId !== null} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Entry</DialogTitle>
            <DialogDescription>
              This will permanently delete this experience entry. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={isPending}
              onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}
            >
              {isPending ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

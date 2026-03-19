'use client'

import { useState, useTransition } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectItem } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle, SheetClose } from '@/components/ui/sheet'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Collapsible } from '@/components/ui/collapsible'
import { createAssignment, updateAssignment, deleteAssignment } from '@/actions/chat-assignments'
import type { BotChatAssignment } from '@/lib/types'
import { toast } from 'sonner'
import { PlusIcon, PencilIcon, Trash2Icon, UserPlusIcon } from 'lucide-react'

type Assignment = BotChatAssignment & { bot_name: string | null }
type UnrecognisedChat = { id: string; channel_type: string; chat_id: string; received_at: string }

interface Props {
  initialAssignments: Assignment[]
  bots: { id: string; name: string }[]
  unrecognisedChats: UnrecognisedChat[]
  apiVersions: string[]
}

const emptyForm = {
  bot_id: '',
  channel_type: 'telegram',
  chat_id: '',
  chat_label: '',
  api_version: '',
}

export function ChatAssignmentsClient({ initialAssignments, bots, unrecognisedChats: initialUnrecognisedChats, apiVersions }: Props) {
  const [assignments, setAssignments] = useState<Assignment[]>(initialAssignments)
  const [unrecognisedChats, setUnrecognisedChats] = useState<UnrecognisedChat[]>(initialUnrecognisedChats)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [isPending, startTransition] = useTransition()

  function openAdd(prefill?: { channel_type: string; chat_id: string }) {
    setEditingId(null)
    setForm(prefill ? { ...emptyForm, ...prefill } : emptyForm)
    setSheetOpen(true)
  }

  function openEdit(assignment: Assignment) {
    setEditingId(assignment.id)
    setForm({
      bot_id: assignment.bot_id,
      channel_type: assignment.channel_type,
      chat_id: assignment.chat_id,
      chat_label: assignment.chat_label ?? '',
      api_version: assignment.api_version,
    })
    setSheetOpen(true)
  }

  function updateForm(field: keyof typeof emptyForm, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.bot_id || !form.chat_id || !form.api_version) return

    startTransition(async () => {
      try {
        if (editingId) {
          await updateAssignment(editingId, {
            bot_id: form.bot_id,
            api_version: form.api_version,
            chat_label: form.chat_label || undefined,
          })
          setAssignments((prev) =>
            prev.map((a) =>
              a.id === editingId
                ? {
                    ...a,
                    bot_id: form.bot_id,
                    api_version: form.api_version,
                    chat_label: form.chat_label || null,
                    bot_name: bots.find((b) => b.id === form.bot_id)?.name ?? null,
                  }
                : a
            )
          )
          toast.success('Assignment updated')
        } else {
          const created = await createAssignment({
            bot_id: form.bot_id,
            channel_type: form.channel_type,
            chat_id: form.chat_id,
            chat_label: form.chat_label || undefined,
            api_version: form.api_version,
          })
          // Append new assignment to local state
          setAssignments((prev) => [
            {
              id: created.id,
              bot_id: form.bot_id,
              channel_type: form.channel_type as 'telegram' | 'whatsapp',
              chat_id: form.chat_id,
              chat_label: form.chat_label || null,
              api_version: form.api_version,
              assigned_at: created.assigned_at,
              bot_name: bots.find((b) => b.id === form.bot_id)?.name ?? null,
            },
            ...prev,
          ])
          // Remove from unrecognised chats list
          setUnrecognisedChats((prev) =>
            prev.filter((c) => !(c.chat_id === form.chat_id && c.channel_type === form.channel_type))
          )
          toast.success('Assignment created')
        }
        setSheetOpen(false)
      } catch (err: any) {
        toast.error(err.message ?? 'Operation failed')
      }
    })
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      try {
        await deleteAssignment(id)
        setAssignments((prev) => prev.filter((a) => a.id !== id))
        toast.success('Assignment deleted')
        setDeleteConfirmId(null)
      } catch (err: any) {
        toast.error(err.message ?? 'Failed to delete')
      }
    })
  }

  const channelVariant = (channel: string) =>
    channel === 'telegram' ? 'blue' : 'success'

  return (
    <>
      {/* Assignments Section */}
      <section className="mb-8 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Assignments</h2>
          <Button onClick={() => openAdd()}>
            <PlusIcon />
            Add Assignment
          </Button>
        </div>

        <div className="rounded-xl border border-border bg-card">
          {assignments.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              No assignments yet.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Channel</TableHead>
                  <TableHead>Chat ID</TableHead>
                  <TableHead>Label</TableHead>
                  <TableHead>Bot</TableHead>
                  <TableHead>API Version</TableHead>
                  <TableHead>Assigned At</TableHead>
                  <TableHead className="w-16" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {assignments.map((assignment) => (
                  <TableRow key={assignment.id}>
                    <TableCell>
                      <Badge variant={channelVariant(assignment.channel_type)}>
                        {assignment.channel_type}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{assignment.chat_id}</TableCell>
                    <TableCell className="text-sm">
                      {assignment.chat_label ?? <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-sm">
                      {assignment.bot_name ?? <span className="text-muted-foreground">Unknown</span>}
                    </TableCell>
                    <TableCell className="text-sm font-mono">{assignment.api_version}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(assignment.assigned_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-0.5">
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => openEdit(assignment)}
                        >
                          <PencilIcon className="size-3.5 text-muted-foreground" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => setDeleteConfirmId(assignment.id)}
                        >
                          <Trash2Icon className="size-3.5 text-muted-foreground" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </section>

      {/* Unrecognised Chats Section */}
      <Collapsible
        title={
          <div className="flex items-center gap-2">
            <span>Unrecognised Chats</span>
            {unrecognisedChats.length > 0 && (
              <Badge variant="warning">{unrecognisedChats.length}</Badge>
            )}
          </div>
        }
      >
        {unrecognisedChats.length === 0 ? (
          <p className="text-sm text-muted-foreground">No unrecognised chats.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Channel</TableHead>
                <TableHead>Chat ID</TableHead>
                <TableHead>Received At</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {unrecognisedChats.map((chat) => (
                <TableRow key={chat.id}>
                  <TableCell>
                    <Badge variant={channelVariant(chat.channel_type)}>
                      {chat.channel_type}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-sm">{chat.chat_id}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(chat.received_at).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={() => openAdd({ channel_type: chat.channel_type, chat_id: chat.chat_id })}
                    >
                      <UserPlusIcon className="size-3" />
                      Assign
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Collapsible>

      {/* Add / Edit Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{editingId ? 'Edit Assignment' : 'Add Assignment'}</SheetTitle>
          </SheetHeader>
          <form id="assignment-form" onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="assign-bot">Bot</Label>
              <Select
                id="assign-bot"
                value={form.bot_id}
                onChange={(e) => updateForm('bot_id', e.target.value)}
                required
              >
                <SelectItem value="">Select a bot…</SelectItem>
                {bots.map((bot) => (
                  <SelectItem key={bot.id} value={bot.id}>
                    {bot.name}
                  </SelectItem>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="assign-channel">Channel Type</Label>
              <Select
                id="assign-channel"
                value={form.channel_type}
                onChange={(e) => updateForm('channel_type', e.target.value)}
                required
                disabled={!!editingId}
              >
                <SelectItem value="telegram">Telegram</SelectItem>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="assign-chat-id">Chat ID</Label>
              <Input
                id="assign-chat-id"
                value={form.chat_id}
                onChange={(e) => updateForm('chat_id', e.target.value)}
                placeholder="-100123456789"
                required
                disabled={!!editingId}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="assign-label">Label (optional)</Label>
              <Input
                id="assign-label"
                value={form.chat_label}
                onChange={(e) => updateForm('chat_label', e.target.value)}
                placeholder="e.g. Support Group"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="assign-version">API Version</Label>
              <Select
                id="assign-version"
                value={form.api_version}
                onChange={(e) => updateForm('api_version', e.target.value)}
                required
              >
                <SelectItem value="">Select a version…</SelectItem>
                {apiVersions.map((v) => (
                  <SelectItem key={v} value={v}>{v}</SelectItem>
                ))}
              </Select>
            </div>
          </form>
          <SheetFooter>
            <Button variant="outline" onClick={() => setSheetOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="assignment-form" disabled={isPending}>
              {isPending ? 'Saving…' : editingId ? 'Save Changes' : 'Add Assignment'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Delete Confirm Dialog */}
      <Dialog open={deleteConfirmId !== null} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Assignment</DialogTitle>
            <DialogDescription>
              This will remove the bot assignment for this chat. The chat will no longer receive bot responses.
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

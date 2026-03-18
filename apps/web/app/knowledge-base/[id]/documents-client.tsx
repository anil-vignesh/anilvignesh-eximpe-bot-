'use client'

import { useState, useTransition } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle, SheetClose } from '@/components/ui/sheet'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { StatusBadge } from '@/components/status-badge'
import { addUrlDocument, deleteDocument, triggerCrawlAction } from '@/actions/knowledge-base'
import type { Document } from '@/lib/types'
import { toast } from 'sonner'
import { PlusIcon, GlobeIcon, Trash2Icon, AlertCircleIcon, RefreshCwIcon } from 'lucide-react'

interface Props {
  kbId: string
  initialDocuments: Document[]
}

export function DocumentsClient({ kbId, initialDocuments }: Props) {
  const [documents, setDocuments] = useState<Document[]>(initialDocuments)
  const [addSheetOpen, setAddSheetOpen] = useState(false)
  const [crawlDialogOpen, setCrawlDialogOpen] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // Add URL form state
  const [urlValue, setUrlValue] = useState('')
  const [nameValue, setNameValue] = useState('')
  const [apiVersionValue, setApiVersionValue] = useState('')

  // Crawl form state
  const [versionsValue, setVersionsValue] = useState('')

  function handleAddUrl(e: React.FormEvent) {
    e.preventDefault()
    if (!urlValue.trim() || !nameValue.trim()) return

    startTransition(async () => {
      try {
        await addUrlDocument(kbId, urlValue.trim(), nameValue.trim(), apiVersionValue.trim() || undefined)
        toast.success('URL document added')
        setAddSheetOpen(false)
        setUrlValue('')
        setNameValue('')
        setApiVersionValue('')
      } catch (err: any) {
        toast.error(err.message ?? 'Failed to add document')
      }
    })
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      try {
        await deleteDocument(id, kbId)
        setDocuments((prev) => prev.filter((d) => d.id !== id))
        toast.success('Document deleted')
        setDeleteConfirmId(null)
      } catch (err: any) {
        toast.error(err.message ?? 'Failed to delete document')
      }
    })
  }

  function handleCrawl(e: React.FormEvent) {
    e.preventDefault()
    const versions = versionsValue
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean)

    if (versions.length === 0) {
      toast.error('Enter at least one version')
      return
    }

    startTransition(async () => {
      try {
        await triggerCrawlAction(kbId, versions)
        toast.success(`Crawl triggered for versions: ${versions.join(', ')}`)
        setCrawlDialogOpen(false)
        setVersionsValue('')
      } catch (err: any) {
        toast.error(err.message ?? 'Failed to trigger crawl')
      }
    })
  }

  const fileTypeVariantMap: Record<string, 'blue' | 'purple' | 'gray'> = {
    url: 'blue',
    pdf: 'purple',
    txt: 'gray',
    md: 'gray',
  }

  return (
    <>
      <div className="space-y-4">
        {/* Actions row */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Documents</h2>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setCrawlDialogOpen(true)}>
              <RefreshCwIcon />
              Crawl docs.eximpe.com
            </Button>
            <Button onClick={() => setAddSheetOpen(true)}>
              <PlusIcon />
              Add URL
            </Button>
          </div>
        </div>

        {/* Table */}
        <div className="rounded-xl border border-border bg-card">
          {documents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <GlobeIcon className="mb-3 size-8 text-muted-foreground" />
              <p className="text-sm font-medium">No documents yet</p>
              <p className="mt-1 text-xs text-muted-foreground">Add a URL document to get started.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>API Version</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Chunks</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents.map((doc) => (
                  <>
                    <TableRow key={doc.id}>
                      <TableCell className="max-w-[240px]">
                        <div className="truncate font-medium text-sm">{doc.name}</div>
                        {doc.source_url && (
                          <div className="truncate text-xs text-muted-foreground">{doc.source_url}</div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={fileTypeVariantMap[doc.file_type] ?? 'gray'}>
                          {doc.file_type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {doc.api_version ? (
                          <span className="text-sm">{doc.api_version}</span>
                        ) : (
                          <span className="text-muted-foreground text-sm">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={doc.status} />
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {doc.chunk_count}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(doc.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => setDeleteConfirmId(doc.id)}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2Icon className="size-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                    {doc.status === 'error' && doc.error_message && (
                      <TableRow key={`${doc.id}-error`} className="bg-red-50/40 dark:bg-red-900/10 hover:bg-red-50/60">
                        <TableCell colSpan={7} className="py-2">
                          <div className="flex items-start gap-2 text-xs text-red-600 dark:text-red-400">
                            <AlertCircleIcon className="mt-0.5 size-3.5 shrink-0" />
                            <span>{doc.error_message}</span>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>

      {/* Add URL Sheet */}
      <Sheet open={addSheetOpen} onOpenChange={setAddSheetOpen}>
        <SheetHeader>
          <SheetTitle>Add URL Document</SheetTitle>
          <SheetClose onClose={() => setAddSheetOpen(false)} />
        </SheetHeader>
        <SheetContent>
          <form id="add-url-form" onSubmit={handleAddUrl} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="doc-url">URL</Label>
              <Input
                id="doc-url"
                type="url"
                value={urlValue}
                onChange={(e) => setUrlValue(e.target.value)}
                placeholder="https://docs.eximpe.com/..."
                required
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="doc-name">Name</Label>
              <Input
                id="doc-name"
                value={nameValue}
                onChange={(e) => setNameValue(e.target.value)}
                placeholder="e.g. Getting Started"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="doc-api-version">API Version (optional)</Label>
              <Input
                id="doc-api-version"
                value={apiVersionValue}
                onChange={(e) => setApiVersionValue(e.target.value)}
                placeholder="e.g. v1"
              />
            </div>
          </form>
        </SheetContent>
        <SheetFooter>
          <Button variant="outline" onClick={() => setAddSheetOpen(false)}>
            Cancel
          </Button>
          <Button type="submit" form="add-url-form" disabled={isPending}>
            {isPending ? 'Adding…' : 'Add Document'}
          </Button>
        </SheetFooter>
      </Sheet>

      {/* Crawl Dialog */}
      <Dialog open={crawlDialogOpen} onOpenChange={setCrawlDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Crawl docs.eximpe.com</DialogTitle>
            <DialogDescription>
              Enter the API versions to crawl (comma-separated).
            </DialogDescription>
          </DialogHeader>
          <form id="crawl-form" onSubmit={handleCrawl} className="mt-4 space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="crawl-versions">Versions</Label>
              <Input
                id="crawl-versions"
                value={versionsValue}
                onChange={(e) => setVersionsValue(e.target.value)}
                placeholder="1, 2, 3"
                autoFocus
                required
              />
              <p className="text-xs text-muted-foreground">Separate multiple versions with commas.</p>
            </div>
          </form>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCrawlDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="crawl-form" disabled={isPending}>
              {isPending ? 'Triggering…' : 'Start Crawl'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog open={deleteConfirmId !== null} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Document</DialogTitle>
            <DialogDescription>
              This will permanently delete the document and all its chunks. This action cannot be undone.
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

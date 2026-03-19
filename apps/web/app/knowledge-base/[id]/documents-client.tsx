'use client'

import React, { useRef, useState, useTransition } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle, SheetClose } from '@/components/ui/sheet'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { StatusBadge } from '@/components/status-badge'
import { addUrlDocument, addTextDocument, addFileDocument, deleteDocument, triggerCrawlAction, reindexKnowledgeBase, reindexDocument } from '@/actions/knowledge-base'
import type { Document } from '@/lib/types'
import { toast } from 'sonner'
import { PlusIcon, GlobeIcon, Trash2Icon, AlertCircleIcon, RefreshCwIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

type Tab = 'url' | 'text' | 'file'

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

  // Tab state
  const [tab, setTab] = useState<Tab>('url')

  // URL tab form state
  const [urlValue, setUrlValue] = useState('')
  const [nameValue, setNameValue] = useState('')
  const [apiVersionValue, setApiVersionValue] = useState('')

  // Text tab form state
  const [textName, setTextName] = useState('')
  const [textApiVersion, setTextApiVersion] = useState('')
  const [textContent, setTextContent] = useState('')

  // File tab form state
  const [fileName, setFileName] = useState('')
  const [fileApiVersion, setFileApiVersion] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  // Crawl form state
  const [versionsValue, setVersionsValue] = useState('')

  function resetSheet() {
    setTab('url')
    setUrlValue('')
    setNameValue('')
    setApiVersionValue('')
    setTextName('')
    setTextApiVersion('')
    setTextContent('')
    setFileName('')
    setFileApiVersion('')
    if (fileRef.current) fileRef.current.value = ''
  }

  function handleAddUrl(e: React.FormEvent) {
    e.preventDefault()
    if (!urlValue.trim() || !nameValue.trim()) return

    startTransition(async () => {
      try {
        await addUrlDocument(kbId, urlValue.trim(), nameValue.trim(), apiVersionValue.trim() || undefined)
        toast.success('URL document added and queued for indexing')
        setAddSheetOpen(false)
        resetSheet()
      } catch (err: any) {
        toast.error(err.message ?? 'Failed to add document')
      }
    })
  }

  function handleAddText(e: React.FormEvent) {
    e.preventDefault()
    if (!textName.trim() || !textContent.trim()) return

    startTransition(async () => {
      try {
        await addTextDocument(kbId, textName.trim(), textContent.trim(), textApiVersion.trim() || undefined)
        toast.success('Text document added and queued for indexing')
        setAddSheetOpen(false)
        resetSheet()
      } catch (err: any) {
        toast.error(err.message ?? 'Failed to add document')
      }
    })
  }

  async function handleFileUpload(e: React.FormEvent) {
    e.preventDefault()
    if (!fileRef.current?.files?.[0]) return
    const file = fileRef.current.files[0]
    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
    const allowed = ['pdf', 'docx', 'xlsx', 'csv', 'txt']
    if (!allowed.includes(ext)) {
      toast.error('Unsupported file type')
      return
    }

    // Read as base64
    const base64 = await new Promise<string>((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve((reader.result as string).split(',')[1])
      reader.readAsDataURL(file)
    })

    startTransition(async () => {
      try {
        await addFileDocument(
          kbId,
          fileName.trim() || file.name,
          file.name,
          ext,
          base64,
          fileApiVersion.trim() || undefined,
        )
        toast.success('File uploaded and queued for indexing')
        setAddSheetOpen(false)
        resetSheet()
      } catch (err: any) {
        toast.error(err.message ?? 'Upload failed')
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

  function handleReindex() {
    startTransition(async () => {
      try {
        const result = await reindexKnowledgeBase(kbId)
        toast.success(`Re-index queued for ${result.queued} document(s)`)
      } catch (err: any) {
        toast.error(err.message ?? 'Failed to trigger re-index')
      }
    })
  }

  function handleRetryDocument(docId: string) {
    startTransition(async () => {
      try {
        await reindexDocument(docId, kbId)
        setDocuments((prev) =>
          prev.map((d) => d.id === docId ? { ...d, status: 'pending', error_message: null } : d)
        )
        toast.success('Queued for re-indexing')
      } catch (err: any) {
        toast.error(err.message ?? 'Failed to retry')
      }
    })
  }

  const fileTypeVariantMap: Record<string, 'blue' | 'purple' | 'gray'> = {
    url:  'blue',
    pdf:  'purple',
    docx: 'purple',
    xlsx: 'purple',
    csv:  'gray',
    txt:  'gray',
    text: 'gray',
    md:   'gray',
  }

  return (
    <>
      <div className="space-y-4">
        {/* Actions row */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Documents</h2>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleReindex} disabled={isPending}>
              <RefreshCwIcon />
              Re-index All
            </Button>
            <Button variant="outline" onClick={() => setCrawlDialogOpen(true)}>
              <RefreshCwIcon />
              Crawl docs.eximpe.com
            </Button>
            <Button onClick={() => setAddSheetOpen(true)}>
              <PlusIcon />
              Add Document
            </Button>
          </div>
        </div>

        {/* Table */}
        <div className="rounded-xl border border-border bg-card">
          {documents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <GlobeIcon className="mb-3 size-8 text-muted-foreground" />
              <p className="text-sm font-medium">No documents yet</p>
              <p className="mt-1 text-xs text-muted-foreground">Add a document to get started.</p>
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
                  <React.Fragment key={doc.id}>
                    <TableRow>
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
                      <TableCell className="text-sm text-muted-foreground" suppressHydrationWarning>
                        {new Date(doc.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {(doc.status === 'error' || doc.status === 'pending') && (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => handleRetryDocument(doc.id)}
                              disabled={isPending}
                              className="text-muted-foreground hover:text-foreground"
                              title="Retry indexing"
                            >
                              <RefreshCwIcon className="size-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => setDeleteConfirmId(doc.id)}
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <Trash2Icon className="size-4" />
                          </Button>
                        </div>
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
                  </React.Fragment>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>

      {/* Add Document Sheet */}
      <Sheet open={addSheetOpen} onOpenChange={(open) => { setAddSheetOpen(open); if (!open) resetSheet() }}>
        <SheetHeader>
          <SheetTitle>Add Document</SheetTitle>
          <SheetClose onClose={() => setAddSheetOpen(false)} />
        </SheetHeader>
        <SheetContent>
          {/* Tab switcher */}
          <div className="flex gap-1 rounded-lg border border-border bg-muted/50 p-1 mb-4">
            {(['url', 'text', 'file'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={cn(
                  'flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  tab === t
                    ? 'bg-background shadow-sm text-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {t === 'url' ? 'URL' : t === 'text' ? 'Paste Text' : 'Upload File'}
              </button>
            ))}
          </div>

          {/* URL Tab */}
          {tab === 'url' && (
            <form id="add-doc-form" onSubmit={handleAddUrl} className="space-y-4">
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
          )}

          {/* Paste Text Tab */}
          {tab === 'text' && (
            <form id="add-doc-form" onSubmit={handleAddText} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="text-name">Name</Label>
                <Input
                  id="text-name"
                  value={textName}
                  onChange={(e) => setTextName(e.target.value)}
                  placeholder="e.g. Release Notes"
                  required
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="text-api-version">API Version (optional)</Label>
                <Input
                  id="text-api-version"
                  value={textApiVersion}
                  onChange={(e) => setTextApiVersion(e.target.value)}
                  placeholder="e.g. v1"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="text-content">Content</Label>
                <Textarea
                  id="text-content"
                  value={textContent}
                  onChange={(e) => setTextContent(e.target.value)}
                  placeholder="Paste your markdown or plain text here…"
                  className="min-h-[200px] font-mono text-sm"
                  required
                />
              </div>
            </form>
          )}

          {/* Upload File Tab */}
          {tab === 'file' && (
            <form id="add-doc-form" onSubmit={handleFileUpload} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="file-name">Name (optional)</Label>
                <Input
                  id="file-name"
                  value={fileName}
                  onChange={(e) => setFileName(e.target.value)}
                  placeholder="Leave blank to use file name"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="file-api-version">API Version (optional)</Label>
                <Input
                  id="file-api-version"
                  value={fileApiVersion}
                  onChange={(e) => setFileApiVersion(e.target.value)}
                  placeholder="e.g. v1"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="file-input">File</Label>
                <input
                  id="file-input"
                  type="file"
                  ref={fileRef}
                  accept=".pdf,.docx,.xlsx,.csv,.txt"
                  required
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                />
                <p className="text-xs text-muted-foreground">Supported: PDF, DOCX, XLSX, CSV, TXT</p>
              </div>
            </form>
          )}
        </SheetContent>
        <SheetFooter>
          <Button variant="outline" onClick={() => setAddSheetOpen(false)}>
            Cancel
          </Button>
          <Button type="submit" form="add-doc-form" disabled={isPending}>
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

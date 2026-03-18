import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getKnowledgeBase, listDocuments } from '@/actions/knowledge-base'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { StatusBadge } from '@/components/status-badge'
import { ChevronLeftIcon } from 'lucide-react'
import { DocumentsClient } from './documents-client'

interface Props {
  params: Promise<{ id: string }>
}

export default async function KnowledgeBaseDetailPage({ params }: Props) {
  const { id } = await params
  const [kb, documents] = await Promise.all([getKnowledgeBase(id), listDocuments(id)])

  if (!kb) notFound()

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl px-4 py-8">
        {/* Breadcrumb */}
        <Link
          href="/knowledge-base"
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeftIcon className="size-4" />
          Knowledge Bases
        </Link>

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight">{kb.name}</h1>
          {kb.description && (
            <p className="mt-1 text-sm text-muted-foreground">{kb.description}</p>
          )}
          <div className="mt-4 flex flex-wrap gap-3">
            <Card className="px-4 py-2">
              <div className="text-xs text-muted-foreground">Embedding Model</div>
              <div className="text-sm font-medium">{kb.embedding_model}</div>
            </Card>
            <Card className="px-4 py-2">
              <div className="text-xs text-muted-foreground">Chunk Size</div>
              <div className="text-sm font-medium">{kb.chunk_size}</div>
            </Card>
            <Card className="px-4 py-2">
              <div className="text-xs text-muted-foreground">Chunk Overlap</div>
              <div className="text-sm font-medium">{kb.chunk_overlap}</div>
            </Card>
            <Card className="px-4 py-2">
              <div className="text-xs text-muted-foreground">Top K</div>
              <div className="text-sm font-medium">{kb.top_k}</div>
            </Card>
          </div>
        </div>

        {/* Documents section — client component handles all interactivity */}
        <DocumentsClient kbId={id} initialDocuments={documents} />
      </div>
    </div>
  )
}

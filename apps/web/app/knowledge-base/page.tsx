import Link from 'next/link'
import { listKnowledgeBases } from '@/actions/knowledge-base'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { DatabaseIcon, FileTextIcon } from 'lucide-react'
import { NewKnowledgeBaseForm } from './new-kb-form'

export default async function KnowledgeBasePage() {
  const knowledgeBases = await listKnowledgeBases()

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Knowledge Bases</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Manage your knowledge bases and their documents.
            </p>
          </div>
          <NewKnowledgeBaseForm />
        </div>

        {knowledgeBases.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 py-20 text-center">
            <DatabaseIcon className="mb-4 size-10 text-muted-foreground" />
            <p className="text-base font-medium">No knowledge bases yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Create your first knowledge base to get started.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {knowledgeBases.map((kb) => {
              const progressValue = kb.doc_count > 0 ? (kb.indexed_count / kb.doc_count) * 100 : 0
              return (
                <Link key={kb.id} href={`/knowledge-base/${kb.id}`} className="group">
                  <Card className="h-full transition-shadow hover:shadow-md">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="text-base group-hover:text-primary transition-colors">
                          {kb.name}
                        </CardTitle>
                        <Badge variant="gray" className="shrink-0 text-xs">
                          {kb.embedding_model}
                        </Badge>
                      </div>
                      {kb.description && (
                        <CardDescription className="line-clamp-2">{kb.description}</CardDescription>
                      )}
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between text-sm">
                          <span className="flex items-center gap-1.5 text-muted-foreground">
                            <FileTextIcon className="size-3.5" />
                            {kb.doc_count} document{kb.doc_count !== 1 ? 's' : ''}
                          </span>
                          <span className="text-muted-foreground">
                            {kb.indexed_count}/{kb.doc_count} indexed
                          </span>
                        </div>
                        <Progress value={progressValue} className="h-1.5" />
                        <div className="flex gap-3 text-xs text-muted-foreground">
                          <span>chunk: {kb.chunk_size}</span>
                          <span>overlap: {kb.chunk_overlap}</span>
                          <span>top_k: {kb.top_k}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

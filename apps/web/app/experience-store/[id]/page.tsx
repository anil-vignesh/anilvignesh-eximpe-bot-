import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getStore, listEntries } from '@/actions/experience-store'
import { Badge } from '@/components/ui/badge'
import { ChevronLeftIcon } from 'lucide-react'
import { EntriesClient } from './entries-client'

interface Props {
  params: Promise<{ id: string }>
  searchParams: Promise<{ status?: string }>
}

export default async function ExperienceStoreDetailPage({ params, searchParams }: Props) {
  const { id } = await params
  const { status } = await searchParams

  const [store, entries] = await Promise.all([
    getStore(id),
    listEntries(id, status),
  ])

  if (!store) notFound()

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl px-4 py-8">
        {/* Breadcrumb */}
        <Link
          href="/experience-store"
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeftIcon className="size-4" />
          Experience Stores
        </Link>

        {/* Header */}
        <div className="mb-8 flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">{store.name}</h1>
          {store.is_shared && <Badge variant="blue">Shared</Badge>}
        </div>

        {/* Entries table with filter tabs */}
        <EntriesClient key={status ?? 'all'} storeId={id} initialEntries={entries} currentStatus={status ?? 'all'} />
      </div>
    </div>
  )
}

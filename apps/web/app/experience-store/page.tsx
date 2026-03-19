import Link from 'next/link'
import { listStores } from '@/actions/experience-store'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { BookOpenIcon } from 'lucide-react'
import { NewStoreForm } from './new-store-form'

export default async function ExperienceStorePage() {
  const stores = await listStores()

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Experience Stores</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Manage curated Q&amp;A experience entries for bot context.
            </p>
          </div>
          <NewStoreForm />
        </div>

        {stores.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 py-20 text-center">
            <BookOpenIcon className="mb-4 size-10 text-muted-foreground" />
            <p className="text-base font-medium">No experience stores yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Create your first store to start collecting experience entries.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {stores.map((store) => (
              <Link key={store.id} href={`/experience-store/${store.id}`} className="group">
                <Card className="h-full transition-shadow hover:shadow-md">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base group-hover:text-primary transition-colors">
                        {store.name}
                      </CardTitle>
                      {store.is_shared && (
                        <Badge variant="blue" className="shrink-0 text-xs">Shared</Badge>
                      )}
                    </div>
                    {store.description && (
                      <CardDescription className="line-clamp-2">{store.description}</CardDescription>
                    )}
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">
                        {store.entry_count} entr{store.entry_count !== 1 ? 'ies' : 'y'}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(store.created_at).toLocaleDateString('en-GB')}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

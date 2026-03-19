import { notFound } from 'next/navigation'
import { getBot } from '@/actions/bots'
import { getDb } from '@/lib/supabase'
import { BotForm } from '@/components/bots/bot-form'
import type { KnowledgeBase, ExperienceStore } from '@/actions/bots'

interface PageProps {
  params: Promise<{ id: string }>
}

async function getKbsAndStores(): Promise<{ kbs: KnowledgeBase[]; stores: ExperienceStore[] }> {
  const db = getDb()
  const [kbRes, storeRes] = await Promise.all([
    db.from('knowledge_bases').select('id, name').order('name'),
    db.from('experience_stores').select('id, name').order('name'),
  ])
  return {
    kbs: (kbRes.data ?? []) as KnowledgeBase[],
    stores: (storeRes.data ?? []) as ExperienceStore[],
  }
}

export default async function BotPage({ params }: PageProps) {
  const { id } = await params

  if (id === 'new') {
    const { kbs, stores } = await getKbsAndStores()
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight">New Bot</h1>
          <p className="mt-1 text-sm text-muted-foreground">Configure and deploy a new bot.</p>
        </div>
        <BotForm kbs={kbs} stores={stores} isNew={true} />
      </div>
    )
  }

  const result = await getBot(id)
  if (!result) notFound()

  const { bot, config, kbs, assignedKbIds, stores } = result

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">{bot.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Edit bot configuration.</p>
      </div>
      <BotForm bot={bot} config={config ?? undefined} kbs={kbs} assignedKbIds={assignedKbIds} stores={stores} isNew={false} />
    </div>
  )
}

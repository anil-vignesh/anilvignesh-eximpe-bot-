'use client'

import { useRouter, usePathname } from 'next/navigation'
import { Select, SelectItem } from '@/components/ui/select'

interface Props {
  bots: { id: string; name: string }[]
  currentBotId?: string
}

export function BotFilterSelect({ bots, currentBotId }: Props) {
  const router = useRouter()
  const pathname = usePathname()

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const params = new URLSearchParams()
    if (e.target.value) params.set('botId', e.target.value)
    params.set('page', '1')
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <Select value={currentBotId ?? ''} onChange={handleChange} className="w-48">
      <SelectItem value="">All bots</SelectItem>
      {bots.map((bot) => (
        <SelectItem key={bot.id} value={bot.id}>
          {bot.name}
        </SelectItem>
      ))}
    </Select>
  )
}

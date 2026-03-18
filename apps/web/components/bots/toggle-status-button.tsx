'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { toggleBotStatus } from '@/actions/bots'

interface ToggleStatusButtonProps {
  botId: string
  currentStatus: string
}

export function ToggleStatusButton({ botId, currentStatus }: ToggleStatusButtonProps) {
  const [isPending, startTransition] = useTransition()
  const isActive = currentStatus === 'active'

  function handleClick(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    startTransition(async () => {
      try {
        await toggleBotStatus(botId, currentStatus)
        toast.success(`Bot ${isActive ? 'deactivated' : 'activated'}`)
      } catch (err) {
        toast.error('Failed to toggle status: ' + (err as Error).message)
      }
    })
  }

  return (
    <Button
      variant={isActive ? 'outline' : 'default'}
      size="sm"
      onClick={handleClick}
      disabled={isPending}
    >
      {isPending ? 'Updating...' : isActive ? 'Deactivate' : 'Activate'}
    </Button>
  )
}

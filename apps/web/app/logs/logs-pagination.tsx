'use client'

import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'

interface Props {
  currentPage: number
  totalPages: number
  botId?: string
}

export function LogsPagination({ currentPage, totalPages, botId }: Props) {
  function buildHref(page: number) {
    const params = new URLSearchParams()
    params.set('page', String(page))
    if (botId) params.set('botId', botId)
    return `/logs?${params.toString()}`
  }

  const linkClass = cn(buttonVariants({ variant: 'outline', size: 'sm' }))
  const disabledClass = cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'pointer-events-none opacity-50')

  return (
    <div className="mt-6 flex items-center justify-between">
      <p className="text-sm text-muted-foreground">
        Page {currentPage} of {totalPages}
      </p>
      <div className="flex gap-2">
        {currentPage > 1 ? (
          <Link href={buildHref(currentPage - 1)} className={linkClass}>
            <ChevronLeftIcon className="size-4" />
            Prev
          </Link>
        ) : (
          <span className={disabledClass}>
            <ChevronLeftIcon className="size-4" />
            Prev
          </span>
        )}
        {currentPage < totalPages ? (
          <Link href={buildHref(currentPage + 1)} className={linkClass}>
            Next
            <ChevronRightIcon className="size-4" />
          </Link>
        ) : (
          <span className={disabledClass}>
            Next
            <ChevronRightIcon className="size-4" />
          </span>
        )}
      </div>
    </div>
  )
}

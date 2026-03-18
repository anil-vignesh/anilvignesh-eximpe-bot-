'use client'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface StatusBadgeProps {
  status: string
}

export function StatusBadge({ status }: StatusBadgeProps) {
  switch (status) {
    case 'active':
    case 'indexed':
      return (
        <Badge className="bg-green-100 text-green-800 border border-green-200 ring-0">
          {status}
        </Badge>
      )
    case 'inactive':
    case 'pending':
      return <Badge variant="secondary">{status}</Badge>
    case 'error':
      return <Badge variant="destructive">{status}</Badge>
    case 'processing':
      return (
        <Badge className="bg-yellow-100 text-yellow-800 border border-yellow-200 ring-0">
          {status}
        </Badge>
      )
    case 'archived':
      return (
        <Badge className="bg-gray-100 text-gray-600 border border-gray-200 ring-0">
          {status}
        </Badge>
      )
    case 'flagged':
      return (
        <Badge className="bg-orange-100 text-orange-800 border border-orange-200 ring-0">
          {status}
        </Badge>
      )
    default:
      return <Badge variant="secondary">{status}</Badge>
  }
}

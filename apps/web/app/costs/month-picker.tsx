'use client'

import { useRouter } from 'next/navigation'
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props {
  year: number
  month: number
}

export function MonthPicker({ year, month }: Props) {
  const router = useRouter()

  function navigate(delta: number) {
    let m = month + delta
    let y = year
    if (m < 1)  { m = 12; y-- }
    if (m > 12) { m = 1;  y++ }
    router.push(`/costs?month=${y}-${String(m).padStart(2, '0')}`)
  }

  const label = new Date(year, month - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' })

  // Disable forward navigation past current month
  const now = new Date()
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="icon" onClick={() => navigate(-1)}>
        <ChevronLeftIcon className="size-4" />
      </Button>
      <span className="min-w-[140px] text-center text-sm font-medium">{label}</span>
      <Button variant="outline" size="icon" onClick={() => navigate(1)} disabled={isCurrentMonth}>
        <ChevronRightIcon className="size-4" />
      </Button>
    </div>
  )
}

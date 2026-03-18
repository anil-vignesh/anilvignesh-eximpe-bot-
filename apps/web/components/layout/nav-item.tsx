'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  SettingsIcon, BotIcon, DatabaseIcon, SparklesIcon, MessageSquareIcon, ScrollTextIcon,
} from 'lucide-react'

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  settings: SettingsIcon,
  bots: BotIcon,
  'knowledge-base': DatabaseIcon,
  'experience-store': SparklesIcon,
  'chat-assignments': MessageSquareIcon,
  logs: ScrollTextIcon,
}

interface NavItemProps {
  href: string
  label: string
}

export function NavItem({ href, label }: NavItemProps) {
  const pathname = usePathname()
  const isActive = pathname.startsWith(href)
  const key = href.replace('/', '')
  const Icon = ICON_MAP[key] ?? SettingsIcon

  return (
    <Link
      href={href}
      className={cn(
        'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
        isActive
          ? 'bg-accent text-accent-foreground'
          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
      )}
    >
      <Icon className="size-4 shrink-0" />
      {label}
    </Link>
  )
}

'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { DatabaseIcon, BookOpenIcon, MessagesSquareIcon, ScrollTextIcon, CircleDollarSignIcon } from 'lucide-react'

const NAV_ITEMS = [
  { href: '/knowledge-base', label: 'Knowledge Bases', icon: DatabaseIcon },
  { href: '/experience-store', label: 'Experience Stores', icon: BookOpenIcon },
  { href: '/chat-assignments', label: 'Chat Assignments', icon: MessagesSquareIcon },
  { href: '/logs', label: 'Logs', icon: ScrollTextIcon },
  { href: '/costs', label: 'Costs', icon: CircleDollarSignIcon },
]

export function AdminNav() {
  const pathname = usePathname()

  return (
    <nav className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex max-w-7xl items-center gap-1 px-4 py-2">
        <Link href="/" className="mr-4 text-sm font-bold tracking-tight text-foreground">
          Eximpe Admin
        </Link>
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive = pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-muted text-foreground'
                  : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
              )}
            >
              <Icon className="size-3.5" />
              {label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

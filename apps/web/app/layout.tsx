import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import { Toaster } from '@/components/ui/sonner'
import { NavItem } from '@/components/layout/nav-item'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'EximPe Bot Admin',
  description: 'EximPe Bot Admin Dashboard',
}

const NAV_ITEMS = [
  { href: '/settings', label: 'Settings' },
  { href: '/bots', label: 'Bots' },
  { href: '/knowledge-base', label: 'Knowledge Base' },
  { href: '/experience-store', label: 'Experience Store' },
  { href: '/chat-assignments', label: 'Chat Assignments' },
  { href: '/logs', label: 'Logs' },
]

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <div className="flex h-screen">
          <aside className="w-60 border-r bg-background flex flex-col shrink-0">
            <div className="px-4 py-5 border-b">
              <span className="text-sm font-bold tracking-tight">EximPe Bot</span>
            </div>
            <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
              {NAV_ITEMS.map((item) => (
                <NavItem key={item.href} href={item.href} label={item.label} />
              ))}
            </nav>
          </aside>
          <main className="flex-1 overflow-auto bg-background">
            {children}
          </main>
        </div>
        <Toaster />
      </body>
    </html>
  )
}

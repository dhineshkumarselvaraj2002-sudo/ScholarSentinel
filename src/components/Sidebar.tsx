'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/src/lib/utils'
import {
  Shield,
  LayoutDashboard,
  Menu,
  X,
  FileText,
  Search,
  Image,
  CheckCircle2,
} from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/src/components/ui/button'

interface NavItem {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  badge?: string
}

const mainNavItems: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
]

const checkModules: NavItem[] = [
  { href: '/reference-check', label: 'Reference Check', icon: Search },
  { href: '/content-check', label: 'Content Check', icon: CheckCircle2 },
  { href: '/diagram-checker', label: 'Diagram Check', icon: Image },
]

export function Sidebar() {
  const pathname = usePathname()
  const [isMobileOpen, setIsMobileOpen] = useState(false)

  const isActive = (href: string) => {
    if (href === '/dashboard') {
      return pathname === '/dashboard' || pathname === '/'
    }
    return pathname.startsWith(href)
  }

  const NavSection = ({
    title,
    items,
  }: {
    title: string
    items: NavItem[]
  }) => (
    <div className="space-y-1">
      <h3 className="px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        {title}
      </h3>
      {items.map((item) => {
        const Icon = item.icon
        const active = isActive(item.href)
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setIsMobileOpen(false)}
            className={cn(
              'flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors',
              active
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            )}
          >
            <Icon className="h-4 w-4" />
            <span>{item.label}</span>
            {item.badge && (
              <span className="ml-auto text-xs bg-primary/20 text-primary-foreground px-2 py-0.5 rounded">
                {item.badge}
              </span>
            )}
          </Link>
        )
      })}
    </div>
  )

  return (
    <>
      {/* Mobile menu button */}
      <div className="lg:hidden fixed top-4 left-4 z-50">
        <Button
          variant="outline"
          size="icon"
          onClick={() => setIsMobileOpen(!isMobileOpen)}
          className="bg-background"
        >
          {isMobileOpen ? (
            <X className="h-5 w-5" />
          ) : (
            <Menu className="h-5 w-5" />
          )}
        </Button>
      </div>

      {/* Mobile overlay */}
      {isMobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed left-0 top-0 z-40 h-full w-64 border-r bg-background transition-transform duration-300 lg:translate-x-0',
          isMobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        <div className="flex h-full flex-col">
          {/* Logo */}
          <div className="flex h-16 items-center border-b px-6">
            <Link
              href="/"
              className="flex items-center gap-2 text-xl font-bold"
              onClick={() => setIsMobileOpen(false)}
            >
              <Shield className="h-6 w-6 text-primary" />
              <span>Scholar Sentinel</span>
            </Link>
          </div>

          {/* Navigation */}
          <nav className="flex-1 space-y-6 overflow-y-auto p-4">
            {/* Main Navigation */}
            <NavSection title="Main" items={mainNavItems} />
            
            {/* Check Modules */}
            <NavSection title="Check Modules" items={checkModules} />
          </nav>

          {/* Footer */}
          <div className="border-t p-4">
            <p className="text-xs text-muted-foreground text-center">
              Diagram Forensics Engine
            </p>
          </div>
        </div>
      </aside>
    </>
  )
}


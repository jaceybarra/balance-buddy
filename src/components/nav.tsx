'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, ListChecks, Users, ShoppingCart, Swords, MessageSquare, Settings, ArrowLeftRight, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';

const PRIMARY = [
  { href: '/dashboard', label: 'Command', icon: Home },
  { href: '/actions', label: 'Actions', icon: ListChecks },
  { href: '/lineup', label: 'Lineup', icon: Users },
  { href: '/waivers', label: 'Waivers', icon: ShoppingCart },
  { href: '/ask', label: 'Ask GM', icon: MessageSquare },
];

const SECONDARY = [
  { href: '/matchups', label: 'Matchups', icon: Swords },
  { href: '/trades', label: 'Trades', icon: ArrowLeftRight },
  { href: '/exposure', label: 'Exposure', icon: Layers },
  { href: '/settings', label: 'Settings', icon: Settings },
];

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Bottom tab bar — the primary navigation on a phone. */
export function MobileNav() {
  const pathname = usePathname();
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur md:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label="Primary"
    >
      <ul className="grid grid-cols-5">
        {PRIMARY.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={cn(
                  'flex h-16 flex-col items-center justify-center gap-1 text-[10px] font-medium',
                  active ? 'text-primary' : 'text-muted-foreground',
                )}
                aria-current={active ? 'page' : undefined}
              >
                <Icon className="h-5 w-5" aria-hidden />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Desktop header navigation. */
export function DesktopNav() {
  const pathname = usePathname();
  const items = [...PRIMARY, ...SECONDARY];
  return (
    <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
      {items.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
              active ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
            aria-current={active ? 'page' : undefined}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Secondary links shown on mobile inside the dashboard, since the tab bar is full. */
export function MoreLinks() {
  return (
    <div className="flex flex-wrap gap-2 md:hidden">
      {SECONDARY.map((item) => {
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground"
          >
            <Icon className="h-3.5 w-3.5" aria-hidden />
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}

'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';

/** Tabs for switching between my two leagues on any league-scoped page. */
export function LeagueSwitcher({ leagues, active }: { leagues: { id: string; name: string }[]; active: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function select(id: string) {
    const next = new URLSearchParams(params.toString());
    next.set('league', id);
    router.push(`${pathname}?${next.toString()}`);
  }

  return (
    <div className="flex gap-1 rounded-lg bg-muted p-1" role="tablist">
      {leagues.map((league) => (
        <button
          key={league.id}
          type="button"
          role="tab"
          aria-selected={league.id === active}
          onClick={() => select(league.id)}
          className={cn(
            'flex-1 truncate rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
            league.id === active ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {league.name}
        </button>
      ))}
    </div>
  );
}

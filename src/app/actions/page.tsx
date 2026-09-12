import { prisma } from '@/lib/db';
import { toActionView, compareActions } from '@/lib/data/dashboard';
import { ActionCard } from '@/components/action-card';
import { Card } from '@/components/ui/card';
import { NoActionBadge } from '@/components/priority';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Action queue · Fantasy GM' };

/** Every open recommendation across both teams, most urgent first. */
export default async function ActionsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const filter = status === 'done' ? ['DONE'] : status === 'snoozed' ? ['SNOOZED'] : ['OPEN'];

  const rows = await prisma.action.findMany({
    where: { status: { in: filter } },
    include: { league: { select: { name: true } } },
  });
  const actions = rows.map(toActionView).sort(compareActions);

  const groups = [
    { key: 'CRITICAL', label: 'Critical', items: actions.filter((a) => a.severity === 'CRITICAL') },
    { key: 'HIGH', label: 'Action needed', items: actions.filter((a) => a.severity === 'HIGH') },
    { key: 'MEDIUM', label: 'Worth a look', items: actions.filter((a) => a.severity === 'MEDIUM') },
    { key: 'LOW', label: 'When you have time', items: actions.filter((a) => a.severity === 'LOW') },
  ].filter((g) => g.items.length > 0);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Action queue</h1>
        <p className="text-sm text-muted-foreground">
          {actions.length} {status === 'done' ? 'completed' : status === 'snoozed' ? 'snoozed' : 'open'} item
          {actions.length === 1 ? '' : 's'}
        </p>
        <nav className="flex gap-3 pt-1 text-xs">
          <a href="/actions" className={!status ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}>
            Open
          </a>
          <a href="/actions?status=snoozed" className={status === 'snoozed' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}>
            Snoozed
          </a>
          <a href="/actions?status=done" className={status === 'done' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}>
            Done
          </a>
        </nav>
      </header>

      {actions.length === 0 ? (
        <Card className="border-l-4 border-l-good p-4">
          <NoActionBadge />
          <p className="mt-2 text-sm">Nothing here. Both rosters are in good shape.</p>
        </Card>
      ) : (
        groups.map((group) => (
          <section key={group.key} className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{group.label}</h2>
            {group.items.map((action) => (
              <ActionCard key={action.id} action={action} />
            ))}
          </section>
        ))
      )}
    </div>
  );
}

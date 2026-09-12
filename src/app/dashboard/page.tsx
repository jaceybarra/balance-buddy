import Link from 'next/link';
import { getDashboardData } from '@/lib/data/dashboard';
import { ActionCard } from '@/components/action-card';
import { TeamCard } from '@/components/team-card';
import { MoreLinks } from '@/components/nav';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { NoActionBadge } from '@/components/priority';
import { Freshness } from '@/components/freshness';
import { relativeTime } from '@/lib/time';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'GM Command Center · Fantasy GM' };

/**
 * The home screen. One question: what do I need to do right now?
 * Actions first, teams second, everything else behind a tap.
 */
export default async function DashboardPage() {
  const data = await getDashboardData();
  const priority = data.actions.filter((a) => a.severity !== 'LOW');
  const later = data.actions.filter((a) => a.severity === 'LOW');
  const staleScopes = data.freshness.filter((f) => f.isStale);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="text-xs font-bold uppercase tracking-[0.25em] text-primary">Fantasy GM</p>
        <h1 className="text-2xl font-semibold tracking-tight">
          {priority.length === 0 ? "You're all set." : "Here's what needs your attention."}
        </h1>
        <p className="text-sm text-muted-foreground">
          Week {data.week} · {data.season} season
          {data.weekSource === 'SCHEDULE' ? ' · week derived from the schedule' : data.weekSource === 'PROVIDER' ? ' · week from provider' : ''}
        </p>
      </header>

      {/* The 3-second answer. */}
      <Card className="p-4">
        <div className="flex items-center gap-4">
          <div className="text-center">
            <p className="tabular text-4xl font-bold leading-none">{priority.length}</p>
            <p className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">
              action{priority.length === 1 ? '' : 's'}
            </p>
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            {data.teams.map((team) => (
              <Link
                key={team.ctx.team.id}
                href={`/team/${team.ctx.team.id}`}
                className="flex items-center justify-between gap-2 text-sm"
              >
                <span className="truncate">{team.ctx.team.name}</span>
                {team.actionCount > 0 ? (
                  <Badge variant={team.criticalCount > 0 ? 'critical' : 'action'} size="sm">
                    {team.actionCount}
                  </Badge>
                ) : (
                  <Badge variant="good" size="sm">
                    clear
                  </Badge>
                )}
              </Link>
            ))}
          </div>
        </div>
      </Card>

      {staleScopes.length > 0 ? (
        <Card className="border-l-4 border-l-watch p-3">
          <p className="text-sm font-medium text-watch">Some data is stale</p>
          <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
            {staleScopes.slice(0, 4).map((f) => (
              <li key={f.scope}>
                {f.label}: {f.lastSuccessAt ? `updated ${relativeTime(f.lastSuccessAt)}` : 'never synced'}
                {f.status === 'FAILED' ? ` — last attempt failed (${f.message ?? 'unknown error'})` : ''}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">
            Recommendations below still use the newest data available, but treat them with that in mind.
          </p>
        </Card>
      ) : null}

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Action queue</h2>
          <Link href="/actions" className="text-xs text-primary hover:underline">
            View all
          </Link>
        </div>

        {priority.length === 0 ? (
          <Card className="border-l-4 border-l-good p-4">
            <NoActionBadge />
            <p className="mt-2 text-sm">
              Both lineups look optimized and nothing on the wire beats what you have. Next scheduled check runs
              automatically.
            </p>
          </Card>
        ) : (
          priority.slice(0, 6).map((action) => <ActionCard key={action.id} action={action} />)
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Your teams</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {data.teams.map((team) => (
            <TeamCard key={team.ctx.team.id} summary={team} />
          ))}
        </div>
      </section>

      {data.exposure.entries.length > 0 ? (
        <Card className="p-4">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold">Cross-team exposure</h2>
            <Link href="/exposure" className="text-xs text-primary hover:underline">
              Details
            </Link>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{data.exposure.summary}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {data.exposure.entries.slice(0, 6).map((e) => (
              <Badge key={e.playerId} variant={e.starterOnBoth ? 'primary' : 'outline'}>
                {e.name}
              </Badge>
            ))}
          </div>
        </Card>
      ) : null}

      {later.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">When you have time</h2>
          {later.slice(0, 4).map((action) => (
            <ActionCard key={action.id} action={action} compact />
          ))}
        </section>
      ) : null}

      <div className="flex items-center justify-between gap-3 pt-2">
        <MoreLinks />
      </div>

      <Freshness
        at={data.freshness.find((f) => f.scope === 'ENGINE')?.lastSuccessAt}
        source="recommendation engine"
        prefix="Recommendations generated"
        stale={data.freshness.find((f) => f.scope === 'ENGINE')?.isStale}
      />
    </div>
  );
}

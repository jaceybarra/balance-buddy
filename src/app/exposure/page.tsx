import Link from 'next/link';
import { getAllContexts } from '@/lib/data/leagues';
import { buildExposureReport } from '@/lib/engine/exposure';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { pts } from '@/lib/utils';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Exposure · Fantasy GM' };

/**
 * Cross-team exposure. This page surfaces concentration; it deliberately does
 * not tell you to diversify, because owning a great player twice is often right.
 */
export default async function ExposurePage() {
  const contexts = await getAllContexts();
  const report = buildExposureReport(contexts);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Exposure</h1>
        <p className="text-sm text-muted-foreground">{report.summary}</p>
      </header>

      <Card className="p-4">
        <p className="text-sm">
          <span className="tabular text-2xl font-bold">{report.dependencyPct}%</span>{' '}
          <span className="text-muted-foreground">
            of your combined projected starting points come from players you own on both teams.
          </span>
        </p>
        <p className="mt-2 text-[13px] text-muted-foreground">
          High exposure is not automatically a problem. If a player is the best option in both leagues, owning him twice
          is the correct decision — this page just makes sure you know how much of your week rides on him.
        </p>
      </Card>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Shared players</h2>
        {report.entries.length === 0 ? (
          <Card className="p-4 text-sm text-muted-foreground">No player is on both rosters right now.</Card>
        ) : (
          report.entries.map((entry) => (
            <Card key={entry.playerId} className="p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/players/${entry.playerId}`} className="text-sm font-semibold hover:underline">
                  {entry.name}
                </Link>
                <span className="text-xs text-muted-foreground">
                  {entry.position}
                  {entry.nflTeamAbbr ? ` · ${entry.nflTeamAbbr}` : ''}
                </span>
                <Badge variant={entry.starterOnBoth ? 'primary' : 'outline'}>{entry.exposurePct}% of your teams</Badge>
                {!['HEALTHY', 'UNKNOWN'].includes(entry.injuryStatus) ? (
                  <Badge variant="watch">{entry.injuryStatus}</Badge>
                ) : null}
                <span className="tabular ml-auto text-sm font-semibold">{pts(entry.combinedProjection)}</span>
              </div>
              <p className="mt-2 text-[13px] text-muted-foreground">{entry.note}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {entry.teams.map((t) => (
                  <Badge key={`${entry.playerId}-${t.leagueId}`} variant="outline">
                    {t.teamName} · {t.slot}
                  </Badge>
                ))}
              </div>
            </Card>
          ))
        )}
      </section>

      {report.byeConcentration.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Bye week concentration</h2>
          {report.byeConcentration.slice(0, 4).map((bye) => (
            <Card key={bye.week} className="p-4">
              <p className="text-sm font-medium">
                Week {bye.week}: {bye.players.length} players across {bye.teams.length} team
                {bye.teams.length === 1 ? '' : 's'}
              </p>
              <p className="mt-1 text-[13px] text-muted-foreground">{bye.players.join(', ')}</p>
            </Card>
          ))}
        </section>
      ) : null}

      {report.injuryConcentration.length > 0 ? (
        <Card className="border-l-4 border-l-watch p-4">
          <h2 className="text-sm font-semibold">Injury concentration</h2>
          <p className="mt-1 text-[13px] text-muted-foreground">
            One status update moves both of your weeks: {report.injuryConcentration.map((e) => e.name).join(', ')}.
          </p>
        </Card>
      ) : null}
    </div>
  );
}

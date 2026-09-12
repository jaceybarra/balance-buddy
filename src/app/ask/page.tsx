import { AskPanel } from '@/components/ask-panel';
import { buildWeeklyBrief } from '@/lib/engine/brief';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Ask my GM · Fantasy GM' };

/** Conversational access to the same engines that build the action queue. */
export default async function AskPage() {
  const hasModel = Boolean(process.env.ANTHROPIC_API_KEY);
  const brief = await buildWeeklyBrief();

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Ask my GM</h1>
        <p className="text-sm text-muted-foreground">
          Answers come from your synced data and the recommendation engines — never from the model&apos;s memory.
        </p>
      </header>

      <AskPanel hasModel={hasModel} />

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Week {brief.week} GM brief
          </h2>
          <span className="text-[11px] text-muted-foreground">60-second read</span>
        </div>

        <Card className="p-4">
          <p className="text-sm font-medium">{brief.overall.headline}</p>
          <p className="mt-1 text-[13px] text-muted-foreground">{brief.exposureSummary}</p>
        </Card>

        {brief.teams.map((team) => (
          <Card key={team.leagueId} className="p-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="truncate text-sm font-semibold">{team.teamName}</h3>
              <span className="text-xs text-muted-foreground">{team.record}</span>
            </div>
            {team.matchup ? (
              <p className="tabular mt-1 text-sm">
                Projected {team.matchup.myProjected} vs {team.matchup.opponentProjected} ({team.matchup.opponentName}) ·{' '}
                {Math.round(team.matchup.winProbability * 100)}% win
              </p>
            ) : null}
            <p className="mt-1 text-[13px] text-muted-foreground">{team.strategy}</p>

            {team.actions.length > 0 ? (
              <ol className="mt-3 space-y-1.5 text-sm">
                {team.actions.map((a, i) => (
                  <li key={`${team.leagueId}-${i}`} className="flex gap-2">
                    <span className="tabular text-muted-foreground">{i + 1}.</span>
                    <span>
                      {a.recommendation}
                      {a.deadlineLabel ? <span className="text-[11px] text-muted-foreground"> — by {a.deadlineLabel}</span> : null}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <Badge variant="good" className="mt-3">
                NO ACTION
              </Badge>
            )}

            {team.noActionNote ? <p className="mt-2 text-[13px] text-muted-foreground">{team.noActionNote}</p> : null}
            {team.biggestRisk ? (
              <p className="mt-2 text-[13px] text-watch">Biggest risk: {team.biggestRisk}</p>
            ) : null}
          </Card>
        ))}

        {brief.topNews.length > 0 ? (
          <Card className="p-4">
            <h3 className="text-sm font-semibold">What changed</h3>
            <ul className="mt-2 space-y-2 text-[13px]">
              {brief.topNews.map((n) => (
                <li key={n.headline}>
                  <p className="font-medium">{n.headline}</p>
                  {n.interpretation ? <p className="text-muted-foreground">{n.interpretation}</p> : null}
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        {brief.staleWarnings.length > 0 ? (
          <Card className="border-l-4 border-l-watch p-4">
            <ul className="space-y-1 text-[13px] text-muted-foreground">
              {brief.staleWarnings.map((w) => (
                <li key={w}>• {w}</li>
              ))}
            </ul>
          </Card>
        ) : null}
      </section>
    </div>
  );
}

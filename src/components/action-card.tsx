import Link from 'next/link';
import { AlertTriangle, ArrowRight, Clock, ExternalLink } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PriorityBadge, priorityFor, toneRing } from '@/components/priority';
import { ConfidenceMeter } from '@/components/confidence';
import { ActionControls } from '@/components/action-controls';
import { countdown, gameTimeLabel } from '@/lib/time';
import { cn, pts, signedPts } from '@/lib/utils';
import type { ActionView } from '@/lib/data/dashboard';
import type { ActionType, Severity } from '@/lib/domain/enums';

/**
 * One recommendation. Always answers the same five questions:
 * what happened, why it matters, what to do, how confident, and by when.
 */
export function ActionCard({ action, compact = false }: { action: ActionView; compact?: boolean }) {
  const { tone } = priorityFor(action.severity, action.type as ActionType);
  const payload = (action.payload ?? {}) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

  return (
    <Card className={cn('border-l-4 animate-fade-in', toneRing(tone))}>
      <div className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <PriorityBadge severity={action.severity as Severity} type={action.type as ActionType} />
          <Badge variant="outline">{action.type}</Badge>
          {action.leagueName ? <span className="text-xs text-muted-foreground">{action.leagueName}</span> : null}
          {action.deadline ? (
            <span className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground tabular">
              <Clock className="h-3 w-3" aria-hidden />
              {countdown(action.deadline)}
            </span>
          ) : null}
        </div>

        <div>
          <h3 className="text-[15px] font-semibold leading-snug">{action.headline}</h3>
          <p className="mt-1 text-sm text-foreground/90">{action.recommendation}</p>
        </div>

        {!compact ? <p className="text-[13px] leading-relaxed text-muted-foreground">{action.reason}</p> : null}

        <SwapDetail payload={payload} />
        <ContingencySteps payload={payload} />
        <WaiverDetail payload={payload} />

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <ConfidenceMeter value={action.confidence} compact={compact} />
          <div className="flex items-center gap-2">
            {action.deadline ? (
              <span className="text-[11px] text-muted-foreground">Act by {gameTimeLabel(action.deadline)}</span>
            ) : null}
            {action.playerId ? (
              <Link
                href={`/players/${action.playerId}`}
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                Player <ArrowRight className="h-3 w-3" aria-hidden />
              </Link>
            ) : null}
          </div>
        </div>

        <ActionControls actionId={action.id} status={action.status} />
      </div>
    </Card>
  );
}

/* eslint-disable @typescript-eslint/no-explicit-any */

function SwapDetail({ payload }: { payload: Record<string, any> }) {
  if (!payload?.in) return null;
  const inPlayer = payload.in;
  const outPlayer = payload.out;
  return (
    <div className="grid gap-2 rounded-lg bg-muted/40 p-3 text-sm sm:grid-cols-2">
      <div>
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Start</p>
        <p className="font-medium">
          {inPlayer.name} <span className="tabular text-muted-foreground">{pts(inPlayer.projected)}</span>
        </p>
        <p className="text-[11px] text-muted-foreground">
          {inPlayer.position}
          {inPlayer.team ? ` · ${inPlayer.team}` : ''}
          {inPlayer.kickoffLabel ? ` · ${inPlayer.kickoffLabel}` : ''}
        </p>
      </div>
      {outPlayer ? (
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Bench</p>
          <p className="font-medium">
            {outPlayer.name} <span className="tabular text-muted-foreground">{pts(outPlayer.projected)}</span>
          </p>
          <p className="text-[11px] text-muted-foreground">
            {outPlayer.position}
            {outPlayer.team ? ` · ${outPlayer.team}` : ''}
            {outPlayer.kickoffLabel ? ` · ${outPlayer.kickoffLabel}` : ''}
          </p>
        </div>
      ) : null}
      {typeof payload.gain === 'number' ? (
        <p className="tabular text-xs text-good sm:col-span-2">
          Expected improvement {signedPts(payload.gain)} points
          {payload.tooClose ? ' — close enough to call it a coin flip' : ''}
        </p>
      ) : null}
    </div>
  );
}

function ContingencySteps({ payload }: { payload: Record<string, any> }) {
  const steps = payload?.steps as { label: string; condition: string; action: string }[] | undefined;
  if (!steps || steps.length === 0) return null;
  return (
    <ol className="space-y-2 rounded-lg bg-muted/40 p-3">
      {steps.map((step) => (
        <li key={step.label} className="text-[13px]">
          <span className="font-semibold text-foreground">{step.label}</span>
          <span className="text-muted-foreground"> — if {step.condition.toLowerCase()}: </span>
          <span>{step.action}</span>
        </li>
      ))}
    </ol>
  );
}

function WaiverDetail({ payload }: { payload: Record<string, any> }) {
  if (!payload?.add) return null;
  const evidence = (payload.evidence as string[] | undefined) ?? [];
  return (
    <div className="rounded-lg bg-muted/40 p-3 text-sm">
      <p className="font-medium">
        Add {payload.add.name}
        {payload.drop ? ` · Drop ${payload.drop.name}` : ' · no drop needed'}
      </p>
      {typeof payload.lineupGain === 'number' ? (
        <p className="tabular text-xs text-muted-foreground">
          This week {signedPts(payload.lineupGain)} · Rest of season {signedPts(payload.rosGain)}/wk
        </p>
      ) : null}
      {evidence.length > 0 ? (
        <ul className="mt-2 space-y-0.5 text-[12px] text-muted-foreground">
          {evidence.slice(0, 4).map((e) => (
            <li key={e}>• {e}</li>
          ))}
        </ul>
      ) : null}
      {payload.speculative ? (
        <p className="mt-2 inline-flex items-center gap-1 text-[11px] text-watch">
          <AlertTriangle className="h-3 w-3" aria-hidden /> Speculative — upside bet, not a starter today
        </p>
      ) : null}
    </div>
  );
}

/** Links out to ESPN, since the app never submits transactions itself. */
export function EspnLink({ href, label = 'Open in ESPN' }: { href: string; label?: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
    >
      {label} <ExternalLink className="h-3 w-3" aria-hidden />
    </a>
  );
}

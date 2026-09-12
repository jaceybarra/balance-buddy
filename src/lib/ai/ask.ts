import 'server-only';
import { buildAskEvidence, type AskEvidence, type Citation } from './retrieval';
import { relativeTime } from '../time';

export interface AskAnswer {
  question: string;
  answer: string;
  /** Bullet points the UI renders under the prose. */
  details: string[];
  citations: Citation[];
  gaps: string[];
  /** "LLM" when Claude wrote the prose, "DETERMINISTIC" when the app did. */
  explanationLayer: 'LLM' | 'DETERMINISTIC';
  intent: string;
  week: number;
  asOf: Date;
}

const SYSTEM_PROMPT = `You are the explanation layer of a fantasy football decision-support app.

ABSOLUTE RULES:
1. The JSON evidence block is your ONLY source of facts. Never state an injury,
   roster spot, projection, free agent, statistic, news item, opponent, or
   kickoff time that is not in it.
2. Never override a recommendation in the evidence. The deterministic engine
   decides; you explain. If the evidence says start player A, you say start A.
3. If the evidence does not contain what the question needs, say exactly what is
   missing and what the user should refresh. Do not fill the gap from memory.
4. Numbers must be copied from the evidence, never estimated.
5. Be direct and brief: what to do, why, how confident, and by when. No preamble,
   no hedging filler, no restating the question.
6. Mention uncertainty when the evidence marks something as close, low
   confidence, estimated, or stale.

Write 2-5 sentences of plain prose. Do not use markdown headers.`;

/**
 * Answer a question about my teams.
 *
 * Pipeline: retrieve real data -> run the deterministic engines -> (optionally)
 * have an LLM phrase the result. With no API key configured the app still
 * answers, it just uses templated prose instead of generated prose.
 */
export async function askGm(question: string, now: Date = new Date()): Promise<AskAnswer> {
  const evidence = await buildAskEvidence(question, now);
  const deterministic = deterministicAnswer(evidence);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { ...deterministic, explanationLayer: 'DETERMINISTIC' };
  }

  try {
    const prose = await callClaude(apiKey, question, evidence);
    return { ...deterministic, answer: prose, explanationLayer: 'LLM' };
  } catch {
    // An LLM failure must never lose the answer — fall back to the engine's own words.
    return {
      ...deterministic,
      answer: `${deterministic.answer}\n\n(The AI explanation layer was unavailable, so this is the engine's own summary.)`,
      explanationLayer: 'DETERMINISTIC',
    };
  }
}

async function callClaude(apiKey: string, question: string, evidence: AskEvidence): Promise<string> {
  const model = process.env.ASK_MODEL ?? 'claude-sonnet-5';
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 700,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Question: ${question}\n\nEvidence (the only facts you may use):\n${JSON.stringify(
            { week: evidence.week, asOf: evidence.asOf, ...evidence.facts, dataGaps: evidence.gaps },
            null,
            1,
          ).slice(0, 60_000)}`,
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic API ${res.status}`);
  const json = (await res.json()) as { content?: { type: string; text?: string }[] };
  const text = (json.content ?? [])
    .filter((c) => c.type === 'text')
    .map((c) => c.text ?? '')
    .join('\n')
    .trim();
  if (!text) throw new Error('Empty response');
  return text;
}

/**
 * The engine's own answer. This is the source of truth; the LLM only rewrites it.
 */
function deterministicAnswer(evidence: AskEvidence): Omit<AskAnswer, 'explanationLayer'> {
  const details: string[] = [];
  const lines: string[] = [];
  const f = evidence.facts as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

  switch (evidence.intent) {
    case 'START_SIT':
    case 'FLEX': {
      for (const lineup of f.lineups ?? []) {
        if (lineup.swaps.length === 0) {
          lines.push(`${lineup.leagueName}: your lineup is already optimal (${lineup.optimalProjected} projected).`);
        } else {
          for (const swap of lineup.swaps) {
            lines.push(
              swap.tooClose
                ? `${lineup.leagueName}: ${swap.start} and ${swap.bench} are effectively tied (${swap.gain} points apart) — either is defensible.`
                : `${lineup.leagueName}: start ${swap.start}${swap.bench ? ` over ${swap.bench}` : ''} at ${swap.slot} (+${swap.gain}, ${Math.round(
                    swap.confidence * 100,
                  )}% confidence).`,
            );
            details.push(`${swap.start}: ${swap.reason}`);
          }
        }
        details.push(`${lineup.leagueName} strategy — ${lineup.strategyRationale}`);
      }
      break;
    }
    case 'WAIVER': {
      for (const league of f.waivers ?? []) {
        const top = league.targets?.[0];
        if (!top) {
          lines.push(`${league.leagueName}: nothing on the wire beats what you already have.`);
          continue;
        }
        lines.push(
          `${league.leagueName}: add ${top.add} (${top.position}${top.team ? ` - ${top.team}` : ''})${
            top.drop ? `, drop ${top.drop}` : ' — you have an open roster spot'
          }. Priority ${top.priority}.`,
        );
        for (const t of league.targets.slice(0, 3)) {
          details.push(`${t.add}: +${t.lineupGain} to this week's lineup, +${t.rosGainPerWeek}/wk rest-of-season. ${t.evidence.slice(0, 2).join(', ')}`);
        }
      }
      break;
    }
    case 'DROP': {
      for (const league of f.waivers ?? []) {
        const withDrop = (league.targets ?? []).find((t: any) => t.drop); // eslint-disable-line @typescript-eslint/no-explicit-any
        if (withDrop) {
          lines.push(`${league.leagueName}: the cleanest drop is ${withDrop.drop}, and the add that justifies it is ${withDrop.add}.`);
        } else {
          lines.push(`${league.leagueName}: nothing worth adding, so nothing worth dropping.`);
        }
        for (const w of league.weaknesses ?? []) details.push(`${league.leagueName} weakness — ${w.note}`);
      }
      break;
    }
    case 'WEAKNESS':
    case 'COMPARE_TEAMS': {
      for (const m of f.metrics ?? []) {
        const starter = m.metrics.find((x: any) => x.label === 'Starter strength'); // eslint-disable-line @typescript-eslint/no-explicit-any
        const depth = m.metrics.find((x: any) => x.label === 'Bench depth'); // eslint-disable-line @typescript-eslint/no-explicit-any
        lines.push(`${m.leagueName}: starters ${starter?.value ?? 'n/a'}, bench depth ${depth?.value ?? 'n/a'}.`);
        for (const metric of m.metrics) details.push(`${m.leagueName} — ${metric.label}: ${metric.value}. ${metric.explanation}`);
      }
      break;
    }
    case 'CHANGES': {
      const news = f.news ?? [];
      if (news.length === 0) lines.push('No news since the last refresh affects either roster.');
      for (const n of news.slice(0, 4)) {
        lines.push(`${n.headline} (${n.ago}).`);
        if (n.soWhat) details.push(n.soWhat);
      }
      break;
    }
    case 'TODO':
    default: {
      const queue = f.actionQueue ?? [];
      if (queue.length === 0) {
        lines.push('Nothing needs your attention right now.');
      } else {
        const critical = queue.filter((a: any) => ['CRITICAL', 'HIGH'].includes(a.severity)); // eslint-disable-line @typescript-eslint/no-explicit-any
        lines.push(
          `${critical.length || queue.length} thing${(critical.length || queue.length) === 1 ? '' : 's'} to handle: ${(critical.length ? critical : queue)
            .slice(0, 3)
            .map((a: any) => a.headline) // eslint-disable-line @typescript-eslint/no-explicit-any
            .join('; ')}.`,
        );
        for (const a of queue.slice(0, 5)) {
          details.push(`[${a.severity}] ${a.league ?? ''} ${a.recommendation}${a.deadline ? ` — by ${a.deadline}` : ''}`);
        }
      }
      for (const c of f.contingencies ?? []) {
        details.push(`${c.player} (${c.status}) — ${c.steps.map((s: any) => `${s.label}: ${s.action}`).join(' | ')}`); // eslint-disable-line @typescript-eslint/no-explicit-any
      }
      break;
    }
  }

  if (f.focusPlayers) {
    for (const p of f.focusPlayers as any[]) { // eslint-disable-line @typescript-eslint/no-explicit-any
      details.push(
        `${p.name} (${p.league}): ${p.projectedPoints ?? 'no'} projected, floor ${p.floor ?? '-'} / ceiling ${p.ceiling ?? '-'}, ${p.injuryStatus.toLowerCase()}${
          p.opponent ? `, vs ${p.opponent} ${p.kickoff}` : ''
        }. Source ${p.projectionSource ?? 'none'}${p.projectionUpdatedAt ? `, updated ${relativeTime(p.projectionUpdatedAt)}` : ''}.`,
      );
    }
  }

  if (lines.length === 0) lines.push('I could not find data to answer that. Try refreshing, or ask about a specific player or league.');

  return {
    question: evidence.question,
    answer: lines.join(' '),
    details,
    citations: evidence.citations,
    gaps: evidence.gaps,
    intent: evidence.intent,
    week: evidence.week,
    asOf: evidence.asOf,
  };
}

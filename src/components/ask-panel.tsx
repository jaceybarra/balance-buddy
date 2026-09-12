'use client';

import { useState } from 'react';
import { Send, Sparkles } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { relativeTime } from '@/lib/time';

interface Answer {
  answer: string;
  details: string[];
  citations: { label: string; source: string; updatedAt: string | null; stale: boolean }[];
  gaps: string[];
  explanationLayer: 'LLM' | 'DETERMINISTIC';
  intent: string;
  week: number;
  error?: string;
}

const SUGGESTIONS = [
  'What should I do before Sunday?',
  'Who should I start this week?',
  'Who should I flex?',
  'Who should I pick up?',
  "What's my biggest weakness?",
  'Which team is stronger?',
  'Anything changed today?',
];

/**
 * Ask My GM.
 * The answer is produced by the deterministic engines; the language model (when
 * configured) only rewrites it. Every answer shows what data it stands on.
 */
export function AskPanel({ hasModel }: { hasModel: boolean }) {
  const [question, setQuestion] = useState('');
  const [history, setHistory] = useState<{ q: string; a: Answer }[]>([]);
  const [busy, setBusy] = useState(false);

  async function ask(text: string) {
    if (!text.trim()) return;
    setBusy(true);
    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question: text }),
      });
      const json = (await res.json()) as Answer;
      setHistory((prev) => [{ q: text, a: json }, ...prev]);
      setQuestion('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(question);
        }}
        className="flex gap-2"
      >
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask about your teams…"
          className="flex-1 rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
          aria-label="Question"
        />
        <Button type="submit" disabled={busy || !question.trim()} size="icon" aria-label="Ask">
          <Send className="h-4 w-4" />
        </Button>
      </form>

      <div className="flex flex-wrap gap-1.5">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => ask(s)}
            disabled={busy}
            className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
          >
            {s}
          </button>
        ))}
      </div>

      {!hasModel ? (
        <p className="text-[11px] text-muted-foreground">
          No ANTHROPIC_API_KEY configured, so answers are written by the recommendation engine itself. The engine is the
          source of truth either way — the model only rephrases it.
        </p>
      ) : null}

      {busy ? <Card className="p-4 text-sm text-muted-foreground">Retrieving your data…</Card> : null}

      {history.map((entry, idx) => (
        <Card key={`${entry.q}-${idx}`} className="p-4">
          <p className="text-sm font-medium">{entry.q}</p>
          {entry.a.error ? (
            <p className="mt-2 text-sm text-critical">{entry.a.error}</p>
          ) : (
            <>
              <p className="mt-2 whitespace-pre-line text-sm">{entry.a.answer}</p>
              {entry.a.details.length > 0 ? (
                <ul className="mt-3 space-y-1 text-[13px] text-muted-foreground">
                  {entry.a.details.slice(0, 8).map((d, i) => (
                    <li key={i}>• {d}</li>
                  ))}
                </ul>
              ) : null}
              {entry.a.gaps.length > 0 ? (
                <div className="mt-3 rounded-lg bg-watch/10 p-2.5">
                  <p className="text-[11px] font-medium text-watch">Data gaps that affect this answer</p>
                  <ul className="mt-1 space-y-0.5 text-[11px] text-muted-foreground">
                    {entry.a.gaps.map((g) => (
                      <li key={g}>• {g}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <Badge variant={entry.a.explanationLayer === 'LLM' ? 'primary' : 'outline'}>
                  <Sparkles className="h-3 w-3" aria-hidden />
                  {entry.a.explanationLayer === 'LLM' ? 'AI phrasing' : 'engine phrasing'}
                </Badge>
                <Badge variant="outline">{entry.a.intent}</Badge>
                {entry.a.citations
                  .filter((c) => c.updatedAt)
                  .slice(0, 4)
                  .map((c) => (
                    <span key={c.label} className={`text-[10px] ${c.stale ? 'text-watch' : 'text-muted-foreground'}`}>
                      {c.label}: {relativeTime(c.updatedAt)}
                    </span>
                  ))}
              </div>
            </>
          )}
        </Card>
      ))}
    </div>
  );
}

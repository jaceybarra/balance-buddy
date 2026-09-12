'use client';

import { useState } from 'react';
import { Upload } from 'lucide-react';
import { Card } from '@/components/ui/card';

/** Manual projection import — the documented fallback when no feed is wired up. */
export function CsvUpload() {
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setStatus(null);
    try {
      const csv = await file.text();
      const res = await fetch('/api/projections/csv', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ csv }),
      });
      const json = await res.json();
      if (!res.ok) {
        setStatus(json.error ?? 'Import failed');
      } else {
        const parts = [`Imported ${json.imported} projections for week ${json.week}.`];
        if (json.unmatched?.length) parts.push(`Could not match: ${json.unmatched.slice(0, 6).join(', ')}.`);
        if (json.warnings?.length) parts.push(json.warnings.join(' '));
        if (json.ignoredColumns?.length) parts.push(`Ignored columns: ${json.ignoredColumns.join(', ')}.`);
        setStatus(parts.join(' '));
      }
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setBusy(false);
      event.target.value = '';
    }
  }

  return (
    <Card className="p-4">
      <h3 className="text-sm font-semibold">Import projections (CSV)</h3>
      <p className="mt-1 text-[13px] text-muted-foreground">
        Include a <code className="text-xs">name</code> column plus stat columns such as{' '}
        <code className="text-xs">recYards, rec, recTD, rushYards, rushTD, passYards, passTD</code>. Stat columns let
        each league price the same projection with its own scoring — a bare points column can&apos;t be re-priced.
      </p>
      <label className="mt-3 inline-flex h-8 cursor-pointer items-center gap-2 rounded-md border border-border px-3 text-xs font-medium hover:bg-accent">
        <input type="file" accept=".csv,text/csv" onChange={onFile} className="sr-only" disabled={busy} />
        <Upload className="h-3.5 w-3.5" aria-hidden />
        {busy ? 'Importing…' : 'Choose CSV'}
      </label>
      {status ? <p className="mt-2 text-[13px] text-muted-foreground">{status}</p> : null}
    </Card>
  );
}

// Documented gaps: what the source does NOT say about work it does record.
// Every gap is derived from an absence in the text, never from an inference about
// how the work is going. "No update since July" is not evidence that it stalled.

export function deriveGaps(ds) {
  const gaps = [];
  const push = (type, c, message) => gaps.push({ type, contributionId: c.id, title: c.title, message });

  for (const c of ds.contributions) {
    if (c.overridden === 'suppressed') continue;

    if (c.status === 'completed' && c.kind === 'deliverable' && !c.outcome) {
      push('outcome_not_documented', c,
        'Implementation recorded; no result is documented in the source.');
    }

    if (c.outcome) {
      const attached = ds.metrics.filter((m) => m.contributionId === c.id && !m.repeatOf);
      const measured = attached.filter((m) => m.kind === 'achieved');
      if (measured.length === 0) {
        const kinds = [...new Set(attached.map((m) => m.kind))];
        push('outcome_not_measured', c, kinds.length
          ? `An outcome is described, but the only numbers attached are ${kinds.map(kindWord).join(' and ')} - no measured result.`
          : 'An outcome is described in words; no number is recorded for it.');
      }
    }

    if (c.role === 'unclear') {
      push('role_unclear', c, 'The source does not say whether this was led, co-owned or contributed to.');
    }

    if (c.nextSteps.length && c.status !== 'completed') {
      push('next_step_open', c, `Documented next step, with no later update in the source: ${c.nextSteps[0]}`);
    }

    if (c.status === 'proposed') {
      push('proposal_not_followed_up', c, 'Discussed in the source; no record of it being implemented.');
    }
  }
  return gaps;
}

function kindWord(k) {
  return { estimate: 'reported estimates', target: 'targets', context: 'customer context', achieved: 'achieved results' }[k] ?? k;
}

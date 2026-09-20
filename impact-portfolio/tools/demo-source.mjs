// SYNTHETIC demo content. Every name, date, number and quote below is invented.
// It exists so the dashboard can be explored before a real PDF exists, and so the
// reconciliation rules have something to be tested against.
//
// It is written as two *imports* of a cumulative document so that the demo exercises:
//   duplicate detection · Gemini/Zoom overlap · restated metrics · a metric conflict
//   · a record that disappears from a later export · pagination shift · partial months.

const CUSTOMERS = [
  { id: 'c1', name: 'Northwind Regional Health (demo)' },
  { id: 'c2', name: 'Cedar Valley Clinics (demo)' },
  { id: 'c3', name: 'Meridian Health Partners (demo)' }
];

const PROJECTS = [
  { id: 'p1', name: 'Intake triage automation', customerId: 'c1' },
  { id: 'p2', name: 'Quarterly business review programme', customerId: 'c2' },
  { id: 'p3', name: 'EHR integration remediation', customerId: 'c3' },
  { id: 'p4', name: 'Onboarding playbook refresh', customerId: null }
];

const ex = (id, page, source, period, text) => ({
  id, page, sourceLabel: source, sectionId: `s${String(page).padStart(3, '0')}`,
  reportingPeriod: period, text
});

/* =========================================================== IMPORT 1 (May–Jul) */

export const import1 = {
  isCumulative: true,
  datesCovered: { start: '2026-05-08', end: '2026-07-17' },
  documentedPeriods: [
    '2026-05-08', '2026-05-15', '2026-05-22', '2026-05-29',
    '2026-06-05', '2026-06-12', '2026-06-19', '2026-06-26',
    '2026-07-03', '2026-07-17'
  ],
  unreadableSections: [],
  unresolvedSections: ['s041: two bullet lines ran together in the export; wording is ambiguous'],
  customers: CUSTOMERS,
  projects: PROJECTS,
  excerpts: [
    ex('e1', 3, 'gemini', '2026-05-08',
      'Week of May 8: Ran the intake triage discovery session with Northwind Regional Health. Mapped the current referral queue and identified three handoff points that were causing rework.'),
    ex('e2', 3, 'zoom', '2026-05-08',
      'Zoom AI summary - Northwind intake discovery (May 8). Participants walked through the referral queue. The TSM documented three handoff points causing rework and agreed to draft a proposed triage flow.'),
    ex('e3', 6, 'gemini', '2026-05-15',
      'Week of May 15: Drafted and shared the proposed triage flow with the Northwind operations lead. Discussed automating follow-up reminders; no decision was made.'),
    ex('e4', 9, 'zoom', '2026-05-22',
      'Zoom AI - Northwind working session (May 22). Customer noted they handle approximately 200,000 inbound calls per month across their contact centre.'),
    ex('e5', 11, 'gemini', '2026-05-29',
      'Week of May 29: Built and deployed the triage routing workflow in the customer sandbox. Northwind operations estimated it saves about two hours per week for each of the four intake coordinators.'),
    ex('e6', 14, 'gemini', '2026-06-05',
      'Week of June 5: Led the Cedar Valley QBR preparation. Assembled the usage narrative and the renewal risk summary for the account team.'),
    ex('e7', 16, 'zoom', '2026-06-05',
      'Zoom AI - Cedar Valley QBR prep (June 5). The TSM led the working session, presented the usage narrative and walked the account team through renewal risks.'),
    ex('e8', 19, 'gemini', '2026-06-12',
      'Week of June 12: Delivered the Cedar Valley quarterly business review. Customer confirmed the adoption plan for the next quarter.'),
    ex('e9', 22, 'zoom', '2026-06-19',
      'Zoom AI - Meridian integration triage (June 19). Reviewed 7 failed HL7 message batches with the customer integration engineer. Agreed a remediation checklist. Ownership of the fix stayed with the customer engineering team.'),
    ex('e10', 25, 'gemini', '2026-06-26',
      'Week of June 26: The triage routing workflow reduced repeat handoffs on the Northwind referral queue. Operations reported the workflow now saves about two hours per week per coordinator.'),
    ex('e11', 28, 'gemini', '2026-07-03',
      'Week of July 3: Contributed to the onboarding playbook refresh. Wrote the healthcare-specific security review section. Target is a first response within 24 hours for new accounts.'),
    ex('e12', 31, 'zoom', '2026-07-17',
      'Zoom AI - Meridian follow-up (July 17). Three of the seven failed batches were resolved. Remaining four are blocked on a customer-side schema change. Next step: customer to confirm schema owner.'),
    ex('e13', 33, 'gemini', '2026-07-17',
      'Week of July 17: Learning - pushing a remediation plan without a named owner on the customer side stalls the work. Applied this by asking for a named schema owner before the next Meridian session.')
  ],
  contributions: [
    {
      title: 'Intake triage discovery session with Northwind',
      kind: 'activity', status: 'completed', role: 'contributed', roleClaim: 'needs_clarification',
      customerId: 'c1', projectId: 'p1', milestoneOf: 'p1',
      workWeek: { start: '2026-05-04', end: '2026-05-10' }, datePrecision: 'week',
      reportingPeriod: 'Week of 2026-05-08',
      problem: 'Referral queue rework was not understood; handoff points were undocumented.',
      action: 'Ran the discovery session and mapped the current referral queue.',
      deliverable: 'Documented map of three handoff points causing rework.',
      outcome: null, businessRelevance: 'Establishes the baseline the later triage work is measured against.',
      businessRelevanceClaim: 'interpretation',
      supportingFacts: ['Source states three handoff points causing rework were identified in this session.'],
      skills: ['process mapping', 'customer discovery'], lessons: [], nextSteps: ['Draft a proposed triage flow'],
      confidence: 'high', evidence: ['e1', 'e2'], sources: ['gemini', 'zoom']
    },
    {
      title: 'Proposed triage flow shared with Northwind operations',
      kind: 'deliverable', status: 'completed', role: 'contributed', roleClaim: 'stated_in_source',
      customerId: 'c1', projectId: 'p1', milestoneOf: 'p1',
      workWeek: { start: '2026-05-11', end: '2026-05-17' }, datePrecision: 'week',
      reportingPeriod: 'Week of 2026-05-15',
      problem: 'No agreed routing design for the referral queue.',
      action: 'Drafted the triage flow and shared it with the operations lead.',
      deliverable: 'Proposed triage flow document.',
      outcome: null, businessRelevance: null,
      skills: ['solution design'], lessons: [], nextSteps: [],
      confidence: 'high', evidence: ['e3'], sources: ['gemini']
    },
    {
      title: 'Automating follow-up reminders (discussed only)',
      kind: 'activity', status: 'proposed', role: 'contributed', roleClaim: 'stated_in_source',
      customerId: 'c1', projectId: 'p1',
      workWeek: { start: '2026-05-11', end: '2026-05-17' }, datePrecision: 'week',
      reportingPeriod: 'Week of 2026-05-15',
      problem: 'Follow-up reminders are manual.',
      action: 'Raised automating follow-up reminders in the working session.',
      deliverable: null, outcome: null,
      businessRelevance: null,
      skills: [], lessons: [], nextSteps: [],
      confidence: 'high', evidence: ['e3'], sources: ['gemini'],
      flags: ['proposal_only']
    },
    {
      title: 'Triage routing workflow deployed to Northwind sandbox',
      kind: 'deliverable', status: 'completed', role: 'led', roleClaim: 'needs_clarification',
      customerId: 'c1', projectId: 'p1', milestoneOf: 'p1',
      workWeek: { start: '2026-05-25', end: '2026-05-31' }, datePrecision: 'week',
      reportingPeriod: 'Week of 2026-05-29',
      problem: 'Three handoff points were causing rework in the referral queue.',
      action: 'Built the triage routing workflow and deployed it to the customer sandbox.',
      deliverable: 'Triage routing workflow running in the Northwind sandbox.',
      outcome: 'Operations reported an estimated saving of about two hours per week per intake coordinator.',
      outcomeClaim: 'stated_in_source',
      businessRelevance: 'Reduces manual handling in the referral queue for four coordinators.',
      businessRelevanceClaim: 'interpretation',
      supportingFacts: ['Source states four intake coordinators.', 'Source states the workflow was deployed to the sandbox.'],
      skills: ['workflow automation'], lessons: [], nextSteps: [],
      confidence: 'high', evidence: ['e5'], sources: ['gemini']
    },
    {
      title: 'Cedar Valley QBR preparation',
      kind: 'deliverable', status: 'completed', role: 'led', roleClaim: 'stated_in_source',
      customerId: 'c2', projectId: 'p2', milestoneOf: 'p2',
      workWeek: { start: '2026-06-01', end: '2026-06-07' }, datePrecision: 'week',
      reportingPeriod: 'Week of 2026-06-05',
      problem: 'The account team had no consolidated usage or renewal-risk view ahead of the QBR.',
      action: 'Led the preparation session and assembled the usage narrative and renewal risk summary.',
      deliverable: 'QBR usage narrative and renewal risk summary.',
      outcome: null,
      businessRelevance: 'Supports renewal decision-making for the account team.',
      businessRelevanceClaim: 'interpretation',
      supportingFacts: ['Source states a renewal risk summary was produced for the account team.'],
      skills: ['account strategy', 'executive communication'], lessons: [], nextSteps: [],
      confidence: 'high', evidence: ['e6', 'e7'], sources: ['gemini', 'zoom']
    },
    {
      title: 'Cedar Valley quarterly business review delivered',
      kind: 'deliverable', status: 'completed', role: 'contributed', roleClaim: 'needs_clarification',
      customerId: 'c2', projectId: 'p2', milestoneOf: 'p2',
      workWeek: { start: '2026-06-08', end: '2026-06-14' }, datePrecision: 'week',
      reportingPeriod: 'Week of 2026-06-12',
      problem: null,
      action: 'Delivered the quarterly business review to the customer.',
      deliverable: 'Quarterly business review session.',
      outcome: 'Customer confirmed the adoption plan for the next quarter.',
      outcomeClaim: 'stated_in_source',
      businessRelevance: null,
      skills: ['executive communication'], lessons: [], nextSteps: [],
      confidence: 'high', evidence: ['e8'], sources: ['gemini']
    },
    {
      title: 'Meridian HL7 batch failure triage',
      kind: 'activity', status: 'in_progress', role: 'contributed', roleClaim: 'stated_in_source',
      customerId: 'c3', projectId: 'p3', milestoneOf: 'p3',
      workWeek: { start: '2026-06-15', end: '2026-06-21' }, datePrecision: 'week',
      reportingPeriod: 'Week of 2026-06-19',
      problem: 'Seven HL7 message batches were failing.',
      action: 'Reviewed the failed batches with the customer integration engineer and agreed a remediation checklist.',
      deliverable: 'Remediation checklist.',
      outcome: null,
      businessRelevance: null,
      skills: ['integration troubleshooting'], lessons: [],
      nextSteps: ['Customer engineering team owns the fix'],
      confidence: 'high', evidence: ['e9'], sources: ['zoom'],
      flags: ['ownership_customer_side']
    },
    {
      title: 'Healthcare security review section of the onboarding playbook',
      kind: 'deliverable', status: 'completed', role: 'contributed', roleClaim: 'stated_in_source',
      customerId: null, projectId: 'p4', milestoneOf: 'p4',
      workWeek: { start: '2026-06-29', end: '2026-07-05' }, datePrecision: 'week',
      reportingPeriod: 'Week of 2026-07-03',
      problem: 'The onboarding playbook had no healthcare-specific security review step.',
      action: 'Wrote the healthcare-specific security review section.',
      deliverable: 'Security review section of the onboarding playbook.',
      outcome: null, businessRelevance: null,
      skills: ['healthcare compliance', 'technical writing'], lessons: [], nextSteps: [],
      confidence: 'medium', evidence: ['e11'], sources: ['gemini']
    },
    {
      title: 'Meridian remediation follow-up',
      kind: 'activity', status: 'in_progress', role: 'contributed', roleClaim: 'stated_in_source',
      customerId: 'c3', projectId: 'p3', milestoneOf: 'p3',
      workWeek: { start: '2026-07-13', end: '2026-07-19' }, datePrecision: 'week',
      reportingPeriod: 'Week of 2026-07-17',
      problem: 'Four of seven failed batches remained unresolved.',
      action: 'Ran the follow-up session and confirmed the blocking schema change.',
      deliverable: null,
      outcome: 'Three of seven failed batches were resolved; four remain blocked on a customer-side schema change.',
      outcomeClaim: 'stated_in_source',
      businessRelevance: null,
      skills: ['integration troubleshooting'], lessons: [],
      nextSteps: ['Customer to confirm the schema owner'],
      confidence: 'high', evidence: ['e12'], sources: ['zoom']
    }
  ],
  metrics: [
    {
      label: 'Inbound calls handled by the customer contact centre',
      value: 200000, unit: 'calls', period: 'per month', scope: "Northwind's contact centre",
      measures: 'Total inbound call volume across the customer contact centre',
      kind: 'context', owner: 'customer', claim: 'stated_in_source',
      customerId: 'c1', aggregatable: false, evidence: ['e4'], sources: ['zoom']
    },
    {
      label: 'Time saved per intake coordinator',
      value: 2, valueText: 'about two hours', unit: 'hours per week', period: 'per week',
      scope: 'Each of four Northwind intake coordinators', baseline: null,
      measures: 'Operations’ estimate of manual time avoided by the triage routing workflow',
      kind: 'estimate', owner: 'customer', claim: 'stated_in_source',
      customerId: 'c1', projectId: 'p1', aggregatable: false,
      evidence: ['e5'], sources: ['gemini'],
      flags: ['estimate_not_measured']
    },
    {
      // Deliberately the same observation restated three weeks later.
      label: 'Time saved per intake coordinator',
      value: 2, valueText: 'about two hours', unit: 'hours per week', period: 'per week',
      scope: 'Each of four Northwind intake coordinators',
      measures: 'Operations’ estimate of manual time avoided by the triage routing workflow',
      kind: 'estimate', owner: 'customer', claim: 'stated_in_source',
      customerId: 'c1', projectId: 'p1', aggregatable: false,
      evidence: ['e10'], sources: ['gemini']
    },
    {
      label: 'HL7 message batches failing',
      value: 7, unit: 'batches', period: 'as at 2026-06-19', scope: 'Meridian HL7 interface',
      measures: 'Count of message batches in a failed state at the time of the triage session',
      kind: 'context', owner: 'customer', claim: 'stated_in_source',
      customerId: 'c3', projectId: 'p3', aggregatable: false,
      evidence: ['e9'], sources: ['zoom']
    },
    {
      label: 'HL7 batch failures resolved',
      value: 3, unit: 'batches', period: 'by 2026-07-17', scope: 'Meridian HL7 interface, initial set of 7 failed batches',
      baseline: '7 failing batches as at 2026-06-19',
      measures: 'Count of the original seven failed batches confirmed resolved',
      kind: 'achieved', owner: 'team', claim: 'stated_in_source',
      customerId: 'c3', projectId: 'p3',
      aggregatable: false,
      evidence: ['e12'], sources: ['zoom'],
      flags: ['ownership_customer_side']
    },
    {
      label: 'First response time for new accounts',
      value: 24, unit: 'hours', period: 'per new account', scope: 'New accounts in the onboarding playbook',
      measures: 'Target maximum time to first response',
      kind: 'target', owner: 'team', claim: 'stated_in_source',
      projectId: 'p4', aggregatable: false,
      evidence: ['e11'], sources: ['gemini']
    }
  ],
  learnings: [
    {
      theme: 'Name the owner before agreeing a remediation plan',
      summary: 'Remediation work stalls when no named owner exists on the customer side.',
      examples: ['Meridian HL7 remediation stalled on an unassigned schema change.'],
      appliedIn: ['p3'],
      claim: 'stated_in_source',
      evidence: ['e13'], sources: ['gemini']
    },
    {
      theme: 'Baseline the process before proposing automation',
      summary: 'Mapping the referral queue first made the triage design concrete.',
      examples: ['Northwind intake discovery produced the handoff map the triage flow was built on.'],
      appliedIn: ['p1'],
      claim: 'interpretation',
      evidence: ['e1'], sources: ['gemini']
    }
  ]
};

/* ================================================= IMPORT 2 (cumulative, May–Sep) */
// Same document, re-exported a month later: pages shift by +2, one entry was edited
// out, one metric value changed, and the two-hours-per-week estimate is restated again.

const shift = (e, by = 2) => ({ ...e, page: e.page + by });

export const import2 = {
  isCumulative: true,
  datesCovered: { start: '2026-05-08', end: '2026-09-11' },
  documentedPeriods: [
    ...import1.documentedPeriods,
    '2026-07-24', '2026-07-31',
    '2026-08-07', '2026-08-14', '2026-08-21', '2026-08-28',
    '2026-09-04', '2026-09-11'
  ],
  unreadableSections: ['s062 (pages 44-45): scanned insert, no text layer - needs OCR'],
  unresolvedSections: [],
  customers: CUSTOMERS,
  projects: PROJECTS,
  excerpts: [
    // Re-paginated copies of the originals (same words, +2 pages).
    ...import1.excerpts.filter((e) => e.id !== 'e3').map((e) => shift(e)),
    // e3 was edited out of the document in this export -> its records get flagged.
    ex('e20', 36, 'gemini', '2026-07-24',
      'Week of July 24: Ran the Northwind adoption check-in. The triage routing workflow is now in production for the referral queue. Adoption across the four coordinators was not measured.'),
    ex('e21', 38, 'zoom', '2026-08-07',
      'Zoom AI - Cedar Valley escalation review (August 7). The TSM co-owned the escalation response with the support lead. Two priority-one escalations were closed within the week.'),
    ex('e22', 41, 'gemini', '2026-08-14',
      'Week of August 14: Closed two priority-one escalations for Cedar Valley alongside the support lead.'),
    ex('e23', 43, 'gemini', '2026-08-21',
      'Week of August 21: Northwind operations now report the triage workflow saves about three hours per week per coordinator following the production rollout.'),
    ex('e24', 47, 'zoom', '2026-09-04',
      'Zoom AI - Meridian schema owner session (September 4). A schema owner was named. The remaining four failed batches were resolved. Customer engineering executed the change.'),
    ex('e26', 45, 'gemini', '2026-08-28',
      'Week of August 28: Cedar Valley mentioned a 15% improvement during the check-in. The summary does not say what was measured or over what period.'),
    ex('e25', 49, 'gemini', '2026-09-11',
      'Week of September 11: Learning - asking for a named owner up front unblocked the Meridian remediation. Applied the same approach to the Cedar Valley escalation process.')
  ],
  contributions: [
    // Everything from import 1 is still present (matched by shared excerpts),
    // minus the entry whose excerpt was removed.
    ...import1.contributions
      .filter((c) => !c.evidence.every((e) => e === 'e3'))
      .map((c) => ({ ...c, evidence: c.evidence.filter((e) => e !== 'e3') }))
      .filter((c) => c.evidence.length > 0),
    {
      title: 'Northwind adoption check-in',
      kind: 'activity', status: 'completed', role: 'contributed', roleClaim: 'needs_clarification',
      customerId: 'c1', projectId: 'p1', milestoneOf: 'p1',
      workWeek: { start: '2026-07-20', end: '2026-07-26' }, datePrecision: 'week',
      reportingPeriod: 'Week of 2026-07-24',
      problem: 'It was unknown whether the sandbox workflow had moved into production use.',
      action: 'Ran the adoption check-in with Northwind operations.',
      deliverable: null,
      outcome: 'The triage routing workflow is in production for the referral queue. Adoption across the four coordinators was not measured.',
      outcomeClaim: 'stated_in_source',
      businessRelevance: null,
      skills: ['adoption management'], lessons: [], nextSteps: [],
      confidence: 'high', evidence: ['e20'], sources: ['gemini']
    },
    {
      title: 'Cedar Valley priority-one escalation response',
      kind: 'outcome', status: 'completed', role: 'co_owned', roleClaim: 'stated_in_source',
      customerId: 'c2', projectId: 'p2', milestoneOf: 'p2',
      workWeek: { start: '2026-08-03', end: '2026-08-09' }, datePrecision: 'week',
      reportingPeriod: 'Week of 2026-08-07',
      problem: 'Two priority-one escalations were open for Cedar Valley.',
      action: 'Co-owned the escalation response with the support lead.',
      deliverable: 'Escalation response.',
      outcome: 'Two priority-one escalations were closed within the week.',
      outcomeClaim: 'stated_in_source',
      businessRelevance: 'Priority-one escalations are the account team’s highest-severity customer issues.',
      businessRelevanceClaim: 'interpretation',
      supportingFacts: ['Source describes the escalations as priority-one.', 'Source states both were closed within the week.'],
      skills: ['escalation management'], lessons: [], nextSteps: [],
      confidence: 'high', evidence: ['e21', 'e22'], sources: ['zoom', 'gemini']
    },
    {
      title: 'Meridian schema owner session and remediation close-out',
      kind: 'activity', status: 'completed', role: 'contributed', roleClaim: 'stated_in_source',
      customerId: 'c3', projectId: 'p3', milestoneOf: 'p3',
      workWeek: { start: '2026-08-31', end: '2026-09-06' }, datePrecision: 'week',
      reportingPeriod: 'Week of 2026-09-04',
      problem: 'Four failed batches were blocked on an unassigned schema change.',
      action: 'Ran the session in which a schema owner was named.',
      deliverable: null,
      outcome: 'A schema owner was named and the remaining four failed batches were resolved. Customer engineering executed the change.',
      outcomeClaim: 'stated_in_source',
      businessRelevance: null,
      skills: ['stakeholder management'], lessons: [], nextSteps: [],
      confidence: 'high', evidence: ['e24'], sources: ['zoom'],
      flags: ['ownership_customer_side']
    }
  ],
  metrics: [
    ...import1.metrics,
    {
      // Same label/scope/period, DIFFERENT value -> surfaced as a conflict.
      label: 'Time saved per intake coordinator',
      value: 3, valueText: 'about three hours', unit: 'hours per week', period: 'per week',
      scope: 'Each of four Northwind intake coordinators',
      measures: 'Operations’ estimate of manual time avoided after the production rollout',
      kind: 'estimate', owner: 'customer', claim: 'stated_in_source',
      customerId: 'c1', projectId: 'p1', aggregatable: false,
      evidence: ['e23'], sources: ['gemini']
    },
    {
      // Deliberately under-specified in the source: the dashboard must show this as
      // needing clarification rather than quietly presenting it as a result.
      label: 'Unspecified improvement reported by Cedar Valley',
      value: 15, unit: 'percent', period: null, scope: null, baseline: null,
      measures: null,
      kind: 'context', owner: 'unknown', claim: 'needs_clarification',
      customerId: 'c2', aggregatable: false,
      evidence: ['e26'], sources: ['gemini'],
      flags: ['unspecified_measure']
    },
    {
      label: 'Priority-one escalations closed',
      value: 2, unit: 'escalations', period: 'week of 2026-08-07',
      scope: 'Cedar Valley priority-one queue',
      measures: 'Count of priority-one escalations closed in the week',
      kind: 'achieved', owner: 'team', claim: 'stated_in_source',
      customerId: 'c2', projectId: 'p2',
      aggregatable: true, aggregationGroup: 'p1_escalations_closed',
      evidence: ['e21', 'e22'], sources: ['zoom', 'gemini']
    },
    {
      label: 'HL7 batch failures resolved',
      value: 4, unit: 'batches', period: 'by 2026-09-04',
      scope: 'Meridian HL7 interface, remaining 4 of the initial 7 failed batches',
      baseline: '4 batches still failing as at 2026-07-17',
      measures: 'Count of the remaining four failed batches confirmed resolved',
      kind: 'achieved', owner: 'customer', claim: 'stated_in_source',
      customerId: 'c3', projectId: 'p3',
      aggregatable: false,
      evidence: ['e24'], sources: ['zoom'],
      flags: ['ownership_customer_side']
    }
  ],
  learnings: [
    ...import1.learnings,
    {
      theme: 'Name the owner before agreeing a remediation plan',
      summary: 'Asking for a named owner up front unblocked the Meridian remediation.',
      examples: ['Applied the same approach to the Cedar Valley escalation process.'],
      appliedIn: ['p3', 'p2'],
      claim: 'stated_in_source',
      evidence: ['e25'], sources: ['gemini']
    }
  ]
};

export const DEMO_CORRECTIONS = [
  {
    target: { type: 'contribution', byTitle: 'Triage routing workflow deployed to Northwind sandbox' },
    op: 'set',
    fields: { role: 'led', roleClaim: 'stated_in_source' },
    reason: 'DEMO correction: I built and deployed this myself; the weekly summary did not say so explicitly.'
  }
];

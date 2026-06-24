// One-off generator for tests/golden/capture.golden.json.
//
// Why a generator and not hand-written JSON: every cited span must be a VERBATIM
// substring at exact offsets, and a deliberately-fabricated span (for the safety
// metric) must NOT be a substring. Computing offsets by hand is error-prone;
// here we declare quotes as strings and resolve offsets with indexOf, so the
// checked-in fixture is correct by construction. Re-run with:
//
//   npx tsx scripts/build-golden.ts
//
// then commit the regenerated tests/golden/capture.golden.json. The corpus uses
// SYNTHETIC, fully-fictional transcripts/SOPs/emails only — no real PII. A test
// (capture.golden.test.ts) asserts the PII-free property and that the fixture
// matches what this generator produces.

import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
// Type-only imports: node strips these and never resolves the (extensionless)
// src module graph, so this generator runs standalone under `node`.
import type { Confidence, Sourced, SourceSpan } from '../src/assist/types'
import type { CapturePayload, SeamCandidateDraft } from '../src/assist/tasks/capture'
import type { GoldenCase, GoldenCorpus, GoldenExpected } from '../src/assist/captureEval'

/** Mirrors captureEval.candidateKey / tasks/capture.candidateKey (pinned by a test). */
function candidateKey(name: string | null): string {
  return (name ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

// ---------- span helpers (verbatim by construction) ----------

/** A verbatim Sourced<string|number>: offsets resolved from the source. */
function s<T extends string | number>(
  source: string,
  value: T,
  confidence: Confidence,
  quote: string,
): Sourced<T> {
  const charStart = source.indexOf(quote)
  if (charStart < 0) throw new Error(`quote not found in source: ${JSON.stringify(quote)}`)
  const span: SourceSpan = { quote, charStart, charEnd: charStart + quote.length }
  return { value, confidence, sourceSpans: [span], status: 'draft' }
}

/** An unsourced value (model declined / no span). */
function none<T extends string | number>(value: T | null = null): Sourced<T> {
  return { value, confidence: 'low', sourceSpans: [], status: 'draft' }
}

function cand(
  source: string,
  name: { v: string; q: string },
  axes: { volume: number; ruleBound: number; lowJudgement: number; lowBlastRadius: number },
  quotes: { volume: string; ruleBound: string; lowJudgement: string; lowBlastRadius: string },
): SeamCandidateDraft {
  return {
    key: candidateKey(name.v),
    name: s(source, name.v, 'high', name.q),
    volume: s(source, axes.volume, 'high', quotes.volume),
    ruleBound: s(source, axes.ruleBound, 'medium', quotes.ruleBound),
    lowJudgement: s(source, axes.lowJudgement, 'medium', quotes.lowJudgement),
    lowBlastRadius: s(source, axes.lowBlastRadius, 'high', quotes.lowBlastRadius),
  }
}

// ---------- compact "perfect extraction" case builder ----------
//
// Most cases are well-extracted: the model output mirrors the expected answer,
// quoting a verbatim substring for every value. To avoid hundreds of lines of
// repetition, `perfectCase` derives the modelOutput from the expected answer +
// a per-value quote map. (The non-perfect cases above — a missed candidate, etc.
// — are written out longhand on purpose so the metrics have something to bite.)

interface QuoteMap {
  who: string
  systems: string[]
  trigger: string
  doneDefinition: string
  frequency: string
  costOfError: string
  candidates: {
    name: string
    volume: string
    ruleBound: string
    lowJudgement: string
    lowBlastRadius: string
  }[]
  failureModes: string[]
}

function perfectCase(
  id: string,
  kind: GoldenCase['kind'],
  source: string,
  expected: GoldenExpected,
  q: QuoteMap,
): CaseSpec {
  return {
    id,
    kind,
    source,
    expected,
    build: (src) => ({
      processMap: {
        who: s(src, expected.processMap.who, 'high', q.who),
        systems: expected.processMap.systems.map((sys, i) => s(src, sys, 'high', q.systems[i]!)),
        trigger: s(src, expected.processMap.trigger, 'high', q.trigger),
        doneDefinition: s(src, expected.processMap.doneDefinition, 'medium', q.doneDefinition),
        frequency: s(src, expected.processMap.frequency, 'high', q.frequency),
        costOfError: s(src, expected.processMap.costOfError, 'high', q.costOfError),
      },
      candidates: expected.candidates.map((c, i) => {
        const qc = q.candidates[i]!
        return cand(
          src,
          { v: c.name, q: qc.name },
          { volume: c.volume, ruleBound: c.ruleBound, lowJudgement: c.lowJudgement, lowBlastRadius: c.lowBlastRadius },
          { volume: qc.volume, ruleBound: qc.ruleBound, lowJudgement: qc.lowJudgement, lowBlastRadius: qc.lowBlastRadius },
        )
      }),
      failureModes: expected.failureModes.map((f, i) => ({
        field: f.field,
        value: s(src, f.value, 'medium', q.failureModes[i]!),
      })),
    }),
  }
}

// ---------- the synthetic corpus ----------
// All names/companies/data are invented. No emails, phones, SSNs, card numbers,
// or real people. Redaction placeholders ([EMAIL]/[PERSON]) stand in where a
// real transcript would have PII.

interface CaseSpec {
  id: string
  kind: GoldenCase['kind']
  source: string
  expected: GoldenExpected
  build: (source: string) => CapturePayload
}

const SPECS: CaseSpec[] = [
  // 1 — clean invoice reconciliation, perfect extraction.
  (() => {
    const source =
      'The finance pod reviews supplier invoices each morning in the ledger app. ' +
      'A new invoice landing in the inbox starts the task. Done means the invoice is matched to a purchase order. ' +
      'It runs roughly ninety times a day. A wrong match means the company overpays a vendor.'
    return {
      id: 'invoice-recon-clean',
      kind: 'transcript' as const,
      source,
      expected: {
        processMap: {
          who: 'The finance pod',
          systems: ['the ledger app'],
          trigger: 'A new invoice landing in the inbox',
          doneDefinition: 'the invoice is matched to a purchase order',
          frequency: 'ninety times a day',
          costOfError: 'the company overpays a vendor',
        },
        candidates: [
          { name: 'Match invoices to purchase orders', volume: 5, ruleBound: 4, lowJudgement: 4, lowBlastRadius: 2 },
        ],
        failureModes: [
          { field: 'worstOutput', value: 'Pay a vendor against the wrong purchase order' },
          { field: 'detection', value: 'Compare totals to the matched PO before release' },
        ],
      },
      build: (src) => ({
        processMap: {
          who: s(src, 'The finance pod', 'high', 'The finance pod'),
          systems: [s(src, 'the ledger app', 'high', 'the ledger app')],
          trigger: s(src, 'A new invoice landing in the inbox', 'high', 'A new invoice landing in the inbox'),
          doneDefinition: s(src, 'the invoice is matched to a purchase order', 'high', 'the invoice is matched to a purchase order'),
          frequency: s(src, 'ninety times a day', 'high', 'ninety times a day'),
          costOfError: s(src, 'the company overpays a vendor', 'high', 'the company overpays a vendor'),
        },
        candidates: [
          cand(src, { v: 'Match invoices to purchase orders', q: 'matched to a purchase order' },
            { volume: 5, ruleBound: 4, lowJudgement: 4, lowBlastRadius: 2 },
            { volume: 'ninety times a day', ruleBound: 'matched to a purchase order', lowJudgement: 'matched to a purchase order', lowBlastRadius: 'overpays a vendor' }),
        ],
        failureModes: [
          { field: 'worstOutput', value: s(src, 'Pay a vendor against the wrong purchase order', 'medium', 'overpays a vendor') },
          { field: 'detection', value: s(src, 'Compare totals to the matched PO before release', 'low', 'matched to a purchase order') },
        ],
      }),
    }
  })(),

  // 2 — onboarding SOP, two candidates with a clear ranking.
  (() => {
    const source =
      'New-hire onboarding is handled by the people ops coordinator using the HR portal and the email system. ' +
      'It begins when a signed offer is filed. Done means the new hire has accounts in every system and a welcome packet. ' +
      'About forty starts happen each month. A missed account means the hire cannot work on day one. ' +
      'Two repeatable pieces stand out: creating the standard accounts, and sending the templated welcome email.'
    return {
      id: 'onboarding-sop',
      kind: 'sop' as const,
      source,
      expected: {
        processMap: {
          who: 'the people ops coordinator',
          systems: ['the HR portal', 'the email system'],
          trigger: 'a signed offer is filed',
          doneDefinition: 'the new hire has accounts in every system and a welcome packet',
          frequency: 'forty starts happen each month',
          costOfError: 'the hire cannot work on day one',
        },
        candidates: [
          { name: 'Create the standard accounts', volume: 4, ruleBound: 5, lowJudgement: 5, lowBlastRadius: 3 },
          { name: 'Send the templated welcome email', volume: 4, ruleBound: 5, lowJudgement: 4, lowBlastRadius: 5 },
        ],
        failureModes: [
          { field: 'worstOutput', value: 'A hire missing a critical system account on day one' },
          { field: 'detection', value: 'Reconcile created accounts against the standard list' },
        ],
      },
      build: (src) => ({
        processMap: {
          who: s(src, 'the people ops coordinator', 'high', 'the people ops coordinator'),
          systems: [
            s(src, 'the HR portal', 'high', 'the HR portal'),
            s(src, 'the email system', 'high', 'the email system'),
          ],
          trigger: s(src, 'a signed offer is filed', 'high', 'a signed offer is filed'),
          doneDefinition: s(src, 'the new hire has accounts in every system and a welcome packet', 'medium', 'the new hire has accounts in every system and a welcome packet'),
          frequency: s(src, 'forty starts happen each month', 'high', 'forty starts happen each month'),
          costOfError: s(src, 'the hire cannot work on day one', 'high', 'the hire cannot work on day one'),
        },
        candidates: [
          cand(src, { v: 'Create the standard accounts', q: 'creating the standard accounts' },
            { volume: 4, ruleBound: 5, lowJudgement: 5, lowBlastRadius: 3 },
            { volume: 'forty starts happen each month', ruleBound: 'creating the standard accounts', lowJudgement: 'creating the standard accounts', lowBlastRadius: 'cannot work on day one' }),
          cand(src, { v: 'Send the templated welcome email', q: 'sending the templated welcome email' },
            { volume: 4, ruleBound: 5, lowJudgement: 4, lowBlastRadius: 5 },
            { volume: 'forty starts happen each month', ruleBound: 'sending the templated welcome email', lowJudgement: 'templated welcome email', lowBlastRadius: 'welcome packet' }),
        ],
        failureModes: [
          { field: 'worstOutput', value: s(src, 'A hire missing a critical system account on day one', 'medium', 'cannot work on day one') },
          { field: 'detection', value: s(src, 'Reconcile created accounts against the standard list', 'low', 'accounts in every system') },
        ],
      }),
    }
  })(),

  // 3 — support email triage; model MISSES one expected candidate (recall < 1).
  (() => {
    const source =
      'Customer support emails are triaged by the duty agent in the helpdesk queue. ' +
      'An incoming ticket triggers it. Done means the ticket is tagged and routed to the right team. ' +
      'There are about two hundred tickets a day. A misroute means a slow first response. ' +
      'Routine parts include tagging the ticket category and drafting the first acknowledgement.'
    return {
      id: 'support-triage-email',
      kind: 'email' as const,
      source,
      expected: {
        processMap: {
          who: 'the duty agent',
          systems: ['the helpdesk queue'],
          trigger: 'An incoming ticket',
          doneDefinition: 'the ticket is tagged and routed to the right team',
          frequency: 'two hundred tickets a day',
          costOfError: 'a slow first response',
        },
        candidates: [
          { name: 'Tag the ticket category', volume: 5, ruleBound: 4, lowJudgement: 3, lowBlastRadius: 4 },
          { name: 'Draft the first acknowledgement', volume: 5, ruleBound: 3, lowJudgement: 2, lowBlastRadius: 4 },
        ],
        failureModes: [
          { field: 'worstOutput', value: 'Route a ticket to the wrong team and delay the reply' },
          { field: 'detection', value: 'Sample routed tickets against the routing rules' },
        ],
      },
      // Model only finds ONE of the two candidates -> candidate recall < 1.
      build: (src) => ({
        processMap: {
          who: s(src, 'the duty agent', 'high', 'the duty agent'),
          systems: [s(src, 'the helpdesk queue', 'high', 'the helpdesk queue')],
          trigger: s(src, 'An incoming ticket', 'high', 'An incoming ticket'),
          doneDefinition: s(src, 'the ticket is tagged and routed to the right team', 'high', 'the ticket is tagged and routed to the right team'),
          frequency: s(src, 'two hundred tickets a day', 'high', 'two hundred tickets a day'),
          costOfError: s(src, 'a slow first response', 'high', 'a slow first response'),
        },
        candidates: [
          cand(src, { v: 'Tag the ticket category', q: 'tagging the ticket category' },
            { volume: 5, ruleBound: 4, lowJudgement: 3, lowBlastRadius: 4 },
            { volume: 'two hundred tickets a day', ruleBound: 'tagging the ticket category', lowJudgement: 'tagging the ticket category', lowBlastRadius: 'slow first response' }),
        ],
        failureModes: [
          { field: 'worstOutput', value: s(src, 'Route a ticket to the wrong team and delay the reply', 'medium', 'slow first response') },
        ],
      }),
    }
  })(),

  // 4 — refund approvals; clean, well-grounded. (A DELIBERATELY fabricated span
  //     is exercised by a unit test in capture.eval.test.ts, not shipped in the
  //     gated corpus — so the safety metric is proven to fire without making the
  //     default corpus fail its own ship gate.)
  (() => {
    const source =
      'Refund requests are reviewed by the billing specialist inside the payments console. ' +
      'A submitted refund form starts the review. Done means the refund is approved or rejected with a reason. ' +
      'Around sixty refunds come in weekly. A wrong approval means money leaves that should not.'
    return {
      id: 'refund-approval-clean',
      kind: 'transcript' as const,
      source,
      expected: {
        processMap: {
          who: 'the billing specialist',
          systems: ['the payments console'],
          trigger: 'A submitted refund form',
          doneDefinition: 'the refund is approved or rejected with a reason',
          frequency: 'sixty refunds come in weekly',
          costOfError: 'money leaves that should not',
        },
        candidates: [
          { name: 'Check refunds against the policy rules', volume: 3, ruleBound: 5, lowJudgement: 3, lowBlastRadius: 2 },
        ],
        failureModes: [
          { field: 'worstOutput', value: 'Approve a refund that violates policy' },
          { field: 'detection', value: 'Audit a sample of approvals against policy' },
        ],
      },
      build: (src) => ({
        processMap: {
          who: s(src, 'the billing specialist', 'high', 'the billing specialist'),
          systems: [s(src, 'the payments console', 'high', 'the payments console')],
          trigger: s(src, 'A submitted refund form', 'high', 'A submitted refund form'),
          doneDefinition: s(src, 'the refund is approved or rejected with a reason', 'high', 'the refund is approved or rejected with a reason'),
          frequency: s(src, 'sixty refunds come in weekly', 'high', 'sixty refunds come in weekly'),
          costOfError: s(src, 'money leaves that should not', 'high', 'money leaves that should not'),
        },
        candidates: [
          cand(src, { v: 'Check refunds against the policy rules', q: 'approved or rejected with a reason' },
            { volume: 3, ruleBound: 5, lowJudgement: 3, lowBlastRadius: 2 },
            { volume: 'sixty refunds come in weekly', ruleBound: 'approved or rejected with a reason', lowJudgement: 'approved or rejected with a reason', lowBlastRadius: 'money leaves that should not' }),
        ],
        failureModes: [
          { field: 'worstOutput', value: s(src, 'Approve a refund that violates policy', 'medium', 'money leaves that should not') },
          { field: 'detection', value: none<string>('Audit a sample of approvals against policy') },
        ],
      }),
    }
  })(),

  // ----- compact perfect-extraction cases (synthetic, PII-free) -----

  perfectCase(
    'expense-report-review',
    'transcript',
    'Expense reports are checked by the travel desk in the expense tool. ' +
      'A submitted report kicks it off. Done means every line has a valid receipt. ' +
      'It happens about thirty times a day. A missed receipt means a failed audit later.',
    {
      processMap: {
        who: 'the travel desk', systems: ['the expense tool'], trigger: 'A submitted report',
        doneDefinition: 'every line has a valid receipt', frequency: 'thirty times a day',
        costOfError: 'a failed audit later',
      },
      candidates: [{ name: 'Validate receipts against report lines', volume: 4, ruleBound: 5, lowJudgement: 4, lowBlastRadius: 3 }],
      failureModes: [{ field: 'worstOutput', value: 'Pass a report with a missing receipt' }],
    },
    {
      who: 'the travel desk', systems: ['the expense tool'], trigger: 'A submitted report',
      doneDefinition: 'every line has a valid receipt', frequency: 'thirty times a day', costOfError: 'a failed audit later',
      candidates: [{ name: 'checked by the travel desk', volume: 'thirty times a day', ruleBound: 'valid receipt', lowJudgement: 'valid receipt', lowBlastRadius: 'failed audit later' }],
      failureModes: ['missed receipt'],
    },
  ),

  perfectCase(
    'lead-routing-crm',
    'transcript',
    'Inbound leads are routed by the sales ops lead in the CRM. ' +
      'A new lead form submission starts it. Done means the lead is assigned to the right rep. ' +
      'Roughly one hundred leads arrive daily. A wrong assignment means a lost deal.',
    {
      processMap: {
        who: 'the sales ops lead', systems: ['the CRM'], trigger: 'A new lead form submission',
        doneDefinition: 'the lead is assigned to the right rep', frequency: 'one hundred leads arrive daily',
        costOfError: 'a lost deal',
      },
      candidates: [{ name: 'Assign leads to reps by territory', volume: 5, ruleBound: 4, lowJudgement: 3, lowBlastRadius: 3 }],
      failureModes: [{ field: 'worstOutput', value: 'Assign a lead to the wrong territory rep' }],
    },
    {
      who: 'the sales ops lead', systems: ['the CRM'], trigger: 'A new lead form submission',
      doneDefinition: 'the lead is assigned to the right rep', frequency: 'one hundred leads arrive daily', costOfError: 'a lost deal',
      candidates: [{ name: 'routed by the sales ops lead', volume: 'one hundred leads arrive daily', ruleBound: 'assigned to the right rep', lowJudgement: 'assigned to the right rep', lowBlastRadius: 'a lost deal' }],
      failureModes: ['wrong assignment'],
    },
  ),

  perfectCase(
    'contract-renewal-sop',
    'sop',
    'Contract renewals are managed by the account manager in the contracts system. ' +
      'A renewal date approaching triggers it. Done means a renewal notice is sent and logged. ' +
      'About twenty renewals occur each month. A missed notice means an auto-lapse of coverage.',
    {
      processMap: {
        who: 'the account manager', systems: ['the contracts system'], trigger: 'A renewal date approaching',
        doneDefinition: 'a renewal notice is sent and logged', frequency: 'twenty renewals occur each month',
        costOfError: 'an auto-lapse of coverage',
      },
      candidates: [{ name: 'Send the renewal notice', volume: 3, ruleBound: 5, lowJudgement: 4, lowBlastRadius: 4 }],
      failureModes: [{ field: 'worstOutput', value: 'Let a contract lapse without notice' }],
    },
    {
      who: 'the account manager', systems: ['the contracts system'], trigger: 'A renewal date approaching',
      doneDefinition: 'a renewal notice is sent and logged', frequency: 'twenty renewals occur each month', costOfError: 'an auto-lapse of coverage',
      candidates: [{ name: 'renewal notice is sent', volume: 'twenty renewals occur each month', ruleBound: 'renewal notice is sent and logged', lowJudgement: 'sent and logged', lowBlastRadius: 'auto-lapse of coverage' }],
      failureModes: ['missed notice'],
    },
  ),

  perfectCase(
    'order-status-email',
    'email',
    'Order status questions are answered by the fulfilment clerk using the order portal. ' +
      'A customer status email triggers it. Done means the customer gets an accurate status reply. ' +
      'There are about eighty such emails a day. A wrong status means an angry customer.',
    {
      processMap: {
        who: 'the fulfilment clerk', systems: ['the order portal'], trigger: 'A customer status email',
        doneDefinition: 'the customer gets an accurate status reply', frequency: 'eighty such emails a day',
        costOfError: 'an angry customer',
      },
      candidates: [{ name: 'Look up and reply with order status', volume: 5, ruleBound: 4, lowJudgement: 3, lowBlastRadius: 4 }],
      failureModes: [{ field: 'worstOutput', value: 'Send an incorrect order status' }],
    },
    {
      who: 'the fulfilment clerk', systems: ['the order portal'], trigger: 'A customer status email',
      doneDefinition: 'the customer gets an accurate status reply', frequency: 'eighty such emails a day', costOfError: 'an angry customer',
      candidates: [{ name: 'answered by the fulfilment clerk', volume: 'eighty such emails a day', ruleBound: 'accurate status reply', lowJudgement: 'accurate status reply', lowBlastRadius: 'an angry customer' }],
      failureModes: ['wrong status'],
    },
  ),

  perfectCase(
    'inventory-reorder',
    'transcript',
    'Stock reorders are placed by the warehouse planner in the inventory system. ' +
      'A low-stock alert starts the task. Done means a purchase order is raised for the shortfall. ' +
      'It runs about fifty times a week. A late reorder means a stockout on the floor.',
    {
      processMap: {
        who: 'the warehouse planner', systems: ['the inventory system'], trigger: 'A low-stock alert',
        doneDefinition: 'a purchase order is raised for the shortfall', frequency: 'fifty times a week',
        costOfError: 'a stockout on the floor',
      },
      candidates: [{ name: 'Raise reorder purchase orders', volume: 4, ruleBound: 5, lowJudgement: 4, lowBlastRadius: 3 }],
      failureModes: [{ field: 'worstOutput', value: 'Fail to reorder and cause a stockout' }],
    },
    {
      who: 'the warehouse planner', systems: ['the inventory system'], trigger: 'A low-stock alert',
      doneDefinition: 'a purchase order is raised for the shortfall', frequency: 'fifty times a week', costOfError: 'a stockout on the floor',
      candidates: [{ name: 'placed by the warehouse planner', volume: 'fifty times a week', ruleBound: 'purchase order is raised', lowJudgement: 'purchase order is raised', lowBlastRadius: 'a stockout on the floor' }],
      failureModes: ['late reorder'],
    },
  ),

  perfectCase(
    'kyc-document-check',
    'sop',
    'Identity documents are verified by the compliance officer in the onboarding tool. ' +
      'A new application submission triggers it. Done means the document passes the standard checks. ' +
      'About seventy applications come in weekly. A bad pass means a compliance breach.',
    {
      processMap: {
        who: 'the compliance officer', systems: ['the onboarding tool'], trigger: 'A new application submission',
        doneDefinition: 'the document passes the standard checks', frequency: 'seventy applications come in weekly',
        costOfError: 'a compliance breach',
      },
      candidates: [{ name: 'Run the standard document checks', volume: 4, ruleBound: 5, lowJudgement: 3, lowBlastRadius: 2 }],
      failureModes: [{ field: 'worstOutput', value: 'Pass a document that should fail checks' }],
    },
    {
      who: 'the compliance officer', systems: ['the onboarding tool'], trigger: 'A new application submission',
      doneDefinition: 'the document passes the standard checks', frequency: 'seventy applications come in weekly', costOfError: 'a compliance breach',
      candidates: [{ name: 'verified by the compliance officer', volume: 'seventy applications come in weekly', ruleBound: 'standard checks', lowJudgement: 'standard checks', lowBlastRadius: 'a compliance breach' }],
      failureModes: ['bad pass'],
    },
  ),

  perfectCase(
    'timesheet-approval',
    'transcript',
    'Weekly timesheets are approved by the team lead in the scheduling app. ' +
      'A submitted timesheet starts it. Done means the hours reconcile against the roster. ' +
      'There are about forty timesheets a week. A wrong approval means a payroll error.',
    {
      processMap: {
        who: 'the team lead', systems: ['the scheduling app'], trigger: 'A submitted timesheet',
        doneDefinition: 'the hours reconcile against the roster', frequency: 'forty timesheets a week',
        costOfError: 'a payroll error',
      },
      candidates: [{ name: 'Reconcile hours against the roster', volume: 3, ruleBound: 5, lowJudgement: 4, lowBlastRadius: 3 }],
      failureModes: [{ field: 'worstOutput', value: 'Approve hours that do not match the roster' }],
    },
    {
      who: 'the team lead', systems: ['the scheduling app'], trigger: 'A submitted timesheet',
      doneDefinition: 'the hours reconcile against the roster', frequency: 'forty timesheets a week', costOfError: 'a payroll error',
      candidates: [{ name: 'approved by the team lead', volume: 'forty timesheets a week', ruleBound: 'reconcile against the roster', lowJudgement: 'reconcile against the roster', lowBlastRadius: 'a payroll error' }],
      failureModes: ['wrong approval'],
    },
  ),

  perfectCase(
    'appointment-reminder',
    'email',
    'Appointment reminders are sent by the clinic coordinator from the booking system. ' +
      'A booking confirmed the day before triggers it. Done means the reminder is delivered to the patient. ' +
      'About ninety reminders go out daily. A missed reminder means a no-show.',
    {
      processMap: {
        who: 'the clinic coordinator', systems: ['the booking system'], trigger: 'A booking confirmed the day before',
        doneDefinition: 'the reminder is delivered to the patient', frequency: 'ninety reminders go out daily',
        costOfError: 'a no-show',
      },
      candidates: [{ name: 'Send appointment reminders', volume: 5, ruleBound: 5, lowJudgement: 5, lowBlastRadius: 4 }],
      failureModes: [{ field: 'worstOutput', value: 'Fail to remind a patient who then no-shows' }],
    },
    {
      who: 'the clinic coordinator', systems: ['the booking system'], trigger: 'A booking confirmed the day before',
      doneDefinition: 'the reminder is delivered to the patient', frequency: 'ninety reminders go out daily', costOfError: 'a no-show',
      candidates: [{ name: 'sent by the clinic coordinator', volume: 'ninety reminders go out daily', ruleBound: 'reminder is delivered', lowJudgement: 'reminder is delivered', lowBlastRadius: 'a no-show' }],
      failureModes: ['missed reminder'],
    },
  ),

  perfectCase(
    'data-entry-forms',
    'transcript',
    'Paper intake forms are keyed in by the records clerk into the database. ' +
      'A batch of scanned forms starts it. Done means each form is entered without errors. ' +
      'It happens about two hundred forms a day. A keying error means corrupt records.',
    {
      processMap: {
        who: 'the records clerk', systems: ['the database'], trigger: 'A batch of scanned forms',
        doneDefinition: 'each form is entered without errors', frequency: 'two hundred forms a day',
        costOfError: 'corrupt records',
      },
      candidates: [{ name: 'Key scanned forms into the database', volume: 5, ruleBound: 4, lowJudgement: 3, lowBlastRadius: 3 }],
      failureModes: [{ field: 'worstOutput', value: 'Enter a form with transposed values' }],
    },
    {
      who: 'the records clerk', systems: ['the database'], trigger: 'A batch of scanned forms',
      doneDefinition: 'each form is entered without errors', frequency: 'two hundred forms a day', costOfError: 'corrupt records',
      candidates: [{ name: 'keyed in by the records clerk', volume: 'two hundred forms a day', ruleBound: 'entered without errors', lowJudgement: 'entered without errors', lowBlastRadius: 'corrupt records' }],
      failureModes: ['keying error'],
    },
  ),

  perfectCase(
    'shipment-tracking-sop',
    'sop',
    'Outbound shipments are tracked by the logistics coordinator in the carrier portal. ' +
      'A dispatched parcel triggers it. Done means the tracking number is recorded and confirmed. ' +
      'About one hundred parcels ship each day. A lost tracking number means an untraceable parcel.',
    {
      processMap: {
        who: 'the logistics coordinator', systems: ['the carrier portal'], trigger: 'A dispatched parcel',
        doneDefinition: 'the tracking number is recorded and confirmed', frequency: 'one hundred parcels ship each day',
        costOfError: 'an untraceable parcel',
      },
      candidates: [{ name: 'Record and confirm tracking numbers', volume: 5, ruleBound: 5, lowJudgement: 4, lowBlastRadius: 4 }],
      failureModes: [{ field: 'worstOutput', value: 'Ship a parcel with no recorded tracking' }],
    },
    {
      who: 'the logistics coordinator', systems: ['the carrier portal'], trigger: 'A dispatched parcel',
      doneDefinition: 'the tracking number is recorded and confirmed', frequency: 'one hundred parcels ship each day', costOfError: 'an untraceable parcel',
      candidates: [{ name: 'tracked by the logistics coordinator', volume: 'one hundred parcels ship each day', ruleBound: 'recorded and confirmed', lowJudgement: 'recorded and confirmed', lowBlastRadius: 'an untraceable parcel' }],
      failureModes: ['lost tracking number'],
    },
  ),

  perfectCase(
    'password-reset-tickets',
    'email',
    'Password reset requests are handled by the help desk in the identity console. ' +
      'A reset request email triggers it. Done means the user can sign in again. ' +
      'There are about sixty resets a day. A wrong reset means a locked-out user.',
    {
      processMap: {
        who: 'the help desk', systems: ['the identity console'], trigger: 'A reset request email',
        doneDefinition: 'the user can sign in again', frequency: 'sixty resets a day',
        costOfError: 'a locked-out user',
      },
      candidates: [{ name: 'Process the standard password reset', volume: 5, ruleBound: 5, lowJudgement: 5, lowBlastRadius: 4 }],
      failureModes: [{ field: 'worstOutput', value: 'Reset the wrong account' }],
    },
    {
      who: 'the help desk', systems: ['the identity console'], trigger: 'A reset request email',
      doneDefinition: 'the user can sign in again', frequency: 'sixty resets a day', costOfError: 'a locked-out user',
      candidates: [{ name: 'handled by the help desk', volume: 'sixty resets a day', ruleBound: 'sign in again', lowJudgement: 'sign in again', lowBlastRadius: 'a locked-out user' }],
      failureModes: ['wrong reset'],
    },
  ),

  perfectCase(
    'qa-sample-inspection',
    'transcript',
    'Production samples are inspected by the quality analyst at the inspection station. ' +
      'A finished batch arriving starts it. Done means the sample meets the spec tolerances. ' +
      'It runs about forty batches a day. A bad pass means a defective shipment.',
    {
      processMap: {
        who: 'the quality analyst', systems: ['the inspection station'], trigger: 'A finished batch arriving',
        doneDefinition: 'the sample meets the spec tolerances', frequency: 'forty batches a day',
        costOfError: 'a defective shipment',
      },
      candidates: [{ name: 'Check samples against spec tolerances', volume: 4, ruleBound: 5, lowJudgement: 3, lowBlastRadius: 2 }],
      failureModes: [{ field: 'worstOutput', value: 'Pass a batch that is out of tolerance' }],
    },
    {
      who: 'the quality analyst', systems: ['the inspection station'], trigger: 'A finished batch arriving',
      doneDefinition: 'the sample meets the spec tolerances', frequency: 'forty batches a day', costOfError: 'a defective shipment',
      candidates: [{ name: 'inspected by the quality analyst', volume: 'forty batches a day', ruleBound: 'spec tolerances', lowJudgement: 'spec tolerances', lowBlastRadius: 'a defective shipment' }],
      failureModes: ['bad pass'],
    },
  ),

  perfectCase(
    'invoice-coding-sop',
    'sop',
    'Incoming bills are coded to ledger accounts by the AP clerk in the accounting suite. ' +
      'A scanned bill arriving triggers it. Done means the bill is coded to the correct account. ' +
      'About one hundred and twenty bills arrive weekly. A miscode means a misstated ledger.',
    {
      processMap: {
        who: 'the AP clerk', systems: ['the accounting suite'], trigger: 'A scanned bill arriving',
        doneDefinition: 'the bill is coded to the correct account', frequency: 'one hundred and twenty bills arrive weekly',
        costOfError: 'a misstated ledger',
      },
      candidates: [{ name: 'Code bills to ledger accounts', volume: 4, ruleBound: 4, lowJudgement: 3, lowBlastRadius: 3 }],
      failureModes: [{ field: 'worstOutput', value: 'Code a bill to the wrong account' }],
    },
    {
      who: 'the AP clerk', systems: ['the accounting suite'], trigger: 'A scanned bill arriving',
      doneDefinition: 'the bill is coded to the correct account', frequency: 'one hundred and twenty bills arrive weekly', costOfError: 'a misstated ledger',
      candidates: [{ name: 'coded to ledger accounts by the AP clerk', volume: 'one hundred and twenty bills arrive weekly', ruleBound: 'coded to the correct account', lowJudgement: 'coded to the correct account', lowBlastRadius: 'a misstated ledger' }],
      failureModes: ['miscode'],
    },
  ),
]

// ---------- emit ----------

const cases: GoldenCase[] = SPECS.map((spec) => ({
  id: spec.id,
  kind: spec.kind,
  source: spec.source,
  expected: spec.expected,
  modelOutput: spec.build(spec.source),
}))

const corpus: GoldenCorpus = { version: 1, cases }

const here = dirname(fileURLToPath(import.meta.url))
const out = join(here, '..', 'tests', 'golden', 'capture.golden.json')
writeFileSync(out, JSON.stringify(corpus, null, 2) + '\n', 'utf8')
console.log(`wrote ${cases.length} golden cases -> ${out}`)

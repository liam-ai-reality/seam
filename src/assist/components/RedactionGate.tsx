// The non-skippable redaction-review panel (#14). Cockpit-styled. Renders BEFORE
// any client call: detected spans listed with one-click redact/keep, redact-all
// as the DEFAULT, a persistent banner stating exactly what will be sent, and a
// 'send raw' escape hatch that requires an explicit, recorded choice.
//
// This component owns NO network and NO persistence. It produces a GatePass via
// confirmRedaction (the only gate producer) and hands it to onConfirm. The
// parent decides what to do with it (send + persist). Deleting src/assist/ takes
// this with it and leaves v1 untouched.
//
// GOTCHA honoured: no [data-enter] wrapper here (those start opacity:0). The
// panel is visible immediately.

import { useMemo, useState } from 'react'
import {
  confirmRedaction,
  defaultChoice,
  type CaptureDraft,
  type GatePass,
  type RedactionChoice,
} from '../capture'
import type { PiiKind, PiiSpan } from '../pii'

const KIND_LABEL: Record<PiiKind, string> = {
  email: 'Email',
  phone: 'Phone',
  card: 'Card number',
  ssn: 'SSN',
  account: 'Account / policy',
  name: 'Name',
}

export interface RedactionGateProps {
  draft: CaptureDraft
  /** Called with the gate-passing token once the human confirms. */
  onConfirm: (pass: GatePass) => void
  /** Called if the human backs out of capture entirely. */
  onCancel: () => void
}

export function RedactionGate({ draft, onConfirm, onCancel }: RedactionGateProps) {
  const [choice, setChoice] = useState<RedactionChoice>(() => defaultChoice(draft))

  const redactedCount = useMemo(
    () => draft.detected.filter((_, i) => choice.decisions[i] !== false).length,
    [draft.detected, choice.decisions],
  )
  const keptCount = draft.detected.length - redactedCount

  const setDecision = (i: number, redact: boolean) =>
    setChoice((c) => ({ ...c, decisions: { ...c.decisions, [i]: redact } }))

  const redactAll = () =>
    setChoice((c) => ({
      ...c,
      sendRaw: false,
      decisions: Object.fromEntries(draft.detected.map((_, i) => [i, true])),
    }))

  const confirmRedacted = () =>
    onConfirm(confirmRedaction(draft, { ...choice, sendRaw: false }))

  const confirmSendRaw = () => {
    if (
      !window.confirm(
        `Send the original text WITHOUT redaction? ${draft.detected.length} detected PII item(s) will leave your device. This choice is recorded with a timestamp.`,
      )
    )
      return
    onConfirm(confirmRedaction(draft, { ...choice, sendRaw: true }))
  }

  return (
    <div className="panel stack" role="group" aria-label="Redaction review">
      <div className="panel-head">
        <h2>Review before sending</h2>
        <span className="tag assist">
          <span className="light cyan" aria-hidden /> client-side
        </span>
      </div>

      {/* Persistent banner — states exactly what will be sent. 'detected PII'. */}
      <SendBanner
        detected={draft.detected.length}
        redacted={redactedCount}
        kept={keptCount}
        sendRaw={choice.sendRaw}
      />

      {draft.detected.length === 0 ? (
        <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>
          No detected PII in this text. Review and send when ready.
        </p>
      ) : (
        <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0, gap: 'var(--space-2)' }}>
          {draft.detected.map((span, i) => (
            <SpanRow
              key={`${span.start}-${span.end}-${i}`}
              span={span}
              redact={choice.decisions[i] !== false}
              onRedact={() => setDecision(i, true)}
              onKeep={() => setDecision(i, false)}
            />
          ))}
        </ul>
      )}

      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="btn-row">
          <button type="button" className="btn ghost sm" onClick={onCancel}>
            Cancel
          </button>
          {draft.detected.length > 0 && (
            <button type="button" className="btn ghost sm" onClick={redactAll}>
              Redact all detected
            </button>
          )}
        </div>
        <div className="btn-row">
          <button type="button" className="btn danger sm" onClick={confirmSendRaw}>
            Send raw…
          </button>
          <button type="button" className="btn sm" onClick={confirmRedacted}>
            Redact &amp; send
          </button>
        </div>
      </div>
    </div>
  )
}

function SendBanner({
  detected,
  redacted,
  kept,
  sendRaw,
}: {
  detected: number
  redacted: number
  kept: number
  sendRaw: boolean
}) {
  if (sendRaw) {
    return (
      <div role="status" className="card" style={{ borderColor: 'oklch(66% 0.18 25 / 0.5)' }}>
        <span className="light red" aria-hidden /> <b>Send raw selected.</b> The original text,
        including {detected} detected PII item(s), will be sent un-redacted. This choice will be
        recorded with a timestamp.
      </div>
    )
  }
  return (
    <div role="status" className="card">
      <span className="light cyan" aria-hidden />{' '}
      {detected === 0 ? (
        <>No detected PII — the text will be sent as-is.</>
      ) : (
        <>
          <b>
            {redacted} of {detected} detected PII
          </b>{' '}
          item(s) will be redacted before anything leaves your device
          {kept > 0 ? <>; {kept} will be kept as-is</> : null}. Only <b>detected PII</b> is
          redacted — review each item below.
        </>
      )}
    </div>
  )
}

function SpanRow({
  span,
  redact,
  onRedact,
  onKeep,
}: {
  span: PiiSpan
  redact: boolean
  onRedact: () => void
  onKeep: () => void
}) {
  return (
    <li className="row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
      <span className="row" style={{ gap: 'var(--space-2)', minWidth: 0 }}>
        <span className="tag neutral">{KIND_LABEL[span.kind]}</span>
        <code
          className="cite"
          title={span.text}
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: '32ch',
          }}
        >
          {span.text}
        </code>
      </span>
      <span className="pill-row" role="group" aria-label={`Action for ${KIND_LABEL[span.kind]}`}>
        <button
          type="button"
          className={`pill${redact ? ' on' : ''}`}
          aria-pressed={redact}
          onClick={onRedact}
        >
          Redact
        </button>
        <button
          type="button"
          className={`pill${!redact ? ' on' : ''}`}
          aria-pressed={!redact}
          onClick={onKeep}
        >
          Keep
        </button>
      </span>
    </li>
  )
}

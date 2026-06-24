import { useMemo, useState } from 'react'
import { generateBrief } from '../brief'
import { isReady, pillarsDone, stageStatuses } from '../logic'
import { exportScope } from '../storage'
import type { StageProps } from './stage'
import { StageHeader, TextArea, Toggle } from './fields'

export function StageReady({ scope, update }: StageProps) {
  const statuses = stageStatuses(scope)
  const ready = isReady(scope)
  const brief = useMemo(() => generateBrief(scope), [scope])
  const [copied, setCopied] = useState(false)

  const setPillar = (key: string, patch: { handling?: string; done?: boolean }) =>
    update((s) => ({ ...s, pillars: s.pillars.map((p) => (p.key === key ? { ...p, ...patch } : p)) }))

  const copy = async () => {
    await navigator.clipboard.writeText(brief)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  const download = () => {
    const blob = new Blob([brief], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'scoping-brief.md'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      <StageHeader n={6} title="Reliability pillars & brief" blurb="Complete the four pillars to unlock 'ready to build', then generate the brief." />

      {/* Pillars */}
      <div className="space-y-3">
        {scope.pillars.map((p) => {
          const hasHandling = p.handling.trim().length > 0
          return (
            <div key={p.key} className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <div>
                  <div className="font-medium text-slate-100">{p.title}</div>
                  <div className="text-xs text-slate-500">{p.description}</div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Toggle checked={p.done} onChange={(v) => setPillar(p.key, { done: v })} label="done" disabled={!hasHandling} />
                  {!hasHandling && <span className="text-xs text-slate-600">Say how it's handled to mark done</span>}
                </div>
              </div>
              <TextArea value={p.handling} onChange={(v) => setPillar(p.key, { handling: v })} placeholder="How this deployment handles it" rows={2} />
            </div>
          )
        })}
      </div>

      {/* Readiness gate */}
      <div className={`rounded-lg border p-4 ${ready ? 'border-emerald-500/50 bg-emerald-500/10' : 'border-slate-800 bg-slate-900/40'}`}>
        <div className="mb-3 flex items-center gap-2">
          <span className={`font-mono text-sm font-semibold ${ready ? 'text-emerald-300' : 'text-slate-300'}`}>
            {ready ? '● READY TO BUILD' : '○ NOT READY'}
          </span>
        </div>
        <ul className="grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
          {statuses.map((st) => (
            <li key={st.key} className="flex items-center gap-2">
              <span className={st.complete ? 'text-emerald-400' : 'text-slate-600'}>{st.complete ? '✓' : '○'}</span>
              <span className={st.complete ? 'text-slate-300' : 'text-slate-500'}>{st.label}</span>
            </li>
          ))}
          <li className="flex items-center gap-2">
            <span className={pillarsDone(scope) ? 'text-emerald-400' : 'text-slate-600'}>{pillarsDone(scope) ? '✓' : '○'}</span>
            <span className={pillarsDone(scope) ? 'text-slate-300' : 'text-slate-500'}>All four pillars done</span>
          </li>
        </ul>
      </div>

      {/* Brief output */}
      <div>
        <div className="no-print mb-2 flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs uppercase tracking-wider text-slate-400">Scoping brief</span>
          <div className="ml-auto flex gap-2">
            <button onClick={copy} className="rounded-md border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:border-cyan-500/60">{copied ? 'Copied ✓' : 'Copy'}</button>
            <button onClick={download} className="rounded-md border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:border-cyan-500/60">Download .md</button>
            <button onClick={() => window.print()} className="rounded-md border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:border-cyan-500/60">Print</button>
            <button onClick={() => exportScope(scope)} className="rounded-md border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:border-cyan-500/60">Export JSON</button>
          </div>
        </div>
        <pre className="print-brief max-h-[28rem] overflow-auto rounded-lg border border-slate-800 bg-slate-950/80 p-4 text-xs leading-relaxed text-slate-300">
          {brief}
        </pre>
      </div>
    </div>
  )
}

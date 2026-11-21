import { useState } from 'react'
import { draftToDocxBlob, downloadBlob } from '../lib/wordDoc'

const ICON = { shown: '✅', thin: '⚠️', missing: '❌' }
const LABEL = { shown: 'Shown clearly', thin: 'Thin', missing: 'Missing' }

export default function DraftView({ draft, job, onClose }) {
  const [showChanges, setShowChanges] = useState(false)
  const [showResume, setShowResume] = useState(false)
  const checklist = draft.checklist || []
  const counts = checklist.reduce((a, c) => ({ ...a, [c.status]: (a[c.status] || 0) + 1 }), {})
  const add = draft.suggestions?.add || []
  const cut = draft.suggestions?.cut || []
  const words = draft.resume_text.split(/\s+/).filter(Boolean).length

  async function download() {
    const blob = await draftToDocxBlob(draft.resume_text)
    const safe = (job?.title || 'resume').replace(/[^A-Za-z0-9]+/g, '_').slice(0, 40)
    downloadBlob(blob, `${safe}_${job?.id || 'draft'}_RESUME.docx`)
  }

  return (
    <section>
      <button type="button" className="link" onClick={onClose}>‹ Back to jobs</button>
      <h2>{job?.title}</h2>
      <p className="muted small">{job?.grade} · {job?.org} · closes {job?.closes}</p>

      <div className="callout">
        Draft written {new Date(draft.created_at).toLocaleString()} · about {words} words.
        Read it against your real experience before uploading. You certify everything in it.
      </div>

      <div className="row-start">
        <button type="button" className="primary" onClick={download}>Download Word file</button>
        {job?.url && <a className="button" href={job.url} target="_blank" rel="noreferrer">Open posting</a>}
      </div>

      <h3>How your resume stacks up</h3>
      <p className="muted small">
        Against the posting's qualification and specialized-experience requirements:
        {' '}✅ {counts.shown || 0} shown · ⚠️ {counts.thin || 0} thin · ❌ {counts.missing || 0} missing
      </p>
      <ul className="checklist">
        {checklist.map((c, i) => (
          <li key={i} className={`check-${c.status}`}>
            <div><span aria-label={LABEL[c.status]}>{ICON[c.status]}</span> <strong>{c.requirement}</strong></div>
            <div className="muted small">{c.evidence}</div>
          </li>
        ))}
      </ul>

      {add.length > 0 && (
        <>
          <h3>Could strengthen it (only if true)</h3>
          <ul className="plain">{add.map((s, i) => <li key={i}>{s}</li>)}</ul>
        </>
      )}

      <h3>
        <button type="button" className="link" onClick={() => setShowChanges(!showChanges)}>
          {showChanges ? '▾' : '▸'} What I changed ({(draft.changes || []).length})
        </button>
      </h3>
      {showChanges && (
        <ul className="changes">
          {(draft.changes || []).map((c, i) => (
            <li key={i}>
              <div className="was"><span className="tag">Was</span> {c.original}</div>
              <div className="now"><span className="tag">Now</span> {c.revised}</div>
            </li>
          ))}
          {cut.length > 0 && (
            <li>
              <div className="muted small"><strong>Cut to fit two pages:</strong> {cut.join('; ')}</div>
            </li>
          )}
        </ul>
      )}

      <h3>
        <button type="button" className="link" onClick={() => setShowResume(!showResume)}>
          {showResume ? '▾' : '▸'} Preview the resume text
        </button>
      </h3>
      {showResume && <pre className="resume-preview">{draft.resume_text}</pre>}
    </section>
  )
}

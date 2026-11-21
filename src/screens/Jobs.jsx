import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import DraftView from './DraftView'

const CAP = 15

function daysLeft(closes) {
  if (!closes) return null
  const end = new Date(closes + 'T23:59:59')
  return Math.ceil((end - new Date()) / 86400000)
}

export default function Jobs({ goTo }) {
  const [jobs, setJobs] = useState(null)
  const [drafts, setDrafts] = useState({}) // job_id -> latest draft
  const [used, setUsed] = useState(0)
  const [hasResume, setHasResume] = useState(true)
  const [hasSearch, setHasSearch] = useState(true)
  const [searching, setSearching] = useState(false)
  const [working, setWorking] = useState(null) // job id being drafted
  const [open, setOpen] = useState(null) // {draft, job}
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')

  async function load() {
    const [{ data: matches }, { data: ds }, { data: u }, { count: rc }, { count: sc }] = await Promise.all([
      supabase.from('search_matches').select('first_seen_at, jobs(*)').order('first_seen_at', { ascending: false }),
      supabase.from('drafts').select('*').order('created_at', { ascending: false }),
      supabase.rpc('my_drafts_used_this_month'),
      supabase.from('resumes').select('user_id', { count: 'exact', head: true }),
      supabase.from('searches').select('id', { count: 'exact', head: true }),
    ])
    const byId = new Map()
    for (const m of matches || []) {
      if (!m.jobs) continue
      const prev = byId.get(m.jobs.id)
      if (!prev || m.first_seen_at < prev.first_seen_at) byId.set(m.jobs.id, { ...m.jobs, first_seen_at: m.first_seen_at })
    }
    const today = new Date().toISOString().slice(0, 10)
    const list = [...byId.values()]
      .filter((j) => !j.closes || j.closes >= today)
      .sort((a, b) => (a.closes || '9999').localeCompare(b.closes || '9999'))
    setJobs(list)
    const latest = {}
    for (const d of ds || []) if (!latest[d.job_id]) latest[d.job_id] = d
    setDrafts(latest)
    setUsed(u || 0)
    setHasResume((rc || 0) > 0)
    setHasSearch((sc || 0) > 0)
  }
  useEffect(() => { load() }, [])

  async function searchNow() {
    setError(''); setMsg(''); setSearching(true)
    const { data, error } = await supabase.functions.invoke('run-search', { body: {} })
    setSearching(false)
    if (error || !data?.ok) return setError(data?.error || error?.message || 'Search failed.')
    setMsg(data.new_matches ? `${data.new_matches} new job${data.new_matches === 1 ? '' : 's'} found.` : 'No new jobs since your last search.')
    load()
  }

  async function apply(job) {
    setError(''); setMsg('')
    if (!hasResume) return setError('Add your base resume first (Resume tab).')
    if (drafts[job.id] && !window.confirm('You already have a draft for this job. Write a new one? It uses one of your monthly drafts.')) return
    setWorking(job.id)
    const { data, error } = await supabase.functions.invoke('tailor', { body: { job_id: job.id } })
    setWorking(null)
    if (error || !data?.ok) {
      let message = data?.error
      if (!message && error?.context?.json) { try { message = (await error.context.json()).error } catch { /* ignore */ } }
      return setError(message || error?.message || 'Drafting failed.')
    }
    setUsed(data.used_this_month)
    setDrafts({ ...drafts, [job.id]: data.draft })
    setOpen({ draft: data.draft, job })
  }

  if (open) return <DraftView draft={open.draft} job={open.job} onClose={() => setOpen(null)} />

  return (
    <section>
      <div className="row">
        <h2 style={{ margin: 0 }}>Matching jobs</h2>
        <button type="button" onClick={searchNow} disabled={searching || !hasSearch}>{searching ? 'Searching…' : 'Search now'}</button>
      </div>
      <p className="muted small">Drafts used this month: {used} of {CAP}</p>

      {!hasSearch && <p className="callout">Start by adding a saved search. <button type="button" className="link" onClick={() => goTo('searches')}>Add a search ›</button></p>}
      {hasSearch && !hasResume && <p className="callout">Add your base resume so you can get tailored drafts. <button type="button" className="link" onClick={() => goTo('resume')}>Add resume ›</button></p>}
      {error && <p className="error" role="alert">{error}</p>}
      {msg && <p className="ok">{msg}</p>}

      {jobs === null && <p className="muted">Loading…</p>}
      {jobs?.length === 0 && hasSearch && <p className="muted">No open jobs yet. Tap Search now.</p>}

      <ul className="list">
        {(jobs || []).map((j) => {
          const left = daysLeft(j.closes)
          const isNew = Date.now() - new Date(j.first_seen_at).getTime() < 36 * 3600 * 1000
          const draft = drafts[j.id]
          return (
            <li key={j.id} className="item static">
              <div className="item-title">
                {isNew && <span className="badge">NEW</span>}
                {j.title} <span className="muted">({j.grade})</span>
              </div>
              <div className="muted small">{j.org}</div>
              <div className="muted small">{j.remote ? 'Remote · ' : ''}{j.location}</div>
              <div className="muted small">
                {j.pay} · closes {j.closes}
                {left !== null && left <= 3 && <strong className="soon"> · {left <= 0 ? 'closes today' : `${left} day${left === 1 ? '' : 's'} left`}</strong>}
              </div>
              <div className="row-start">
                {draft
                  ? <button type="button" className="primary" onClick={() => setOpen({ draft, job: j })}>View draft</button>
                  : <button type="button" className="primary" disabled={!!working} onClick={() => apply(j)}>
                      {working === j.id ? 'Writing draft… (about a minute)' : 'I want to apply'}
                    </button>}
                {draft && <button type="button" disabled={!!working} onClick={() => apply(j)}>{working === j.id ? 'Writing…' : 'Redo draft'}</button>}
                {j.url && <a className="button" href={j.url} target="_blank" rel="noreferrer">Posting</a>}
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

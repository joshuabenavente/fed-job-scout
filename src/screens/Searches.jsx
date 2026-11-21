import { useEffect, useState } from 'react'
import { supabase } from '../supabase'

const EMPTY = {
  name: 'My search',
  series: '',
  grade_low: 12,
  grade_high: 14,
  agency: 'VA',
  locations: '',
  radius_miles: 25,
  include_remote: true,
  active: true,
}

const toForm = (s) => ({ ...s, series: (s.series || []).join(', '), locations: (s.locations || []).join('\n'), agency: s.agency || '' })

function fromForm(f) {
  return {
    name: f.name.trim() || 'My search',
    series: f.series.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean).map((x) => x.padStart(4, '0')),
    grade_low: Number(f.grade_low),
    grade_high: Number(f.grade_high),
    agency: f.agency.trim() || null,
    locations: f.locations.split('\n').map((x) => x.trim()).filter(Boolean),
    radius_miles: Number(f.radius_miles) || 25,
    include_remote: !!f.include_remote,
    active: !!f.active,
  }
}

export default function Searches({ session }) {
  const [searches, setSearches] = useState([])
  const [editing, setEditing] = useState(null) // form state or null
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    const { data } = await supabase.from('searches').select('*').order('created_at')
    setSearches(data || [])
  }
  useEffect(() => { load() }, [])

  async function save(e) {
    e.preventDefault()
    setError('')
    const row = fromForm(editing)
    if (row.grade_low > row.grade_high) return setError('Lowest grade must be at or below highest grade.')
    if (!row.series.length) return setError('Add at least one job series, e.g. 0343.')
    setBusy(true)
    const { error } = editing.id
      ? await supabase.from('searches').update(row).eq('id', editing.id)
      : await supabase.from('searches').insert({ ...row, user_id: session.user.id })
    setBusy(false)
    if (error) return setError(error.message)
    setEditing(null)
    load()
  }

  async function remove(id) {
    if (!window.confirm('Delete this search? Jobs it found will disappear from your list.')) return
    await supabase.from('searches').delete().eq('id', id)
    setEditing(null)
    load()
  }

  const set = (k) => (e) => setEditing({ ...editing, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })

  if (editing) {
    return (
      <section>
        <h2>{editing.id ? 'Edit search' : 'New search'}</h2>
        <form onSubmit={save}>
          <label>Name<input value={editing.name} onChange={set('name')} /></label>
          <label>
            Job series
            <input value={editing.series} onChange={set('series')} placeholder="0340, 0341, 0343" inputMode="numeric" />
            <span className="muted small">4-digit occupational series, separated by commas.</span>
          </label>
          <div className="two">
            <label>Lowest grade (GS)<input type="number" min="1" max="15" value={editing.grade_low} onChange={set('grade_low')} /></label>
            <label>Highest grade (GS)<input type="number" min="1" max="15" value={editing.grade_high} onChange={set('grade_high')} /></label>
          </div>
          <label>
            Agency code
            <input value={editing.agency} onChange={set('agency')} placeholder="VA" />
            <span className="muted small">VA = all of Veterans Affairs. Leave blank for every agency.</span>
          </label>
          <label>
            Locations (one per line)
            <textarea rows={4} value={editing.locations} onChange={set('locations')} placeholder={'Cheyenne, Wyoming\nDenver, Colorado'} />
          </label>
          <label>Search radius (miles)<input type="number" min="5" max="200" value={editing.radius_miles} onChange={set('radius_miles')} /></label>
          <label className="check"><input type="checkbox" checked={editing.include_remote} onChange={set('include_remote')} /> Include remote jobs anywhere</label>
          <label className="check"><input type="checkbox" checked={editing.active} onChange={set('active')} /> Active (included in searches and alerts)</label>
          {error && <p className="error" role="alert">{error}</p>}
          <div className="row">
            <button type="button" onClick={() => { setEditing(null); setError('') }}>Cancel</button>
            {editing.id && <button type="button" className="danger" onClick={() => remove(editing.id)}>Delete</button>}
            <button className="primary" disabled={busy} type="submit">Save</button>
          </div>
        </form>
      </section>
    )
  }

  return (
    <section>
      <h2>Saved searches</h2>
      {searches.length === 0 && <p className="muted">No searches yet. Add one to start finding jobs.</p>}
      <ul className="list">
        {searches.map((s) => (
          <li key={s.id} className="item" onClick={() => setEditing(toForm(s))}>
            <div className="item-title">{s.name}{!s.active && <span className="badge muted-badge">paused</span>}</div>
            <div className="muted small">
              {s.series.join(', ')} · GS-{s.grade_low} to {s.grade_high} · {s.agency || 'all agencies'}
            </div>
            <div className="muted small">
              {[...(s.locations || []), s.include_remote ? 'remote' : null].filter(Boolean).join(' · ') || 'anywhere'}
            </div>
          </li>
        ))}
      </ul>
      <button type="button" className="primary" onClick={() => setEditing({ ...EMPTY })}>Add a search</button>
    </section>
  )
}

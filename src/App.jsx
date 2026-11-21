import { useEffect, useState } from 'react'
import { supabase, APP_NAME } from './supabase'
import { friendlyError, MIN_PASSWORD } from './lib/auth'
import Jobs from './screens/Jobs'
import Resume from './screens/Resume'
import Searches from './screens/Searches'
import Account from './screens/Account'

function AuthScreen() {
  const [mode, setMode] = useState('signin') // 'signin' | 'signup'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(e) {
    e.preventDefault()
    setError('')
    const cleanEmail = email.trim().toLowerCase()
    if (mode === 'signup') {
      if (password.length < MIN_PASSWORD) return setError(`Use at least ${MIN_PASSWORD} characters.`)
      if (password !== confirm) return setError("Passwords don't match.")
    }
    setBusy(true)
    const { error } =
      mode === 'signin'
        ? await supabase.auth.signInWithPassword({ email: cleanEmail, password })
        : await supabase.auth.signUp({ email: cleanEmail, password })
    setBusy(false)
    if (error) setError(friendlyError(error))
  }

  return (
    <main className="card">
      <h1>{APP_NAME}</h1>
      <p className="muted">Federal job alerts and tailored resumes.</p>

      <div className="tabs" role="tablist">
        <button className={mode === 'signin' ? 'tab active' : 'tab'} onClick={() => { setMode('signin'); setError('') }} type="button">
          Sign in
        </button>
        <button className={mode === 'signup' ? 'tab active' : 'tab'} onClick={() => { setMode('signup'); setError('') }} type="button">
          Create account
        </button>
      </div>

      <form onSubmit={submit}>
        <label>
          Email
          <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          Password
          <input
            type="password"
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {mode === 'signup' && (
          <label>
            Confirm password
            <input type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </label>
        )}
        {error && <p className="error" role="alert">{error}</p>}
        <button className="primary" disabled={busy} type="submit">
          {busy ? 'One moment…' : mode === 'signin' ? 'Sign in' : 'Create account'}
        </button>
      </form>

      {mode === 'signin' && <p className="muted small">Forgot your password? Message Josh and he'll reset it.</p>}
      {mode === 'signup' && (
        <p className="muted small">
          Use a personal email, not your VA address. Your resume and drafts are stored in this app's database and sent to
          Claude (Anthropic) only when you ask for a tailored draft. You can delete your account and everything in it at
          any time.
        </p>
      )}
    </main>
  )
}

const TABS = [
  { id: 'jobs', label: 'Jobs' },
  { id: 'resume', label: 'Resume' },
  { id: 'searches', label: 'Searches' },
  { id: 'account', label: 'Account' },
]

function Shell({ session }) {
  const [tab, setTab] = useState('jobs')
  return (
    <div className="shell">
      <header className="topbar"><h1>{APP_NAME}</h1></header>
      <main className="card">
        {tab === 'jobs' && <Jobs goTo={setTab} />}
        {tab === 'resume' && <Resume session={session} />}
        {tab === 'searches' && <Searches session={session} />}
        {tab === 'account' && <Account session={session} />}
      </main>
      <nav className="tabbar">
        {TABS.map((t) => (
          <button key={t.id} type="button" className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </nav>
    </div>
  )
}

export default function App() {
  const [session, setSession] = useState(undefined)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  if (session === undefined) return <main className="card"><p className="muted">Loading…</p></main>
  return session ? <Shell session={session} /> : <AuthScreen />
}

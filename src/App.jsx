import { useEffect, useState } from 'react'
import { supabase, APP_NAME } from './supabase'

const MIN_PASSWORD = 8

function friendlyError(error) {
  const msg = error?.message || String(error)
  if (/database error saving new user/i.test(msg) || /invite-only/i.test(msg)) {
    return "This app is invite-only. Ask Josh to add your email, then try again."
  }
  if (/invalid login credentials/i.test(msg)) return 'Email or password is incorrect.'
  if (/already registered/i.test(msg)) return 'That email already has an account. Sign in instead.'
  return msg
}

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

function AccountScreen({ session }) {
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function changePassword(e) {
    e.preventDefault()
    setMsg(''); setError('')
    if (newPassword.length < MIN_PASSWORD) return setError(`Use at least ${MIN_PASSWORD} characters.`)
    if (newPassword !== confirm) return setError("Passwords don't match.")
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setBusy(false)
    if (error) return setError(friendlyError(error))
    setNewPassword(''); setConfirm('')
    setMsg('Password changed.')
  }

  async function deleteAccount() {
    const typed = window.prompt('This permanently deletes your account, resume, searches and drafts.\n\nType DELETE to confirm.')
    if (typed !== 'DELETE') return
    const { error } = await supabase.rpc('delete_my_account')
    if (error) return setError(friendlyError(error))
    await supabase.auth.signOut()
  }

  return (
    <main className="card">
      <h1>{APP_NAME}</h1>
      <p className="muted">Signed in as <strong>{session.user.email}</strong></p>

      <section className="placeholder">
        <h2>Coming next</h2>
        <p className="muted">Your resume, saved searches, matching jobs and "I want to apply" drafts will live here.</p>
      </section>

      <section>
        <h2>Change password</h2>
        <form onSubmit={changePassword}>
          <label>
            New password
            <input type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          </label>
          <label>
            Confirm new password
            <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </label>
          {error && <p className="error" role="alert">{error}</p>}
          {msg && <p className="ok">{msg}</p>}
          <button className="primary" disabled={busy} type="submit">Save new password</button>
        </form>
      </section>

      <section className="row">
        <button type="button" onClick={() => supabase.auth.signOut()}>Sign out</button>
        <button type="button" className="danger" onClick={deleteAccount}>Delete my account</button>
      </section>
    </main>
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
  return session ? <AccountScreen session={session} /> : <AuthScreen />
}

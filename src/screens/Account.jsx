import { useState } from 'react'
import { supabase } from '../supabase'
import { friendlyError, MIN_PASSWORD } from '../lib/auth'

export default function Account({ session }) {
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
    <section>
      <h2>Account</h2>
      <p className="muted">Signed in as <strong>{session.user.email}</strong></p>

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
    </section>
  )
}

export const MIN_PASSWORD = 8

export function friendlyError(error) {
  const msg = error?.message || String(error)
  if (/database error saving new user/i.test(msg) || /invite-only/i.test(msg)) {
    return 'This app is invite-only. Ask Josh to add your email, then try again.'
  }
  if (/invalid login credentials/i.test(msg)) return 'Email or password is incorrect.'
  if (/already registered/i.test(msg)) return 'That email already has an account. Sign in instead.'
  return msg
}

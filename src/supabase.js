import { createClient } from '@supabase/supabase-js'

// Public, browser-safe values (protected by the database's per-user access rules).
const SUPABASE_URL = 'https://krkgdiiijejcbnpblqwx.supabase.co'
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_Xkj6Kssodky_kLHUd3dwmA_HSkXizVi'

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
})

export const APP_NAME = 'Fed Job Scout'

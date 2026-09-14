import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'

let client: SupabaseClient | null = null

export function useSupabase(): SupabaseClient | null {
  if (client) return client
  const { supabaseUrl, supabaseAnonKey } = useRuntimeConfig().public
  if (!supabaseUrl || !supabaseAnonKey) return null
  client = createClient(supabaseUrl as string, supabaseAnonKey as string)
  return client
}

/** null while unknown, false when signed out — lets the UI avoid a flash */
export const useUser = () => useState<User | null | false>('user', () => null)

export function useAuth() {
  const user = useUser()
  const sb = useSupabase()

  async function init() {
    if (!sb) return (user.value = false)
    const { data } = await sb.auth.getSession()
    user.value = data.session?.user ?? false
    sb.auth.onAuthStateChange((_e, s) => (user.value = s?.user ?? false))
  }

  async function signIn(email: string) {
    if (!sb) throw new Error('Supabase is not configured')
    const { error } = await sb.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin }
    })
    if (error) throw error
  }

  async function signOut() {
    await sb?.auth.signOut()
    user.value = false
  }

  return { user, init, signIn, signOut }
}

// ------------------------------------------------------------------ push

function urlBase64ToUint8Array(base64: string) {
  const padded = (base64.trim() + '='.repeat((4 - (base64.trim().length % 4)) % 4))
    .replace(/-/g, '+')
    .replace(/_/g, '/')
  const raw = atob(padded)
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

/**
 * A VAPID public key is an uncompressed P-256 point: 65 bytes starting with
 * 0x04, which is 87 base64url characters. The private key is 32 bytes / 43
 * characters, and pasting that one instead is the usual cause of the browser's
 * unhelpful "Registration failed - push service error".
 */
function checkVapidKey(key: string): Uint8Array {
  let bytes: Uint8Array
  try {
    bytes = urlBase64ToUint8Array(key)
  } catch {
    throw new Error('VAPID public key is not valid base64url — re-copy it')
  }
  if (bytes.length === 32) {
    throw new Error('That is the VAPID *private* key (32 bytes). Use the public one.')
  }
  if (bytes.length !== 65 || bytes[0] !== 0x04) {
    throw new Error(
      `VAPID public key should be 65 bytes starting 0x04, got ${bytes.length}`
    )
  }
  return bytes
}

const sameKey = (a: ArrayBuffer | null, b: Uint8Array) => {
  if (!a) return false
  const x = new Uint8Array(a)
  return x.length === b.length && x.every((v, i) => v === b[i])
}

export function usePush() {
  const sb = useSupabase()
  const { vapidPublicKey } = useRuntimeConfig().public

  const supported = () =>
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window

  const permission = () => (supported() ? Notification.permission : 'unsupported')

  async function save(sub: PushSubscription | PushSubscriptionJSON) {
    if (!sb) throw new Error('Supabase is not configured')
    const { data } = await sb.auth.getUser()
    if (!data.user) throw new Error('Sign in first')

    const j = 'toJSON' in sub ? (sub as PushSubscription).toJSON() : sub
    if (!j.endpoint || !j.keys?.p256dh || !j.keys?.auth) {
      throw new Error('The browser returned an incomplete subscription')
    }

    // surfaced rather than swallowed: a failed insert here is exactly why
    // the server later reports no subscribed device
    const { error } = await sb.from('push_subscriptions').upsert(
      {
        user_id: data.user.id,
        endpoint: j.endpoint,
        p256dh: j.keys.p256dh,
        auth: j.keys.auth,
        user_agent: navigator.userAgent
      },
      { onConflict: 'endpoint' }
    )
    if (error) throw new Error(`Could not save the subscription: ${error.message}`)
  }

  /**
   * Asked for after a completed session rather than on first load — a cold
   * permission prompt gets denied, and a denied prompt is hard to recover.
   */
  async function enable(): Promise<{ state: string; error?: string }> {
    if (!supported()) return { state: 'unsupported' }
    if (!sb) return { state: 'off', error: 'Supabase is not configured' }
    if (!vapidPublicKey) {
      return { state: 'off', error: 'NUXT_PUBLIC_VAPID_PUBLIC_KEY is missing from .env' }
    }

    const granted = await Notification.requestPermission()
    if (granted !== 'granted') return { state: 'denied' }

    try {
      // `ready` never resolves if no worker is registered — without a timeout
      // this just hangs and looks like nothing happened
      const reg = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error('No service worker registered — reload the page once')),
            8000
          )
        )
      ])

      const appKey = checkVapidKey(vapidPublicKey as string)

      // Chrome refuses to subscribe when a subscription already exists under
      // a different application server key, so clear a stale one first.
      let existing = await reg.pushManager.getSubscription()
      if (existing && !sameKey(existing.options.applicationServerKey, appKey)) {
        await existing.unsubscribe()
        existing = null
      }

      const sub =
        existing ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: appKey
        }))

      await save(sub)
      return { state: 'granted' }
    } catch (e) {
      const msg = (e as Error).message
      // the browser's own wording gives no clue what to fix
      if (/push service error|Registration failed/i.test(msg)) {
        return {
          state: 'off',
          error:
            'The push service rejected the key. Check NUXT_PUBLIC_VAPID_PUBLIC_KEY ' +
            'is the public half and matches the one set on the Edge Function.'
        }
      }
      return { state: 'off', error: msg }
    }
  }

  async function disable() {
    if (!supported() || !sb) return
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    if (!sub) return
    await sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
    await sub.unsubscribe()
  }

  /** fire one at this device now, so the path can be proved end to end */
  async function test(): Promise<string> {
    const sb2 = useSupabase()
    if (!sb2) return 'Supabase is not configured'
    const { data, error } = await sb2.functions.invoke('dispatch', {
      body: { test: true }
    })
    if (error) return error.message
    if (data?.ok) return 'Sent — it should appear in a moment'
    return data?.error ?? data?.errors?.[0] ?? 'Nothing was sent'
  }

  /** the worker tells us when the browser rotated the endpoint */
  function listen() {
    if (!supported()) return
    navigator.serviceWorker.addEventListener('message', (e) => {
      if (e.data?.type === 'push-resubscribed') save(e.data.subscription)
    })
  }

  return { supported, permission, enable, disable, listen, test }
}

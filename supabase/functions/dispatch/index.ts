// Dispatches due push notifications. Called by pg_cron every five minutes.
//
// pg_cron runs on UTC. Every "is it 9am for this person" decision is made here
// against the profile's IANA timezone, never against server time.

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { sendNotification, checkVapid, PushError, type VapidDetails } from './webpush.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!

/**
 * Supabase injects the key itself — nothing to set in Secrets. Legacy
 * projects get SUPABASE_SERVICE_ROLE_KEY; projects created after the API key
 * change get SUPABASE_SECRET_KEYS instead, which holds a JSON array.
 */
function serviceKey(): string {
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (legacy) return legacy

  const modern = Deno.env.get('SUPABASE_SECRET_KEYS')
  if (modern) {
    try {
      const parsed = JSON.parse(modern)
      const first = Array.isArray(parsed) ? parsed[0] : parsed
      if (typeof first === 'string') return first
      if (first?.api_key) return first.api_key
    } catch {
      return modern // already a bare string
    }
  }
  return ''
}

const SERVICE_KEY = serviceKey()
const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY') ?? ''
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:routine@example.com'

/**
 * Nothing at module scope is allowed to throw. A crash here shows up as an
 * opaque WORKER_ERROR with no clue which secret is missing — so configuration
 * problems are collected and reported in the response body instead.
 */
const problems: string[] = []
if (!SERVICE_KEY) problems.push('service key missing from the environment')
if (!VAPID_PUBLIC) problems.push('VAPID_PUBLIC_KEY is not set')
if (!VAPID_PRIVATE) problems.push('VAPID_PRIVATE_KEY is not set')

const vapid: VapidDetails = {
  subject: VAPID_SUBJECT,
  publicKey: VAPID_PUBLIC,
  privateKey: VAPID_PRIVATE
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY || 'missing', {
  auth: { persistSession: false }
})

/**
 * pg_cron calls this server to server, where CORS never applies. The test
 * button calls it from the browser, which sends an OPTIONS preflight first
 * and then checks the headers — without these it fails before reaching any
 * of the logic below.
 */
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: CORS })

/** how wide a window counts as "due" — matches the cron interval */
const WINDOW_MIN = 5

type DayType = 'gym' | 'home' | 'rest' | 'easy'

interface Settings {
  timezone: string
  dayResetHour: number
  dayTypes: DayType[]
  sessionTimes: string[]
  medTime: string
  medLabel?: string
  gymTime: string
  homeTime: string
  workStart: string
  workEnd: string
  breakInterval: number
  discreet: boolean
}

const DEFAULTS: Settings = {
  timezone: 'Asia/Dhaka',
  dayResetHour: 4,
  dayTypes: ['gym', 'home', 'home', 'gym', 'home', 'rest', 'easy'],
  sessionTimes: ['09:00', '14:00', '00:00'],
  medTime: '23:00',
  medLabel: 'Daily tablet',
  gymTime: '07:00',
  homeTime: '21:00',
  workStart: '10:00',
  workEnd: '19:00',
  breakInterval: 45,
  discreet: true
}

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

/** the wall clock in a given zone, as parts we can do arithmetic on */
function wallClock(tz: string) {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', weekday: 'short',
    hour12: false
  })
  const p = Object.fromEntries(f.formatToParts(new Date()).map((x) => [x.type, x.value]))
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    minutes: Number(p.hour) * 60 + Number(p.minute),
    weekday: days.indexOf(p.weekday as string)
  }
}

interface Due {
  kind: string
  title: string
  body: string
  url: string
  /** the exact slot this fires for — the dedupe key, not just the date */
  slot: string
}

function dueFor(s: Settings): Due[] {
  const { date, minutes, weekday } = wallClock(s.timezone)
  const reset = s.dayResetHour * 60

  // before the reset hour we are still on yesterday's logical day
  const logicalWeekday = minutes < reset ? (weekday + 6) % 7 : weekday
  const dayType = s.dayTypes[logicalWeekday] ?? 'home'

  const now = minutes < reset ? minutes + 1440 : minutes
  const logical = (t: string) => {
    const m = toMinutes(t)
    return m < reset ? m + 1440 : m
  }
  const isDue = (t: string) => {
    const at = logical(t)
    return now >= at && now < at + WINDOW_MIN
  }

  const out: Due[] = []
  const label = (plain: string, open: string) => (s.discreet ? plain : open)

  // A slot is the local date plus the minute it was scheduled for. Two
  // reminders of the same kind on one day (stand-up breaks) must produce
  // different keys, or only the first would ever be sent.
  const slotAt = (mins: number) => {
    const h = String(Math.floor((mins % 1440) / 60)).padStart(2, '0')
    const m = String(mins % 60).padStart(2, '0')
    return `${date}T${h}:${m}:00Z`
  }

  s.sessionTimes.forEach((t, i) => {
    if (!isDue(t)) return
    out.push({
      kind: `session-${i + 1}`,
      title: 'Routine',
      body: label(`Session ${i + 1} of 3`, `Pelvic floor — session ${i + 1} of 3`),
      url: '/session',
      slot: slotAt(toMinutes(t))
    })
  })

  if (isDue(s.medTime)) {
    out.push({
      kind: 'tablet',
      title: 'Routine',
      body: label('Daily tablet', s.medLabel ?? 'Daily tablet'),
      url: '/',
      slot: slotAt(toMinutes(s.medTime))
    })
  }

  // no cardio reminder at all on rest days, and never both on one day
  if (dayType === 'gym' && isDue(s.gymTime)) {
    out.push({
      kind: 'cardio',
      title: 'Today',
      body: label('Gym — 30 min', 'Gym: run 30 min, then leg work'),
      url: '/',
      slot: slotAt(toMinutes(s.gymTime))
    })
  }
  if (dayType === 'home' && isDue(s.homeTime)) {
    out.push({
      kind: 'cardio',
      title: 'Today',
      body: label('30 min tonight', 'Home aerobic — 30 min'),
      url: '/aerobic',
      slot: slotAt(toMinutes(s.homeTime))
    })
  }

  // stand-up breaks, only inside work hours, on the interval
  const ws = toMinutes(s.workStart)
  const we = toMinutes(s.workEnd)
  if (minutes >= ws && minutes <= we) {
    const since = minutes - ws
    if (since > 0 && since % s.breakInterval < WINDOW_MIN) {
      const slotMin = ws + Math.floor(since / s.breakInterval) * s.breakInterval
      out.push({
        kind: 'break',
        title: 'Stand up',
        body: `You've been sitting ${s.breakInterval} minutes`,
        url: '/',
        slot: slotAt(slotMin)
      })
    }
  }

  return out
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  // ?check=1 reports configuration without touching anything
  const check = new URL(req.url).searchParams.has('check')
  const body = await req.json().catch(() => ({} as Record<string, unknown>))

  if (problems.length) {
    return json({
      ok: false,
      problems,
      hint: 'supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=...'
    })
  }
  if (check) {
    try {
      await checkVapid(vapid)
      return json({ ok: true, vapid: 'signs correctly' })
    } catch (e) {
      return json({ ok: false, vapid: (e as Error).message })
    }
  }

  /**
   * A signed-in user can fire one notification at themselves right now, so
   * the whole path can be proved without waiting for a scheduled slot.
   * Bypasses the schedule and the dedupe log — this is not a real reminder.
   */
  if (body.test) {
    const token = req.headers.get('Authorization')?.replace(/^Bearer /, '') ?? ''
    const { data: who } = await admin.auth.getUser(token)
    if (!who?.user) {
      return json({ ok: false, error: 'sign in first' })
    }

    const { data: subs } = await admin
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .eq('user_id', who.user.id)

    if (!subs?.length) {
      return json({
        ok: false,
        error: 'no device subscribed — turn reminders on first'
      })
    }

    const payload = JSON.stringify({
      title: 'Routine',
      body: 'Test — reminders are working',
      url: '/',
      tag: 'test'
    })

    let sent = 0
    const errors: string[] = []
    for (const sub of subs) {
      try {
        await sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
          vapid
        )
        sent++
      } catch (e) {
        const code = e instanceof PushError ? e.statusCode : 0
        if (code === 404 || code === 410) {
          await admin.from('push_subscriptions').delete().eq('id', sub.id)
          errors.push('subscription expired — turn reminders off and on again')
        } else {
          errors.push((e as Error).message)
        }
      }
    }
    return json({ ok: sent > 0, sent, errors })
  }

  const { data: profiles, error } = await admin.from('profiles').select('id, settings')
  if (error) return json({ ok: false, error: error.message })

  let sent = 0
  let pruned = 0

  for (const profile of profiles ?? []) {
    const settings: Settings = { ...DEFAULTS, ...(profile.settings ?? {}) }

    let due: Due[]
    try {
      due = dueFor(settings)
    } catch {
      continue // a bad timezone on one profile must not stop the rest
    }
    if (!due.length) continue

    const { data: subs } = await admin
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .eq('user_id', profile.id)
    if (!subs?.length) continue

    for (const d of due) {
      // claim the slot first; a duplicate key means another tick already sent it
      const { error: claim } = await admin.from('notification_log').insert({
        user_id: profile.id,
        kind: d.kind,
        scheduled_for: d.slot
      })
      // a unique violation means an earlier tick already sent this exact slot
      if (claim) continue

      const payload = JSON.stringify({
        title: d.title,
        body: d.body,
        url: d.url,
        tag: d.kind
      })

      for (const sub of subs) {
        try {
          await sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth }
            },
            payload,
            vapid
          )
          sent++
          await admin
            .from('push_subscriptions')
            .update({ last_ok_at: new Date().toISOString() })
            .eq('id', sub.id)
        } catch (e) {
          const code = e instanceof PushError ? e.statusCode : 0
          // 404 / 410 mean the browser threw the subscription away
          if (code === 404 || code === 410) {
            await admin.from('push_subscriptions').delete().eq('id', sub.id)
            pruned++
          }
        }
      }
    }
  }

  return json({ ok: true, sent, pruned, profiles: profiles?.length ?? 0 })
})

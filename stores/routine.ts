import { defineStore } from 'pinia'

export type DayType = 'gym' | 'home' | 'rest' | 'easy'

export interface DayLog {
  sessions: number
  med: boolean
  cardio: { minutes: number; venue: 'gym' | 'home' | 'walk' } | null
  leg: boolean
  breaks: number[]
}

export interface Settings {
  /** IANA zone — all day boundaries and clocks resolve in this zone */
  timezone: string
  /**
   * The logical day rolls over at this hour, not at midnight. A session done
   * at 12:00 AM belongs to the day that is ending, not to the one starting.
   */
  dayResetHour: number
  /** index 0 = Sunday */
  dayTypes: DayType[]
  sessionTimes: string[]
  medTime: string
  gymTime: string
  homeTime: string
  workStart: string
  workEnd: string
  breakInterval: number
  cardioTarget: number
  discreet: boolean
}

const STORAGE_KEY = 'routine.v1'

export const MAX_SESSIONS = 3

const DEFAULTS: Settings = {
  timezone: 'Asia/Dhaka',
  dayResetHour: 4,
  dayTypes: ['gym', 'home', 'home', 'gym', 'home', 'rest', 'easy'],
  sessionTimes: ['09:00', '14:00', '00:00'],
  medTime: '23:00',
  gymTime: '07:00',
  homeTime: '21:00',
  workStart: '10:00',
  workEnd: '19:00',
  breakInterval: 45,
  cardioTarget: 30,
  discreet: true
}

export function emptyLog(): DayLog {
  return { sessions: 0, med: false, cardio: null, leg: false, breaks: [] }
}

/** shift a clock time back by the reset hour before taking its date */
export function logicalDate(d: Date, resetHour = 4): Date {
  const shifted = new Date(d)
  shifted.setHours(shifted.getHours() - resetHour)
  return shifted
}

export function dateKey(d = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export const HEADLINES: Record<DayType, { title: string; sub: string }> = {
  gym: { title: 'GYM', sub: 'MORNING' },
  home: { title: 'HOME', sub: 'TONIGHT' },
  rest: { title: 'REST', sub: 'ALL DAY' },
  easy: { title: 'EASY', sub: 'IF YOU WANT' }
}

export const useRoutine = defineStore('routine', {
  state: () => ({
    settings: { ...DEFAULTS } as Settings,
    logs: {} as Record<string, DayLog>,
    now: new Date(),
    loaded: false,
    /** 'off' when Supabase is not configured — the app still works locally */
    sync: 'off' as 'off' | 'idle' | 'saving' | 'error',
    /** true while the realtime channel is subscribed */
    live: false,
    channel: null as any,
    dirty: new Set<string>()
  }),

  getters: {
    todayKey: (s) => dateKey(logicalDate(s.now, s.settings.dayResetHour)),

    /** the weekday of the logical day, so 12:30 AM is still last night */
    weekdayIndex: (s) => logicalDate(s.now, s.settings.dayResetHour).getDay(),

    dayType(): DayType {
      return this.settings.dayTypes[this.weekdayIndex] ?? 'home'
    },

    headline(): { title: string; sub: string } {
      return HEADLINES[this.dayType]
    },

    today(): DayLog {
      return this.logs[this.todayKey] ?? emptyLog()
    },

    /** minutes since midnight, local */
    minutesNow(): number {
      return this.now.getHours() * 60 + this.now.getMinutes()
    },

    /**
     * Minutes on the logical day's timeline: anything before the reset hour
     * counts as late the previous evening, so 12:00 AM sorts after 11:00 PM
     * instead of before 9:00 AM.
     */
    logicalNow(): number {
      const reset = this.settings.dayResetHour * 60
      return this.minutesNow < reset ? this.minutesNow + 1440 : this.minutesNow
    },

    medDue(): boolean {
      return this.logicalNow >= this.logical(this.settings.medTime)
    },

    cardioDue(): boolean {
      if (this.dayType === 'gym') return this.logicalNow >= this.logical(this.settings.gymTime)
      if (this.dayType === 'home') return this.logicalNow >= this.logical(this.settings.homeTime)
      return true
    },

    /** the next scheduled reminder on the logical timeline */
    nextReminderAt(): number {
      const times = [
        ...this.settings.sessionTimes.map((t) => this.logical(t)),
        this.logical(this.settings.medTime)
      ].sort((a, b) => a - b)
      const upcoming = times.find((m) => m > this.logicalNow)
      return upcoming ?? times[0]
    },

    /** minutes until the next stand-up break, or null outside work hours */
    nextBreakIn(): number | null {
      const start = toMinutes(this.settings.workStart)
      const end = toMinutes(this.settings.workEnd)
      const n = this.minutesNow
      if (n < start || n > end) return null
      const last = this.today.breaks.length ? this.today.breaks[this.today.breaks.length - 1] : start
      return Math.max(0, last + this.settings.breakInterval - n)
    },

    /** when today's activity is meant to happen, as a 12-hour clock */
    activityTime(): string {
      if (this.dayType === 'gym') return fmt12(this.settings.gymTime)
      if (this.dayType === 'home') return fmt12(this.settings.homeTime)
      return this.dayType === 'rest' ? 'ALL DAY' : 'IF YOU WANT'
    },

    /**
     * Leg work only happens on gym days, so two gym days in a row leaves the
     * same muscles under 48 hours to recover. Surfaced as a warning rather
     * than a block — it is the user's week.
     */
    gymDaysAdjacent(): boolean {
      const t = this.settings.dayTypes
      return t.some((d, i) => d === 'gym' && t[(i + 1) % 7] === 'gym')
    },

    greeting(): string {
      return greeting(this.minutesNow)
    },

    weekCounts(): { cardio: number; easy: number; rest: number } {
      const c = { cardio: 0, easy: 0, rest: 0 }
      for (const t of this.settings.dayTypes) {
        if (t === 'gym' || t === 'home') c.cardio++
        else if (t === 'easy') c.easy++
        else c.rest++
      }
      return c
    },

    /** 0..1 — how much of today is lit */
    lightLevel(): number {
      const log = this.today
      let done = 0
      let total = 0
      total += MAX_SESSIONS
      done += log.sessions
      total += 1
      if (log.med) done += 1
      if (this.dayType === 'gym') {
        total += 2
        if (log.cardio) done += 1
        if (log.leg) done += 1
      } else if (this.dayType === 'home') {
        total += 1
        if (log.cardio) done += 1
      }
      return total ? done / total : 0
    }
  },

  actions: {
    load() {
      if (this.loaded || typeof window === 'undefined') return
      try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (raw) {
          const parsed = JSON.parse(raw)
          this.settings = { ...DEFAULTS, ...(parsed.settings ?? {}) }
          this.logs = parsed.logs ?? {}
        }
      } catch {
        /* first run, or corrupt — fall back to defaults */
      }
      this.loaded = true
      this.tick()
      setInterval(() => this.tick(), 30_000)

      const sb = useSupabase()
      if (sb) {
        this.sync = 'idle'
        this.pull().then(() => this.listen())
        window.addEventListener('online', () => {
          this.push()
          this.listen()
        })
        sb.auth.onAuthStateChange((_e: string, session: any) => {
          if (session) this.pull().then(() => this.listen())
          else if (this.channel) {
            sb.removeChannel(this.channel)
            this.channel = null
            this.live = false
          }
        })
      }
    },

    tick() {
      // read the wall clock in the configured zone, not the device zone,
      // so a travelling phone does not shift the day boundary
      const tz = this.settings.timezone
      try {
        const s = new Date().toLocaleString('en-US', { timeZone: tz })
        this.now = new Date(s)
      } catch {
        this.now = new Date()
      }
    },

    persist(key?: string) {
      if (typeof window === 'undefined') return
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ settings: this.settings, logs: this.logs })
        )
      } catch {
        /* quota or private mode — the app still works for this session */
      }
      // localStorage stays the source of truth offline; the cloud catches up
      this.dirty.add(key ?? this.todayKey)
      this.queueSync()
    },

    // ---------------------------------------------------------- supabase

    /**
     * Pull the server's copy on sign-in. Anything logged offline stays —
     * remote wins per day only where the local side has nothing.
     */
    async pull() {
      const sb = useSupabase()
      if (!sb) return
      const { data: auth } = await sb.auth.getUser()
      if (!auth.user) return
      this.sync = 'idle'

      const [{ data: profile }, { data: rows }] = await Promise.all([
        sb.from('profiles').select('settings').eq('id', auth.user.id).maybeSingle(),
        sb.from('day_logs').select('*').eq('user_id', auth.user.id)
      ])

      if (profile?.settings && Object.keys(profile.settings).length) {
        this.settings = { ...this.settings, ...profile.settings }
      }

      for (const row of rows ?? []) {
        const local = this.logs[row.log_date]
        const remote: DayLog = {
          sessions: row.sessions ?? 0,
          med: !!row.med,
          leg: !!row.leg,
          cardio: row.cardio ?? null,
          breaks: row.breaks ?? []
        }
        // merge rather than overwrite: whichever side did more, keeps it
        this.logs[row.log_date] = local
          ? {
              sessions: Math.max(local.sessions, remote.sessions),
              med: local.med || remote.med,
              leg: local.leg || remote.leg,
              cardio: local.cardio ?? remote.cardio,
              breaks: local.breaks.length >= remote.breaks.length ? local.breaks : remote.breaks
            }
          : remote
      }

      this.cache()

      // Everything already logged on this phone has to go up on first
      // sign-in. push() only sends dirty keys, and nothing is dirty after a
      // cold load — so mark the whole local history before flushing.
      Object.keys(this.logs).forEach((k) => this.dirty.add(k))
      await this.push()
    },

    /**
     * Live sync across devices. Applying a remote row uses the same merge as
     * pull(), which is idempotent — so our own change echoing back is a
     * no-op and there is no feedback loop to guard against.
     */
    async listen() {
      const sb = useSupabase()
      if (!sb) return
      const { data: auth } = await sb.auth.getUser()
      if (!auth.user) return

      if (this.channel) sb.removeChannel(this.channel)

      this.channel = sb
        .channel('routine')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'day_logs',
            filter: `user_id=eq.${auth.user.id}`
          },
          ({ new: row }: any) => {
            if (!row?.log_date) return
            this.applyRemote(row.log_date, {
              sessions: row.sessions ?? 0,
              med: !!row.med,
              leg: !!row.leg,
              cardio: row.cardio ?? null,
              breaks: row.breaks ?? []
            })
          }
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'profiles',
            filter: `id=eq.${auth.user.id}`
          },
          ({ new: row }: any) => {
            if (!row?.settings || !Object.keys(row.settings).length) return
            this.settings = { ...this.settings, ...row.settings }
            this.cache()
          }
        )
        .subscribe((status: string) => {
          this.live = status === 'SUBSCRIBED'
        })
    },

    applyRemote(key: string, remote: DayLog) {
      const local = this.logs[key]
      this.logs[key] = local
        ? {
            sessions: Math.max(local.sessions, remote.sessions),
            med: local.med || remote.med,
            leg: local.leg || remote.leg,
            cardio: local.cardio ?? remote.cardio,
            breaks:
              local.breaks.length >= remote.breaks.length ? local.breaks : remote.breaks
          }
        : remote
      this.cache()
    },

    cache() {
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ settings: this.settings, logs: this.logs })
        )
      } catch {
        /* quota or private mode */
      }
    },

    queueSync() {
      if (this.sync === 'off' || typeof window === 'undefined') return
      clearTimeout((this as any)._t)
      ;(this as any)._t = setTimeout(() => this.push(), 1200)
    },

    async push() {
      const sb = useSupabase()
      if (!sb || this.sync === 'off') return
      const { data: auth } = await sb.auth.getUser()
      if (!auth.user) return

      const keys = [...this.dirty]
      this.dirty.clear()
      this.sync = 'saving'

      try {
        await sb.from('profiles').upsert({
          id: auth.user.id,
          settings: this.settings,
          updated_at: new Date().toISOString()
        })

        if (keys.length) {
          await sb.from('day_logs').upsert(
            keys.map((k) => ({
              user_id: auth.user!.id,
              log_date: k,
              ...(this.logs[k] ?? emptyLog())
            })),
            { onConflict: 'user_id,log_date' }
          )
        }
        this.sync = 'idle'
      } catch {
        // offline or rejected — put the keys back and try on the next change
        keys.forEach((k) => this.dirty.add(k))
        this.sync = 'error'
      }
    },

    /** put a clock time on the logical day's timeline */
    logical(hhmm: string): number {
      const m = toMinutes(hhmm)
      return m < this.settings.dayResetHour * 60 ? m + 1440 : m
    },

    log(key = this.todayKey): DayLog {
      if (!this.logs[key]) this.logs[key] = emptyLog()
      return this.logs[key]
    },

    /**
     * Three sessions is the daily target. A fourth is refused rather than
     * counted — an over-worked pelvic floor becomes hypertonic, which works
     * against the point of the routine.
     */
    addSession(): boolean {
      const l = this.log()
      if (l.sessions >= MAX_SESSIONS) return false
      l.sessions++
      this.persist()
      return true
    },

    toggleMed() {
      const l = this.log()
      l.med = !l.med
      this.persist()
    },

    toggleLeg() {
      const l = this.log()
      l.leg = !l.leg
      this.persist()
    },

    logCardio(minutes: number, venue: 'gym' | 'home' | 'walk') {
      const l = this.log()
      l.cardio = l.cardio && l.cardio.minutes === minutes && l.cardio.venue === venue
        ? null
        : { minutes, venue }
      this.persist()
    },

    takeBreak() {
      const l = this.log()
      l.breaks.push(this.minutesNow)
      this.persist()
    },

    setDayType(index: number, type: DayType) {
      this.settings.dayTypes[index] = type
      this.persist()
    },

    setSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
      this.settings[key] = value
      this.persist()
    },

    exportJSON(): string {
      return JSON.stringify({ settings: this.settings, logs: this.logs }, null, 2)
    },

    reset() {
      this.settings = { ...DEFAULTS }
      this.logs = {}
      this.persist()
    }
  }
})

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

/** 14:00 -> 2:00 PM */
export function fmt12(hhmm: string): string {
  return fmtClock(toMinutes(hhmm))
}

/** minutes-since-midnight -> 2:00 PM */
export function fmtClock(mins: number): string {
  const h24 = Math.floor(mins / 60) % 24
  const m = mins % 60
  const suffix = h24 < 12 ? 'AM' : 'PM'
  const h = h24 % 12 === 0 ? 12 : h24 % 12
  return `${h}:${String(m).padStart(2, '0')} ${suffix}`
}

/** the greeting depends on the clock, not on which day type today is */
export function greeting(mins: number): string {
  if (mins < 300) return 'Late night'
  if (mins < 720) return 'Good morning'
  if (mins < 1020) return 'Good afternoon'
  return 'Good evening'
}

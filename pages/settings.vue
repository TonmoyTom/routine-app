<script setup lang="ts">
import { useRoutine, fmt12, type DayType } from '~/stores/routine'

const r = useRoutine()
const { user, init, signIn, signOut } = useAuth()
const push = usePush()

const email = ref('')
const sent = ref(false)
const authErr = ref('')
const pushState = ref<string>('default')
const busy = ref(false)
const testMsg = ref('')

onMounted(async () => {
  r.load()
  await init()
  pushState.value = push.permission()
  push.listen()
})

async function sendLink() {
  authErr.value = ''
  busy.value = true
  try {
    await signIn(email.value.trim())
    sent.value = true
  } catch (e: any) {
    authErr.value = e?.message ?? 'Could not send the link'
  } finally {
    busy.value = false
  }
}

async function sendTest() {
  busy.value = true
  testMsg.value = 'Sending…'
  testMsg.value = await push.test()
  busy.value = false
}

async function toggleNotifications() {
  busy.value = true
  testMsg.value = ''
  if (pushState.value === 'granted') {
    await push.disable()
    pushState.value = 'off'
  } else {
    const res = await push.enable()
    pushState.value = res.state
    if (res.error) testMsg.value = res.error
  }
  busy.value = false
}

const syncLabel = computed(() => {
  if (r.sync === 'off') return 'local only'
  if (r.sync === 'saving') return 'saving…'
  if (r.sync === 'error') return 'will retry'
  return r.live ? 'live' : 'synced'
})

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const TYPES: DayType[] = ['gym', 'home', 'easy', 'rest']

function cycle(i: number) {
  const cur = r.settings.dayTypes[i]
  const next = TYPES[(TYPES.indexOf(cur) + 1) % TYPES.length]
  r.setDayType(i, next)
}

function exportFile() {
  const blob = new Blob([r.exportJSON()], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `routine-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(a.href)
}
</script>

<template>
  <div class="screen">
    <header class="head">
      <h1 class="headline small">SETTINGS</h1>
    </header>

    <section>
      <h2>Reminders</h2>
      <div class="row">
        <span>Sessions</span>
        <span class="val tabular">{{ r.settings.sessionTimes.map(fmt12).join(' · ') }}</span>
      </div>
      <div class="row">
        <span>Tablet</span>
        <span class="val tabular">{{ fmt12(r.settings.medTime) }}</span>
      </div>
      <div class="row">
        <span>Work hours</span>
        <span class="val tabular">
          {{ fmt12(r.settings.workStart) }} – {{ fmt12(r.settings.workEnd) }}
        </span>
      </div>
      <div class="row">
        <span>Stand up every</span>
        <span class="val tabular">{{ r.settings.breakInterval }} min</span>
      </div>
      <div class="row">
        <span>Day rolls over at</span>
        <span class="val tabular">{{ fmt12(`0${r.settings.dayResetHour}:00`) }}</span>
      </div>
      <p class="help">
        The day ends at 4:00 AM, not midnight — so a session done at 12:00 AM
        still counts for the evening it belongs to.
      </p>

    </section>

    <section>
      <h2>The week</h2>
      <button v-for="(d, i) in DAYS" :key="d" class="row tap" @click="cycle(i)">
        <span>{{ d }}</span>
        <span class="pill" :class="`p-${r.settings.dayTypes[i]}`">
          {{ r.settings.dayTypes[i] }}
        </span>
      </button>

      <p class="count tabular">
        {{ r.weekCounts.cardio }} cardio · {{ r.weekCounts.easy }} easy ·
        {{ r.weekCounts.rest }} rest
      </p>

      <p v-if="r.gymDaysAdjacent" class="warn">
        Two gym days in a row. Leg work needs about 48 hours between sessions —
        muscle gets stronger during the rest, not during the lift. Try spacing
        them with two days in between.
      </p>

      <p class="help">Tap a day to change its type.</p>
    </section>

    <section>
      <h2>Account</h2>

      <template v-if="user">
        <div class="row">
          <span>Signed in</span>
          <span class="val">{{ user.email }}</span>
        </div>
        <div class="row">
          <span>Backup</span>
          <span class="val">
            <i class="dot" :class="{ live: r.live }" />{{ syncLabel }}
          </span>
        </div>
        <button class="row tap" @click="signOut()">
          <span>Sign out</span>
          <span class="val">→</span>
        </button>
      </template>

      <template v-else-if="user === false">
        <div v-if="sent" class="note-card">
          Check your email and open the link on this phone. It signs you in and
          starts backing the log up.
        </div>
        <template v-else>
          <input
            v-model="email"
            class="field"
            type="email"
            inputmode="email"
            autocomplete="email"
            placeholder="you@email.com"
          />
          <button class="row tap" :disabled="busy || !email" @click="sendLink">
            <span>Email me a sign-in link</span>
            <span class="val">→</span>
          </button>
          <p v-if="authErr" class="warn">{{ authErr }}</p>
        </template>
        <p class="help">
          Optional. Without an account everything still works, but the log lives
          only on this phone and reminders cannot be sent.
        </p>
      </template>
    </section>

    <section>
      <h2>Notifications</h2>
      <button
        class="row tap"
        :disabled="busy || !user"
        @click="toggleNotifications"
      >
        <span>Reminders</span>
        <span class="val">
          {{
            pushState === 'granted'
              ? 'on'
              : pushState === 'denied'
                ? 'blocked'
                : pushState === 'unsupported'
                  ? 'not supported'
                  : 'off'
          }}
        </span>
      </button>
      <button
        v-if="pushState === 'granted'"
        class="row tap"
        :disabled="busy"
        @click="sendTest"
      >
        <span>Send a test</span>
        <span class="val">→</span>
      </button>
      <p v-if="testMsg" class="note-card">{{ testMsg }}</p>

      <p v-if="!user" class="help">Sign in first — reminders are sent from the server.</p>
      <p v-else-if="pushState === 'denied'" class="warn">
        The browser is blocking notifications for this site. Turn them back on
        in the site settings, then try again here.
      </p>
      <p v-else class="help">
        On iPhone, add the app to the home screen first — Safari only allows
        notifications for installed apps.
      </p>
    </section>

    <section>
      <h2>Privacy</h2>
      <button class="row tap" @click="r.setSetting('discreet', !r.settings.discreet)">
        <span>Discreet labels</span>
        <span class="val">{{ r.settings.discreet ? 'on' : 'off' }}</span>
      </button>
      <p class="help">
        On, notifications will read “Routine” and “Session 1 of 3” on the lock
        screen. Off, they name the task.
      </p>
    </section>

    <section>
      <h2>Data</h2>
      <button class="row tap" @click="exportFile">
        <span>Export JSON</span>
        <span class="val">→</span>
      </button>
      <button class="row tap" @click="r.reset()">
        <span>Reset everything</span>
        <span class="val">→</span>
      </button>
    </section>

    <div class="spacer" />
    <BottomNav />
  </div>
</template>

<style scoped>
.head { padding: 34px 26px 0 }
.back { font-size: 22px; color: var(--muted) }
.headline.small { margin: 0; font-size: 44px; font-variation-settings: 'opsz' 44, 'wdth' 86 }
section { margin: 38px 26px 0 }
h2 { margin: 0 0 10px; font-size: 13px; font-weight: 600; letter-spacing: .02em; color: var(--muted) }
.row {
  display: flex; align-items: center; justify-content: space-between;
  gap: 16px; width: 100%; min-height: 58px; margin-bottom: 8px;
  padding: 0 18px; background: var(--card);
  border-radius: 16px; box-shadow: var(--shadow);
  font-size: 18px; font-weight: 600; color: var(--ink); text-align: left;
}
.val { font-size: 16px; font-weight: 500; color: var(--muted) }
.pill {
  padding: 5px 13px; border-radius: 999px;
  font-size: 13px; font-weight: 700; letter-spacing: .01em;
}
.p-gym  { background: #DCE9D4; color: #3D6B45 }
.p-home { background: #F7DFC8; color: #A2601F }
.p-rest { background: #E5E4EE; color: #55538A }
.p-easy { background: #FAEFC4; color: #8A6D12 }
.warn {
  margin: 14px 0 0; padding: 14px 16px;
  background: #FCEBD3; border-radius: 16px;
  font-size: 13px; line-height: 1.55; color: #8A4A12;
}
.count { margin: 12px 2px 0; font-size: 13px; font-weight: 600; color: var(--amber-ink) }
.help { margin: 12px 2px 0; font-size: 13px; line-height: 1.55; color: var(--muted) }
.field {
  width: 100%; min-height: 58px; margin-bottom: 8px; padding: 0 18px;
  background: var(--card); border: 0; border-radius: 16px;
  box-shadow: var(--shadow);
  font: inherit; font-size: 17px; font-weight: 500; color: var(--ink);
}
.field::placeholder { color: var(--muted); font-weight: 400 }
.note-card {
  padding: 16px 18px; background: var(--sage-soft); border-radius: 16px;
  font-size: 14px; line-height: 1.55;
}
.row:disabled { opacity: .5 }
.dot {
  display: inline-block; width: 7px; height: 7px; margin-right: 7px;
  border-radius: 50%; background: var(--muted); vertical-align: middle;
}
.dot.live { background: #4E9E7A; animation: breathe 2.4s ease-in-out infinite }
@keyframes breathe {
  0%, 100% { opacity: 1 }
  50% { opacity: .35 }
}
.pad { height: 60px }
.spacer { flex: 1; min-height: 24px }
</style>

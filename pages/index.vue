<script setup lang="ts">
import { useRoutine, MAX_SESSIONS, fmtClock, logicalDate } from '~/stores/routine'

const r = useRoutine()
onMounted(() => r.load())

const weekday = computed(() =>
  logicalDate(r.now, r.settings.dayResetHour).toLocaleDateString('en-US', {
    weekday: 'long'
  })
)

const clockNow = computed(() => fmtClock(r.minutesNow))
const sessionState = computed(() => `${r.today.sessions} of ${MAX_SESSIONS}`)

const breakState = computed(() => {
  const n = r.today.breaks.length
  const due = r.nextBreakIn
  if (due === null) return `${n} today`
  return `${n} · next ${fmtClock(r.minutesNow + due)}`
})

const cardioLabel = computed(() => (r.dayType === 'gym' ? 'Run · 30 min' : 'Aerobic · 30 min'))

const cardioState = computed(() => {
  if (r.today.cardio) return `${r.today.cardio.minutes} min`
  return r.cardioDue ? '' : r.activityTime
})

const nextReminder = computed(() => fmtClock(r.nextReminderAt % 1440))

const capped = ref(false)

function startSession() {
  if (r.today.sessions >= MAX_SESSIONS) return (capped.value = true)
  navigateTo('/session')
}

function logCardio() {
  const venue = r.dayType === 'gym' ? 'gym' : r.dayType === 'easy' ? 'walk' : 'home'
  r.logCardio(r.settings.cardioTarget, venue)
}

/**
 * Home days get the guided circuit — there is no treadmill in the flat and
 * "aerobic, 30 min" on its own is not an instruction. Gym days just log,
 * since the running already happened.
 */
function openCardio() {
  if (r.dayType === 'home' && !r.today.cardio) return navigateTo('/aerobic')
  logCardio()
}
</script>

<template>
  <div class="screen" :class="`day-${r.dayType}`">
    <header class="panel">
      <div class="eyebrow">
        {{ r.greeting }} · {{ weekday }}, <span class="tabular">{{ clockNow }}</span>
      </div>
      <h1 class="headline">{{ r.headline.title }}</h1>
      <div class="subhead">{{ r.activityTime }}</div>
    </header>

    <p v-if="r.dayType === 'rest'" class="note">No cardio today. The plan is working.</p>

    <button v-if="r.dayType === 'easy'" class="invite card" @click="logCardio">
      <span>
        <b>A walk, if you feel like one.</b>
        <small>{{ r.today.cardio ? 'logged' : 'tap to log one' }}</small>
      </span>
      <span class="invite-mark" :class="{ on: !!r.today.cardio }">↑</span>
    </button>

    <div class="stack stagger">
      <TaskRow
        label="Session"
        icon="◎"
        :tier="1"
        :state="sessionState"
        :done="r.today.sessions >= MAX_SESSIONS"
        @activate="startSession"
      />

      <TaskRow
        v-if="r.dayType === 'gym' || r.dayType === 'home'"
        :label="cardioLabel"
        icon="◍"
        :tier="2"
        :state="cardioState"
        :done="!!r.today.cardio"
        @activate="openCardio"
      />

      <TaskRow
        v-if="r.dayType === 'gym'"
        label="Leg work"
        icon="◈"
        :tier="2"
        :done="r.today.leg"
        @activate="navigateTo('/exercise/leg-press')"
      />

      <TaskRow
        label="Tablet"
        :tier="3"
        :state="r.medDue ? '' : r.settings.medTime && 'tonight'"
        :done="r.today.med"
        @activate="r.toggleMed()"
      />

      <TaskRow
        label="Stand up"
        :tier="3"
        :state="breakState"
        :dot="false"
        @activate="r.takeBreak()"
      />
    </div>

    <p class="reminder tabular">Next reminder {{ nextReminder }}</p>

    <div class="spacer" />

    <BottomNav />

    <Transition name="fade">
      <div v-if="capped" class="cap" @click="capped = false">
        <div class="cap-card card">
          <p>3 sessions is the daily target. More doesn't help — the muscle needs recovery between sessions.</p>
          <div class="cap-acts">
            <button class="cap-ok">OK</button>
            <button class="cap-how" @click.stop="navigateTo('/how')">How to do it</button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.note { margin: 24px 26px 0; font-size: 17px; line-height: 1.45; color: var(--muted) }

.invite {
  display: flex; align-items: center; justify-content: space-between; gap: 16px;
  margin: 22px 20px 0; padding: 20px; text-align: left;
}
.invite b { display: block; font-size: 18px; font-weight: 700 }
.invite small { display: block; margin-top: 3px; font-size: 13px; color: var(--muted) }
.invite-mark {
  display: grid; place-items: center; width: 40px; height: 40px; flex: none;
  border-radius: 50%; background: var(--sage-soft); color: var(--ink); font-size: 17px;
}
.invite-mark.on { background: var(--amber); color: #fff }

.stack { display: flex; flex-direction: column; gap: 10px; padding: 22px 20px 0 }

.spacer { flex: 1; min-height: 30px }

.reminder {
  margin: 18px 20px 0;
  font-size: 13px; font-weight: 500; color: var(--muted); text-align: center;
}

.cap {
  position: fixed; inset: 0; display: grid; place-items: center; padding: 32px;
  background: rgba(46, 68, 56, 0.35); z-index: 20;
}
.cap-card { padding: 30px; max-width: 330px; text-align: center }
.cap-card p { margin: 0; font-size: 18px; line-height: 1.5 }
.cap-acts { display: flex; flex-direction: column; gap: 14px; margin-top: 22px }
.cap-ok { font-size: 16px; font-weight: 700; color: var(--amber-ink) }
.cap-how { font-size: 14px; font-weight: 600; color: var(--muted) }

.fade-enter-active, .fade-leave-active { transition: opacity 200ms ease }
.fade-enter-from, .fade-leave-to { opacity: 0 }
</style>

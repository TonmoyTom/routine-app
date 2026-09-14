<script setup lang="ts">
import { useRoutine, fmt12 } from '~/stores/routine'

const r = useRoutine()
const { user } = useAuth()
const push = usePush()

/** offered once the first session is behind them, never on a cold start */
const offerPush = ref(false)

onMounted(() => r.load())

const LONG_REPS = 10
const QUICK_REPS = 10
const HOLD_MS = 5000
const QUICK_MS = 1000

type Phase = 'hold' | 'release' | 'quick' | 'rest' | 'done'

const phase = ref<Phase>('hold')
const rep = ref(1)
const stage = ref<'long' | 'quick'>('long')
const elapsed = ref(0)
const paused = ref(false)
/** 0 at rest, 1 fully swelled — drives the glow */
const swell = ref(0)

let timer: number | undefined
let ticker: number | undefined
let wakeLock: any = null

const phaseWord = computed(() =>
  phase.value === 'quick' ? 'quick' : phase.value === 'done' ? 'done' : phase.value
)

const counter = computed(() =>
  stage.value === 'long'
    ? `${rep.value} of ${LONG_REPS}`
    : `${rep.value} of ${QUICK_REPS} quick`
)

const clock = computed(() => {
  const s = Math.floor(elapsed.value / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
})

function buzz(ms = 20) {
  if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(ms)
}

function schedule(fn: () => void, ms: number) {
  timer = window.setTimeout(() => {
    if (paused.value) {
      schedule(fn, 120)
      return
    }
    fn()
  }, ms)
}

function step() {
  if (stage.value === 'long') {
    if (phase.value === 'hold') {
      swell.value = 1
      buzz()
      schedule(() => {
        phase.value = 'release'
        step()
      }, HOLD_MS)
    } else {
      swell.value = 0
      buzz()
      schedule(() => {
        if (rep.value >= LONG_REPS) {
          stage.value = 'quick'
          rep.value = 1
          phase.value = 'quick'
        } else {
          rep.value++
          phase.value = 'hold'
        }
        step()
      }, HOLD_MS)
    }
    return
  }

  // quick pulses
  swell.value = swell.value > 0.5 ? 0 : 1
  if (swell.value === 1) buzz(12)
  schedule(() => {
    if (swell.value === 0) {
      if (rep.value >= QUICK_REPS) return finish()
      rep.value++
    }
    step()
  }, QUICK_MS)
}

function finish() {
  phase.value = 'done'
  swell.value = 0
  clearTimeout(timer)
  clearInterval(ticker)
  r.addSession()

  if (user.value && push.supported() && push.permission() === 'default') {
    offerPush.value = true
    return
  }
  setTimeout(() => navigateTo('/'), 1600)
}

async function acceptPush() {
  await push.enable()
  navigateTo('/')
}

async function lockScreen() {
  try {
    // not supported everywhere; the session just runs without it
    wakeLock = await (navigator as any).wakeLock?.request('screen')
  } catch {
    wakeLock = null
  }
}

onMounted(() => {
  lockScreen()
  ticker = window.setInterval(() => {
    if (!paused.value && phase.value !== 'done') elapsed.value += 200
  }, 200)
  step()
})

onBeforeUnmount(() => {
  clearTimeout(timer)
  clearInterval(ticker)
  try {
    wakeLock?.release?.()
  } catch {
    /* already gone */
  }
})

const TOTAL = LONG_REPS + QUICK_REPS

/** 0..1 across the whole session, both stages */
const progress = computed(() => {
  const done = stage.value === 'long' ? rep.value - 1 : LONG_REPS + rep.value - 1
  return Math.min(1, done / TOTAL)
})

const CIRC = 2 * Math.PI * 104
const dash = computed(() => `${progress.value * CIRC} ${CIRC}`)

/** bumps on every hold so the ripple element remounts and replays */
const rippleKey = computed(() => `${stage.value}-${rep.value}-${swell.value}`)

const dots = computed(() =>
  Array.from({ length: stage.value === 'long' ? LONG_REPS : QUICK_REPS }, (_, i) => i < rep.value - 1)
)

const glowStyle = computed(() => {
  const s = swell.value
  const ms = stage.value === 'quick' ? QUICK_MS * 0.8 : HOLD_MS * 0.95
  return {
    transform: `scale(${0.62 + s * 0.38})`,
    opacity: String(0.72 + s * 0.28),
    transitionDuration: `${ms}ms`
  }
})
</script>

<template>
  <div class="screen player">
    <header class="top">
      <span>Session {{ r.today.sessions + 1 }} of 3</span>
      <span class="top-right">
        <button class="how" @click="navigateTo('/how')">How?</button>
        <span class="tabular">{{ clock }}</span>
      </span>
    </header>

    <div class="stage">
      <svg class="ring" viewBox="0 0 240 240" aria-hidden="true">
        <circle class="track" cx="120" cy="120" r="104" />
        <circle
          class="prog"
          cx="120"
          cy="120"
          r="104"
          :stroke-dasharray="dash"
        />
      </svg>

      <div v-if="swell === 1" :key="rippleKey" class="ripple" />
      <div class="halo" :style="glowStyle" />
      <div class="core" :style="glowStyle" />
    </div>

    <div class="readout">
      <div class="phase">{{ phaseWord }}</div>
      <div class="count tabular">{{ counter }}</div>
      <div class="dots">
        <i v-for="(filled, i) in dots" :key="i" :class="{ on: filled }" />
      </div>
    </div>

    <p class="cue">
      Thighs, buttocks, and stomach stay relaxed. Keep breathing.
    </p>

    <footer v-if="!offerPush" class="controls">
      <button @click="paused = !paused">{{ paused ? 'Resume' : 'Pause' }}</button>
      <button @click="navigateTo('/')">Exit</button>
    </footer>

    <div v-else class="offer">
      <p>
        Two more today, at
        <b class="tabular">{{ fmt12(r.settings.sessionTimes[1]) }}</b> and
        <b class="tabular">{{ fmt12(r.settings.sessionTimes[2]) }}</b>.
        Want a reminder?
      </p>
      <div class="offer-acts">
        <button class="yes" @click="acceptPush">Remind me</button>
        <button class="no" @click="navigateTo('/')">Not now</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.player {
  background: linear-gradient(170deg, #E9F1E4, var(--paper) 55%);
}

.top {
  display: flex;
  justify-content: space-between;
  padding: 28px 26px 0;
  font-size: 14px;
  font-weight: 500;
  color: var(--muted);
}

.stage {
  flex: 1;
  display: grid;
  place-items: center;
  min-height: 300px;
}

.stage > * {
  grid-area: 1 / 1;
}

/* overall session progress, so there is always something advancing */
.ring {
  width: 268px;
  height: 268px;
  transform: rotate(-90deg);
}

.track {
  fill: none;
  stroke: rgba(46, 68, 56, 0.09);
  stroke-width: 3;
}

.prog {
  fill: none;
  stroke: var(--amber);
  stroke-width: 4;
  stroke-linecap: round;
  transition: stroke-dasharray 600ms ease;
}

/* a ring leaves the body on each hold and dissipates */
.ripple {
  width: 150px;
  height: 150px;
  border-radius: 50%;
  border: 2px solid var(--pulse);
  animation: out 2200ms cubic-bezier(0.22, 0.7, 0.3, 1) forwards;
  pointer-events: none;
}

@keyframes out {
  from {
    transform: scale(0.62);
    opacity: 0.55;
  }
  to {
    transform: scale(1.72);
    opacity: 0;
  }
}

/*
 * A soft field of light rather than a shape: no edge, no highlight,
 * nothing that reads as an object sitting there. It swells on the hold
 * and settles on the release.
 */
/* soft field behind the body, gives the breath some air */
.halo {
  width: 230px;
  height: 230px;
  border-radius: 50%;
  background: radial-gradient(
    circle at 50% 50%,
    rgba(111, 184, 148, 0.34) 0%,
    rgba(111, 184, 148, 0.14) 45%,
    transparent 72%
  );
  filter: blur(10px);
}

/* the body itself — a real form, so it reads on paper */
.core {
  width: 168px;
  height: 168px;
  border-radius: 50%;
  background: radial-gradient(
    circle at 38% 32%,
    #9BD6B8 0%,
    #6FB894 46%,
    #4E9E7A 100%
  );
  box-shadow: 0 10px 34px rgba(78, 158, 122, 0.34);
}

.halo,
.core {
  transition-property: transform, opacity;
  transition-timing-function: cubic-bezier(0.37, 0, 0.25, 1);
}

.top-right { display: flex; align-items: center; gap: 14px }

.how {
  padding: 5px 12px;
  border-radius: 999px;
  background: var(--card);
  box-shadow: var(--shadow);
  font-size: 13px;
  font-weight: 700;
  color: var(--ink);
}

.readout {
  text-align: center;
}

.phase {
  font-size: 32px;
  font-weight: 700;
  color: var(--ink);
  font-variation-settings: 'opsz' 30, 'wdth' 88;
}

.count {
  margin-top: 8px;
  font-size: 15px;
  font-weight: 500;
  color: var(--muted);
}

.dots {
  display: flex;
  justify-content: center;
  gap: 7px;
  margin-top: 16px;
}

.dots i {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: rgba(46, 68, 56, 0.14);
  transition: background 320ms ease, transform 320ms ease;
}

.dots i.on {
  background: var(--amber);
  transform: scale(1.18);
}

.cue {
  margin: 30px 34px 0;
  font-size: 13px;
  line-height: 1.5;
  text-align: center;
  color: var(--muted);
}

.controls {
  display: flex;
  gap: 10px;
  margin: 28px 20px 26px;
}

.offer {
  margin: 20px 20px 26px;
  padding: 22px;
  background: var(--card);
  border-radius: var(--r);
  box-shadow: var(--shadow);
  text-align: center;
}

.offer p {
  margin: 0;
  font-size: 16px;
  line-height: 1.55;
}

.offer-acts {
  display: flex;
  gap: 10px;
  margin-top: 18px;
}

.yes,
.no {
  flex: 1;
  min-height: 54px;
  border-radius: 16px;
  font-size: 16px;
  font-weight: 700;
}

.yes {
  background: var(--amber);
  color: #fff;
}

.no {
  background: var(--paper);
  color: var(--muted);
}

.controls button {
  flex: 1;
  min-height: 60px;
  border-radius: var(--r);
  background: var(--card);
  box-shadow: var(--shadow);
  color: var(--ink);
  font-size: 17px;
  font-weight: 600;
}

@media (prefers-reduced-motion: reduce) {
  .halo {
    filter: none;
  }
  .ripple {
    display: none;
  }
}
</style>

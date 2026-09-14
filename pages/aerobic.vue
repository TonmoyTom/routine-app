<script setup lang="ts">
import { useRoutine } from '~/stores/routine'

const r = useRoutine()
onMounted(() => r.load())

interface Block {
  name: string
  secs: number
  how: string
  phase: 'warm' | 'work' | 'easy' | 'cool'
  /** which rig animation to show; omitted blocks show no viewport */
  slug?: string
  /** seconds per loop of that animation */
  cycle?: number
}

/**
 * 30 minutes, no equipment, low impact enough for a flat at night.
 * Moderate and sustained is the point — this is for blood flow, not
 * for burning out in eight minutes.
 */
const WARM: Block[] = [
  { name: 'March in place', secs: 120, phase: 'warm', slug: 'march', cycle: 1.5, how: 'Easy pace. Lift the knees to hip height, swing the arms.' },
  { name: 'Arm circles, shoulder rolls', secs: 60, phase: 'warm', how: 'Keep marching your feet while the arms work.' },
  { name: 'Hip circles, leg swings', secs: 120, phase: 'warm', slug: 'march', cycle: 2.2, how: 'Hold a wall. Ten swings each leg, front to back, then side to side.' }
]

const ROUND: Block[] = [
  { name: 'Jog in place', secs: 60, phase: 'work', slug: 'jog', cycle: 0.72, how: 'Land on the front of the foot, stay light. Breathing should be working but not ragged.' },
  { name: 'Side step touch', secs: 45, phase: 'work', slug: 'side-step', cycle: 1.6, how: 'Step wide right, tap the left foot in, reverse. Arms out and back with each step.' },
  { name: 'Low-impact jacks', secs: 45, phase: 'work', slug: 'jacks', cycle: 1.25, how: 'One foot out at a time instead of jumping — arms still go overhead. Quiet for the floor below.' },
  { name: 'Shadow boxing', secs: 60, phase: 'work', slug: 'boxing', cycle: 1.1, how: 'Light feet, punch across the body. Rotate through the waist, not just the arms.' },
  { name: 'High knees', secs: 45, phase: 'work', slug: 'high-knees', cycle: 0.66, how: 'Quick, controlled. Drop to a march if the breathing gets ragged.' },
  { name: 'Recovery march', secs: 45, phase: 'easy', slug: 'march', cycle: 1.9, how: 'Slow it down. Breathe through the nose if you can.' }
]

const COOL: Block[] = [
  { name: 'Walk it off', secs: 120, phase: 'cool', slug: 'march', cycle: 2.1, how: 'Keep moving until the breathing settles. Do not sit down straight away.' },
  { name: 'Quads and hamstrings', secs: 90, phase: 'cool', how: 'Thirty seconds each side, then fold forward gently.' },
  { name: 'Calves and hips', secs: 90, phase: 'cool', how: 'Calf against a wall, then a low lunge for the hip flexors — these get tight from sitting.' }
]

const PLAN: Block[] = [...WARM, ...ROUND, ...ROUND, ...ROUND, ...ROUND, ...COOL]
const TOTAL = PLAN.reduce((a, b) => a + b.secs, 0)

const i = ref(0)
const left = ref(PLAN[0].secs)
const running = ref(false)
const done = ref(false)

const block = computed(() => PLAN[i.value])
const next = computed(() => PLAN[i.value + 1])

const elapsed = computed(
  () => PLAN.slice(0, i.value).reduce((a, b) => a + b.secs, 0) + (block.value.secs - left.value)
)
const remain = computed(() => TOTAL - elapsed.value)
const pct = computed(() => elapsed.value / TOTAL)

/** which round of four, for the header */
const round = computed(() => {
  const w = WARM.length
  if (i.value < w) return 'Warm-up'
  if (i.value >= w + ROUND.length * 4) return 'Cool-down'
  return `Round ${Math.floor((i.value - w) / ROUND.length) + 1} of 4`
})

function mmss(s: number) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** phase 0..1, looped at the current block's cadence */
const anim = ref(0)
const view = ref('45')
let raf = 0
let t0 = 0

function spin(now: number) {
  raf = requestAnimationFrame(spin)
  if (!t0) t0 = now
  const cycle = (block.value.cycle ?? 1.5) * 1000
  anim.value = (((now - t0) / cycle) % 1 + 1) % 1
}

let timer: number | undefined

function tick() {
  if (!running.value) return
  left.value--
  if (left.value <= 0) {
    if (navigator.vibrate) navigator.vibrate(30)
    if (i.value >= PLAN.length - 1) return finish()
    i.value++
    left.value = PLAN[i.value].secs
  }
}

function finish() {
  running.value = false
  done.value = true
  r.logCardio(30, r.dayType === 'gym' ? 'gym' : r.dayType === 'easy' ? 'walk' : 'home')
  if (navigator.vibrate) navigator.vibrate([40, 80, 40])
}

function skip() {
  if (i.value >= PLAN.length - 1) return finish()
  i.value++
  left.value = PLAN[i.value].secs
}

let wakeLock: any = null

onMounted(async () => {
  timer = window.setInterval(tick, 1000)
  raf = requestAnimationFrame(spin)
  try {
    wakeLock = await (navigator as any).wakeLock?.request('screen')
  } catch {
    wakeLock = null
  }
})

onBeforeUnmount(() => {
  clearInterval(timer)
  cancelAnimationFrame(raf)
  try {
    wakeLock?.release?.()
  } catch {
    /* already released */
  }
})
</script>

<template>
  <div class="screen">
    <header class="head">
      <div class="row-top">
        <span class="round">{{ done ? 'Finished' : round }}</span>
        <span class="tabular">{{ mmss(remain) }} left</span>
      </div>
      <div class="bar"><i :style="{ transform: `scaleX(${pct})` }" /></div>
    </header>

    <div v-if="!done && block.slug" class="stage">
      <ClientOnly>
        <ExerciseScene :exercise="block.slug" :t="anim" :view="view" />
      </ClientOnly>
      <div class="views">
        <button
          v-for="v in ['side', 'front', '45']"
          :key="v"
          :class="{ on: view === v }"
          @click="view = v"
        >
          {{ v === '45' ? '45°' : v }}
        </button>
      </div>
    </div>

    <div v-if="!done" class="now">
      <div class="secs tabular" :class="block.phase">{{ mmss(left) }}</div>
      <h1 class="move">{{ block.name }}</h1>
      <p class="how">{{ block.how }}</p>
      <p v-if="next" class="next">Next · {{ next.name }}</p>
    </div>

    <div v-else class="now">
      <h1 class="move">30 minutes done</h1>
      <p class="how">Logged for today.</p>
    </div>

    <p class="cue">
      Moderate is the target: you should be able to talk, but not sing. Drop to
      a march any time the breathing gets ragged.
    </p>

    <div class="spacer" />

    <div v-if="!done" class="controls">
      <button class="primary" @click="running = !running">
        {{ running ? 'Pause' : elapsed ? 'Resume' : 'Start' }}
      </button>
      <button class="ghost" @click="skip">Skip</button>
    </div>
    <div v-else class="controls">
      <button class="primary" @click="navigateTo('/')">Done</button>
    </div>

    <BottomNav />
  </div>
</template>

<style scoped>
.head { padding: 30px 20px 0 }
.row-top {
  display: flex; justify-content: space-between; align-items: baseline;
  font-size: 14px; font-weight: 600; color: var(--muted);
}
.bar {
  margin-top: 12px; height: 6px; border-radius: 3px;
  background: rgba(46, 68, 56, 0.09); overflow: hidden;
}
.bar i {
  display: block; height: 100%; border-radius: 3px;
  background: var(--amber); transform-origin: left;
  transition: transform 900ms linear;
}

.stage {
  position: relative;
  height: 34vh; min-height: 210px;
  margin: 16px 20px 0;
  border-radius: var(--r); overflow: hidden;
  background: linear-gradient(168deg, #E4EFDE, #F7F4EC);
  box-shadow: var(--shadow);
}
.views {
  position: absolute; left: 10px; right: 10px; bottom: 10px;
  display: flex; gap: 6px;
}
.views button {
  flex: 1; min-height: 34px; border-radius: 11px;
  background: rgba(255, 255, 255, 0.82);
  color: var(--muted); font-size: 12px; font-weight: 700;
}
.views button.on { background: var(--amber); color: #fff }

.now { padding: 22px 24px 0; text-align: center }

.secs {
  font-size: 54px; font-weight: 800; line-height: 1;
  font-variation-settings: 'opsz' 54, 'wdth' 88;
  color: #4E9E7A;
}
.secs.easy, .secs.cool { color: var(--muted) }
.secs.warm { color: var(--amber-ink) }

.move {
  margin: 14px 0 0; font-size: 30px; font-weight: 700;
  font-variation-settings: 'opsz' 30, 'wdth' 90;
}
.how { margin: 12px 0 0; font-size: 16px; line-height: 1.5; color: var(--muted) }
.next { margin: 22px 0 0; font-size: 14px; font-weight: 600; color: var(--muted) }

.cue {
  margin: 26px 24px 0; padding: 14px 16px;
  background: var(--sage-soft); border-radius: 16px;
  font-size: 14px; line-height: 1.5;
}

.spacer { flex: 1; min-height: 20px }

.controls { display: flex; gap: 10px; margin: 0 20px }
.controls button {
  flex: 1; min-height: 62px; border-radius: var(--r); font-size: 17px; font-weight: 700;
}
.primary { background: var(--amber); color: #fff; box-shadow: var(--shadow-lift) }
.ghost { flex: 0 0 110px; background: var(--card); color: var(--ink); box-shadow: var(--shadow) }
</style>

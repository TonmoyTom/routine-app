<script setup lang="ts">
import { useRoutine } from '~/stores/routine'

const route = useRoute()
const r = useRoutine()
onMounted(() => r.load())

interface Exercise {
  slug: string
  name: string
  sets: string
  cues: string[]
}

const EXERCISES: Exercise[] = [
  {
    slug: 'leg-press',
    name: 'Leg press',
    sets: '3 × 10',
    cues: [
      'Feet shoulder-width, flat, mid-platform. Lower until the knees reach about 90°.',
      'Lower back stays flat against the pad. If your hips curl up at the bottom, you have gone too deep.',
      'Never snap the knees straight at the top.'
    ]
  },
  {
    slug: 'leg-curl',
    name: 'Leg curl',
    sets: '3 × 12',
    cues: [
      'The pad sits just above the heels, not on the Achilles.',
      'Hips stay pressed down through the whole rep.',
      'Return over two to three seconds. Do not let the weight drop.'
    ]
  },
  {
    slug: 'leg-extension',
    name: 'Leg extension',
    sets: '3 × 12',
    cues: [
      'Line the knee joint up with the machine pivot.',
      'Extend without locking hard at the top, pause, lower slowly.',
      'Keep the weight light. This one loads the knee directly.'
    ]
  },
  {
    slug: 'squat',
    name: 'Bodyweight squat',
    sets: '3 × 12',
    cues: [
      'Feet shoulder-width, toes slightly out.',
      'Knees track over the toes, never collapsing inward.',
      'Chest up, down to roughly parallel.'
    ]
  }
]

const index = computed(() =>
  Math.max(
    0,
    EXERCISES.findIndex((e) => e.slug === route.params.slug)
  )
)
const ex = computed(() => EXERCISES[index.value])

const t = ref(1)
const view = ref('side')
const looping = ref(true)

let raf = 0
let dir = -1

function tickLoop() {
  raf = requestAnimationFrame(tickLoop)
  if (!looping.value) return
  t.value += dir * 0.009
  if (t.value <= 0) {
    t.value = 0
    dir = 1
  }
  if (t.value >= 1) {
    t.value = 1
    dir = -1
  }
}

onMounted(() => {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (reduce) looping.value = false
  tickLoop()
})
onBeforeUnmount(() => cancelAnimationFrame(raf))

function scrub(e: Event) {
  looping.value = false
  t.value = Number((e.target as HTMLInputElement).value)
}

function logIt() {
  r.toggleLeg()
  navigateTo('/')
}
</script>

<template>
  <div class="screen">
    <header class="top">
      <button class="back" @click="navigateTo('/')">←</button>
      <h1>{{ ex.name }}</h1>
      <span class="sets tabular">{{ ex.sets }}</span>
    </header>

    <div class="stage">
      <ClientOnly>
        <ExerciseScene :exercise="ex.slug" :t="t" :view="view" />
      </ClientOnly>
    </div>

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

    <div class="scrub">
      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        :value="t"
        @input="scrub"
      />
      <button class="loop" :class="{ on: looping }" @click="looping = !looping">
        loop
      </button>
    </div>

    <div class="cues">
      <p v-for="(c, i) in ex.cues" :key="i">{{ c }}</p>
    </div>

    <p class="breath">
      Breathe out as you push. Never hold your breath under load.
    </p>

    <nav class="others">
      <NuxtLink
        v-for="o in EXERCISES"
        :key="o.slug"
        :to="`/exercise/${o.slug}`"
        :class="{ on: o.slug === ex.slug }"
      >
        {{ o.name }}
      </NuxtLink>
    </nav>

    <button class="log" @click="logIt">
      {{ r.today.leg ? 'Logged' : 'Log it' }}
    </button>
  </div>
</template>

<style scoped>
.top {
  display: flex;
  align-items: baseline;
  gap: 14px;
  padding: 28px 26px 18px;
}

.back {
  font-size: 22px;
  color: var(--muted);
}

.top h1 {
  flex: 1;
  margin: 0;
  font-size: 27px;
  font-weight: 700;
  font-variation-settings: 'opsz' 27, 'wdth' 88;
}

.sets {
  font-size: 15px;
  font-weight: 600;
  color: var(--muted);
}

.stage {
  height: 44vh;
  min-height: 250px;
  margin: 0 20px;
  border-radius: var(--r);
  overflow: hidden;
  background: linear-gradient(168deg, #E4EFDE, #F7F4EC);
  box-shadow: var(--shadow);
}

.views {
  display: flex;
  gap: 8px;
  margin: 16px 20px 0;
}

.views button {
  flex: 1;
  min-height: 52px;
  border-radius: 14px;
  background: var(--card);
  box-shadow: var(--shadow);
  color: var(--muted);
  font-size: 15px;
  font-weight: 600;
}

.views button.on {
  background: var(--amber);
  color: #fff;
}

.scrub {
  display: flex;
  align-items: center;
  gap: 14px;
  margin: 18px 26px 0;
}

.scrub input {
  flex: 1;
  accent-color: var(--amber);
}

.loop {
  font-size: 13px;
  font-weight: 600;
  color: var(--muted);
}

.loop.on {
  color: var(--amber-ink);
}

.cues {
  margin: 18px 26px 0;
}

.cues p {
  margin: 0 0 9px;
  font-size: 15px;
  line-height: 1.5;
  color: var(--muted);
}

.breath {
  margin: 18px 20px 0;
  font-size: 15px;
  font-weight: 500;
  line-height: 1.5;
  color: var(--ink);
  background: var(--sage-soft);
  border-radius: 16px;
  padding: 14px 16px;
}

.others {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  margin: 22px 26px 0;
}

.others a {
  font-size: 13px;
  font-weight: 600;
  color: var(--muted);
}

.others a.on {
  color: var(--amber-ink);
}

.log {
  margin: 24px 20px 26px;
  min-height: 62px;
  border-radius: var(--r);
  background: var(--amber);
  color: #fff;
  font-size: 17px;
  font-weight: 700;
  box-shadow: var(--shadow-lift);
}
</style>

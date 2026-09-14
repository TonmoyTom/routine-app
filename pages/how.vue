<script setup lang="ts">
const POSITIONS = [
  {
    slug: 'lying',
    name: 'Lying down',
    level: 'Start here',
    note: 'Knees bent, feet flat, back relaxed into the floor. Gravity is not working against you, so this is the easiest place to feel the muscle and the place to spend the first two or three weeks.'
  },
  {
    slug: 'seated',
    name: 'Sitting',
    level: 'Weeks 3–6',
    note: 'Upright on a firm chair, feet flat, back off the backrest. Harder than lying because the muscle is now holding some weight. This is the one you can do at your desk without anyone noticing.'
  },
  {
    slug: 'standing',
    name: 'Standing',
    level: 'Hardest',
    note: 'Feet shoulder-width, weight even. The most demanding position and the most useful, because this is the position the muscle actually has to work in during the day.'
  }
]

const pick = ref(0)
const view = ref('45')
const pos = computed(() => POSITIONS[pick.value])
</script>

<template>
  <div class="screen">
    <header class="head">
      <h1 class="headline small">HOW</h1>
      <p class="sub">Finding the muscle, and where to do it</p>
    </header>

    <div class="tabs">
      <button
        v-for="(p, i) in POSITIONS"
        :key="p.slug"
        :class="{ on: pick === i }"
        @click="pick = i"
      >
        {{ p.name }}
      </button>
    </div>

    <div class="stage">
      <ClientOnly>
        <ExerciseScene :exercise="pos.slug" :t="0" :view="view" />
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

    <div class="pos card">
      <span class="level">{{ pos.level }}</span>
      <p>{{ pos.note }}</p>
    </div>

    <section>
      <h2>Finding it</h2>
      <ol>
        <li>Tighten as if you were stopping yourself passing wind, and at the same time draw up as if stopping the flow of urine.</li>
        <li>You are after a feeling of lift and squeeze <b>inwards and upwards</b>, never a push down.</li>
        <li>Hold five seconds, then let go completely for five. The letting go matters as much as the squeeze.</li>
      </ol>
      <p class="warn">
        You can use the urine stream once to identify the right muscle, but do
        not practise that way. Repeatedly interrupting the flow interferes with
        emptying the bladder properly.
      </p>
    </section>

    <section>
      <h2>Getting it wrong</h2>
      <ul>
        <li>Thighs, buttocks or stomach tightening — put a hand on them; they should stay soft.</li>
        <li>Holding your breath. Breathe normally throughout, or squeeze as you breathe out.</li>
        <li>Bearing down instead of lifting. If it feels like pushing, stop and reset.</li>
        <li>More than three sessions a day. An overworked pelvic floor stays tight, which makes things worse rather than better.</li>
      </ul>
    </section>

    <section>
      <h2>How long</h2>
      <p class="body">
        Strength takes three to six months of daily work. Nothing will feel
        different in the first fortnight — that is normal and not a reason to
        stop or to do more. Once it improves, keep going at least once a day.
      </p>
    </section>

    <div class="spacer" />
    <BottomNav />
  </div>
</template>

<style scoped>
.head { padding: 34px 26px 0 }
.headline.small { margin: 0; font-size: 44px; font-variation-settings: 'opsz' 44, 'wdth' 86 }
.sub { margin: 8px 0 0; font-size: 14px; font-weight: 500; color: var(--muted) }

.tabs { display: flex; gap: 8px; margin: 22px 20px 0 }
.tabs button {
  flex: 1; min-height: 46px; border-radius: 14px;
  background: var(--card); box-shadow: var(--shadow);
  color: var(--muted); font-size: 14px; font-weight: 600;
}
.tabs button.on { background: var(--amber); color: #fff }

.stage {
  position: relative; height: 34vh; min-height: 210px;
  margin: 12px 20px 0; border-radius: var(--r); overflow: hidden;
  background: linear-gradient(168deg, #E4EFDE, #F7F4EC);
  box-shadow: var(--shadow);
}
.views { position: absolute; left: 10px; right: 10px; bottom: 10px; display: flex; gap: 6px }
.views button {
  flex: 1; min-height: 34px; border-radius: 11px;
  background: rgba(255, 255, 255, 0.82);
  color: var(--muted); font-size: 12px; font-weight: 700;
}
.views button.on { background: var(--amber); color: #fff }

.pos { margin: 12px 20px 0; padding: 18px }
.level {
  display: inline-block; padding: 4px 11px; border-radius: 999px;
  background: var(--sage-soft); font-size: 12px; font-weight: 700;
}
.pos p { margin: 10px 0 0; font-size: 15px; line-height: 1.55; color: var(--muted) }

section { margin: 30px 26px 0 }
h2 { margin: 0 0 10px; font-size: 13px; font-weight: 600; color: var(--muted) }
ol, ul { margin: 0; padding-left: 20px }
li { margin-bottom: 9px; font-size: 15px; line-height: 1.5 }
.body { margin: 0; font-size: 15px; line-height: 1.55 }
.warn {
  margin: 14px 0 0; padding: 14px 16px;
  background: #FCEBD3; border-radius: 16px;
  font-size: 13px; line-height: 1.55; color: #8A4A12;
}

.spacer { flex: 1; min-height: 24px }
</style>

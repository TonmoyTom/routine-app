<script setup lang="ts">
import { useRoutine, dateKey, emptyLog, logicalDate, MAX_SESSIONS } from '~/stores/routine'

const r = useRoutine()
onMounted(() => r.load())

const days = computed(() => {
  const out: { key: string; type: string; light: number }[] = []
  for (let i = 89; i >= 0; i--) {
    const d = logicalDate(r.now, r.settings.dayResetHour)
    d.setDate(d.getDate() - i)
    const key = dateKey(d)
    const log = r.logs[key] ?? emptyLog()
    const type = r.settings.dayTypes[d.getDay()] ?? 'home'
    let done = log.sessions + (log.med ? 1 : 0)
    let total = MAX_SESSIONS + 1
    if (type === 'gym') { total += 2; if (log.cardio) done++; if (log.leg) done++ }
    else if (type === 'home') { total += 1; if (log.cardio) done++ }
    out.push({ key, type, light: total ? done / total : 0 })
  }
  return out
})

const weekPct = computed(() => {
  const last7 = days.value.slice(-7)
  const avg = last7.reduce((a, d) => a + d.light, 0) / (last7.length || 1)
  return Math.round(avg * 100)
})

const weekMinutes = computed(() =>
  days.value.slice(-7).reduce((a, d) => a + (r.logs[d.key]?.cardio?.minutes ?? 0), 0)
)

const weekSessions = computed(() =>
  days.value.slice(-7).reduce((a, d) => a + (r.logs[d.key]?.sessions ?? 0), 0)
)
</script>

<template>
  <div class="screen">
    <header class="head">
      <h1 class="headline small">HISTORY</h1>
      <p class="sub">Last 90 days</p>
    </header>

    <div class="grid card">
      <div
        v-for="d in days"
        :key="d.key"
        class="cell"
        :class="d.type"
        :style="{ opacity: 0.18 + d.light * 0.82 }"
        :title="d.key"
      />
    </div>

    <div class="stats card">
      <div><b class="tabular">{{ weekPct }}%</b><span>completed this week</span></div>
      <div><b class="tabular">{{ weekMinutes }}</b><span>cardio minutes</span></div>
      <div><b class="tabular">{{ weekSessions }}</b><span>sessions</span></div>
    </div>

    <p class="legend">
      Filled square gym · inset square home · outline easy · dot rest
    </p>
    <div class="spacer" />
    <BottomNav />
  </div>
</template>

<style scoped>
.head { padding:34px 26px 0 }
.sub { margin:8px 0 0; font-size:14px; font-weight:500; color:var(--muted) }
.back { font-size:22px; color:var(--muted) }
.headline.small { margin:0; font-size:44px; font-variation-settings:'opsz' 44,'wdth' 86 }
.grid {
  padding:16px; display:grid; grid-template-columns:repeat(15,1fr); gap:6px;
  margin:32px 26px 0;
}
.cell { aspect-ratio:1; border-radius:5px; background:var(--amber) }
.cell.home { transform:scale(0.66) }
.cell.easy { background:transparent; border:2px solid var(--amber) }
.cell.rest { background:var(--amber); transform:scale(0.4); border-radius:50% }
.stats { display:flex; flex-direction:column; gap:20px; margin:24px 26px 0; padding:24px }
.stats div { display:flex; align-items:baseline; gap:12px }
.stats b { font-size:34px; font-weight:800; color:var(--ink) }
.stats span { font-size:14px; color:var(--muted) }
.legend { margin:36px 26px 30px; font-size:12px; line-height:1.6; color:var(--muted) }
.spacer { flex: 1; min-height: 24px }
</style>

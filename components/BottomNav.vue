<script setup lang="ts">
const route = useRoute()

const items = [
  { to: '/', label: 'Today', d: 'M4 11.2 12 4.5l8 6.7V20a1 1 0 0 1-1 1h-4.6v-5.4H9.6V21H5a1 1 0 0 1-1-1z' },
  { to: '/history', label: 'History', d: 'M4.5 19.5V10m5 9.5V5.5m5 14V12m5 7.5V7.5' },
  { to: '/settings', label: 'Settings', d: 'M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4M4.6 12a7.4 7.4 0 0 1 .1-1.2l-1.8-1.4 1.9-3.3 2.1.9a7.4 7.4 0 0 1 2-1.2l.3-2.3h3.7l.3 2.3a7.4 7.4 0 0 1 2 1.2l2.1-.9 1.9 3.3-1.8 1.4a7.4 7.4 0 0 1 0 2.4l1.8 1.4-1.9 3.3-2.1-.9a7.4 7.4 0 0 1-2 1.2l-.3 2.3h-3.7l-.3-2.3a7.4 7.4 0 0 1-2-1.2l-2.1.9-1.9-3.3 1.8-1.4A7.4 7.4 0 0 1 4.6 12' }
]

/** deeper pages keep their parent tab lit rather than lighting none */
const OWNER: Record<string, string> = {
  '/session': '/',
  '/aerobic': '/',
  '/how': '/'
}

const activeIndex = computed(() => {
  const p = route.path
  const owner = OWNER[p] ?? (p.startsWith('/exercise') ? '/' : p)
  const i = items.findIndex((x) => x.to === owner)
  return i < 0 ? 0 : i
})

/** the pill slides rather than reappearing under the new tab */
const pillStyle = computed(() => ({
  transform: `translateX(${activeIndex.value * 100}%)`
}))
</script>

<template>
  <nav class="bar">
    <span class="pill" :style="pillStyle" aria-hidden="true" />

    <NuxtLink
      v-for="(i, idx) in items"
      :key="i.to"
      :to="i.to"
      :class="{ on: idx === activeIndex }"
    >
      <svg viewBox="0 0 24 24" width="22" height="22">
        <path
          :d="i.d"
          fill="none"
          stroke="currentColor"
          :stroke-width="idx === activeIndex ? 2.1 : 1.7"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
      <span>{{ i.label }}</span>
    </NuxtLink>
  </nav>
</template>

<style scoped>
.bar {
  position: sticky;
  bottom: 0;
  z-index: 10;
  display: flex;
  margin: 14px 20px calc(14px + env(safe-area-inset-bottom));
  padding: 8px;
  background: var(--card);
  border-radius: 26px;
  box-shadow: 0 6px 26px rgba(46, 68, 56, 0.13);
}

/* one third of the track, slid into place under the active tab */
.pill {
  position: absolute;
  top: 8px;
  left: 8px;
  width: calc((100% - 16px) / 3);
  height: calc(100% - 16px);
  border-radius: 19px;
  background: var(--sage-soft);
  transition: transform 420ms cubic-bezier(0.34, 1.32, 0.44, 1);
}

.bar a {
  position: relative;
  z-index: 1;
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 10px 0 9px;
  color: var(--muted);
  font-size: 11px;
  font-weight: 600;
  transition: color 260ms ease;
}

.bar a svg {
  transition: transform 420ms cubic-bezier(0.34, 1.32, 0.44, 1),
    stroke-width 260ms ease;
}

.bar a.on {
  color: var(--ink);
}

.bar a.on svg {
  transform: translateY(-1px) scale(1.1);
}

.bar a span {
  transition: opacity 260ms ease, transform 260ms ease;
}

.bar a.on span {
  font-weight: 700;
}

.bar a:active svg {
  transform: scale(0.88);
  transition-duration: 90ms;
}

@media (prefers-reduced-motion: reduce) {
  .pill,
  .bar a svg {
    transition: none;
  }
}
</style>

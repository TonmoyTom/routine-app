<script setup lang="ts">
/**
 * Completion turns a card warm and lifts it slightly — light and weight
 * rather than a tick. `tier` sets prominence: 1 = the session, the reason
 * the app exists; 2 = the day's activity; 3 = ambient.
 */
const props = withDefaults(
  defineProps<{
    label: string
    state?: string
    done?: boolean
    tier?: 1 | 2 | 3
    dot?: boolean
    icon?: string
  }>(),
  { tier: 2, dot: true, done: false }
)

defineEmits<{ (e: 'activate'): void }>()
</script>

<template>
  <button
    class="row"
    :class="[`tier-${props.tier}`, { done: props.done }]"
    @click="$emit('activate')"
  >
    <span v-if="props.icon" class="glyph">{{ props.icon }}</span>

    <span class="label">{{ props.label }}</span>

    <span class="right">
      <span v-if="props.state" class="state tabular">{{ props.state }}</span>
      <span v-if="props.dot" class="dot" :class="{ lit: props.done }">
        <svg v-if="props.done" viewBox="0 0 20 20" width="12" height="12">
          <path
            d="M4 10.5l4 4 8-9"
            fill="none"
            stroke="#fff"
            stroke-width="2.6"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </span>
    </span>
  </button>
</template>

<style scoped>
.row {
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  min-height: 68px;
  padding: 0 18px;
  background: var(--card);
  border-radius: var(--r);
  box-shadow: var(--shadow);
  text-align: left;
  transition: background 320ms ease, box-shadow 320ms ease,
    transform 320ms ease;
}

.tier-1 { min-height: 92px; }

.tier-3 {
  min-height: 58px;
  background: transparent;
  box-shadow: none;
  border: 1px solid var(--hair);
}

.glyph {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  flex: none;
  border-radius: 12px;
  background: var(--sage-soft);
  font-size: 17px;
  transition: background 320ms ease;
}

.label {
  flex: 1;
  font-size: 19px;
  font-weight: 600;
  color: var(--ink);
  transition: color 320ms ease;
}

.tier-1 .label {
  font-size: 25px;
  font-weight: 800;
  font-variation-settings: 'opsz' 25, 'wdth' 92;
}

.tier-3 .label { font-size: 16px; font-weight: 500; color: var(--muted); }

.right { display: flex; align-items: center; gap: 12px; }

.state { font-size: 15px; font-weight: 500; color: var(--muted); transition: color 320ms ease; }
.tier-1 .state { font-size: 21px; font-weight: 700; }

.dot {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  flex: none;
  border-radius: 50%;
  border: 2px solid rgba(46, 68, 56, 0.16);
  transition: background 320ms ease, border-color 320ms ease;
}

.tier-3 .dot { width: 19px; height: 19px; }

.dot.lit { background: var(--amber); border-color: var(--amber); }

/* lit state — warm, lifted, unmistakable at a glance */
.done {
  background: var(--amber-soft);
  box-shadow: var(--shadow-lift);
  transform: translateY(-1px);
}

.done.tier-3 {
  background: var(--amber-soft);
  border-color: transparent;
  box-shadow: none;
  transform: none;
}

.done .label { color: var(--amber-ink); }
.done .state { color: var(--amber-ink); }
.done .glyph { background: rgba(232, 154, 60, 0.22); }

.row:active { transform: scale(0.985); }
</style>

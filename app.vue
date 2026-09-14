<script setup lang="ts">
const router = useRouter()

/** tabs sit at depth 0; anything opened from them is deeper */
const TABS = ['/', '/history', '/settings']
const depth = (p: string) => (TABS.includes(p) ? 0 : 1)
const tabIndex = (p: string) => TABS.indexOf(p)

const name = ref('nav-right')

router.beforeEach((to, from) => {
  const a = depth(from.path)
  const b = depth(to.path)

  if (b > a) name.value = 'push'          // opening something
  else if (b < a) name.value = 'pop'      // coming back out
  else {
    // moving between tabs — travel in the direction of the tab bar
    const i = tabIndex(from.path)
    const j = tabIndex(to.path)
    name.value = j > i ? 'nav-right' : 'nav-left'
  }
})
</script>

<template>
  <NuxtPage :transition="{ name, mode: 'out-in' }" />
</template>

<script setup lang="ts">
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

const props = defineProps<{ exercise: string; t: number; view: string }>()

const host = ref<HTMLDivElement>()

const BODY = 0xf2ede2
const MACHINE = 0x7f9a86
const RAIL = 0x5d7a68
const WORK = 0xf3c88a

/** segment lengths, roughly a 1.75 m frame */
const L = {
  torso: 0.55, head: 0.105,
  upperArm: 0.29, foreArm: 0.25,
  thigh: 0.44, shin: 0.42, foot: 0.22
}

/** one arm + one leg */
interface Side {
  hip: number; hipZ: number; knee: number; ankle: number
  shoulder: number; shoulderZ: number; elbow: number
}
interface Pose {
  rootX: number; rootY: number; rootZ: number; rootRotY: number
  torso: number; torsoZ: number
  L: Side; R: Side
}

const side = (o: Partial<Side> = {}): Side => ({
  hip: 0, hipZ: 0, knee: 0, ankle: 0, shoulder: -6, shoulderZ: 5, elbow: -4, ...o
})

const rad = (d: number) => (d * Math.PI) / 180
const mix = (a: number, b: number, t: number) => a + (b - a) * t
/** positive half of a sine — a limb that lifts and returns */
const lift = (p: number) => Math.max(0, Math.sin(p))

function pose(name: string, t: number): Pose {
  const base: Pose = {
    rootX: 0, rootY: 0.92, rootZ: 0, rootRotY: 0,
    torso: 0, torsoZ: 0, L: side(), R: side()
  }
  const p = t * Math.PI * 2
  const q = p + Math.PI

  switch (name) {
    // ---- gym machines: t = 0 bottom, t = 1 top ----
    case 'leg-press': {
      const s = side({
        hip: mix(-138, -108, t), knee: mix(90, 10, t),
        ankle: mix(-40, -70, t), shoulder: 60, elbow: -40
      })
      return { ...base, rootY: 0.42, torso: -50, L: s, R: { ...s } }
    }
    case 'leg-extension': {
      const s = side({ hip: -90, knee: mix(90, 4, t), shoulder: 20, elbow: -70 })
      return { ...base, rootY: 0.52, torso: -14, L: s, R: { ...s } }
    }
    case 'leg-curl': {
      const s = side({ hip: 90, knee: mix(0, 98, t), shoulder: 100, elbow: -30 })
      return { ...base, rootY: 0.55, torso: 90, L: s, R: { ...s } }
    }
    case 'squat': {
      const s = side({
        hip: mix(-45, 0, t), knee: mix(60, 0, t), ankle: mix(-14, 0, t),
        shoulder: mix(-80, -6, t), elbow: mix(-20, -4, t)
      })
      return {
        ...base, rootY: mix(0.777, 0.92, t), rootZ: mix(-0.202, 0, t),
        torso: mix(30, 4, t), L: s, R: { ...s }
      }
    }

    // ---- home circuit: t cycles 0 -> 1 continuously ----
    case 'jog':
      return {
        ...base,
        rootY: 0.92 + 0.022 * Math.sin(2 * p),
        torso: 6,
        L: side({ hip: -34 * lift(p), knee: 12 + 62 * lift(p), ankle: -18,
                  shoulder: -30 + 26 * Math.sin(q), elbow: -78 }),
        R: side({ hip: -34 * lift(q), knee: 12 + 62 * lift(q), ankle: -18,
                  shoulder: -30 + 26 * Math.sin(p), elbow: -78 })
      }

    case 'high-knees':
      return {
        ...base,
        rootY: 0.92 + 0.03 * Math.sin(2 * p),
        torso: 4,
        L: side({ hip: -8 - 78 * lift(p), knee: 14 + 92 * lift(p), ankle: -14,
                  shoulder: -34 + 30 * Math.sin(q), elbow: -86 }),
        R: side({ hip: -8 - 78 * lift(q), knee: 14 + 92 * lift(q), ankle: -14,
                  shoulder: -34 + 30 * Math.sin(p), elbow: -86 })
      }

    case 'march':
      return {
        ...base,
        rootY: 0.92 + 0.012 * Math.sin(2 * p),
        L: side({ hip: -46 * lift(p), knee: 50 * lift(p),
                  shoulder: -20 + 20 * Math.sin(q), elbow: -46 }),
        R: side({ hip: -46 * lift(q), knee: 50 * lift(q),
                  shoulder: -20 + 20 * Math.sin(p), elbow: -46 })
      }

    // step wide to one side, tap the trailing foot in, reverse
    case 'side-step': {
      const sway = Math.sin(p)
      const tap = Math.abs(sway)
      return {
        ...base,
        rootX: 0.17 * sway,
        rootY: 0.90 + 0.015 * tap,
        torsoZ: -4 * sway,
        L: side({ hipZ: 12 + 16 * Math.max(0, -sway), knee: 14 + 10 * tap,
                  shoulderZ: 24 + 46 * tap, elbow: -28 }),
        R: side({ hipZ: -12 - 16 * Math.max(0, sway), knee: 14 + 10 * tap,
                  shoulderZ: -24 - 46 * tap, elbow: -28 })
      }
    }

    // one foot out at a time, arms still go overhead — quiet for the floor below
    case 'jacks': {
      const open = (1 - Math.cos(p)) / 2
      return {
        ...base,
        rootY: 0.90,
        L: side({ hipZ: 6 + 24 * lift(p), knee: 8,
                  shoulderZ: 8 + 152 * open, elbow: -6 }),
        R: side({ hipZ: -6 - 24 * lift(q), knee: 8,
                  shoulderZ: -8 - 152 * open, elbow: -6 })
      }
    }

    // alternating cross punches, rotation coming from the waist
    case 'boxing': {
      const a = Math.sin(p)
      const punchL = Math.max(0, a)
      const punchR = Math.max(0, -a)
      return {
        ...base,
        rootY: 0.90 + 0.012 * Math.sin(2 * p),
        rootRotY: -26 * a,
        torso: 8,
        L: side({ hip: -14, knee: 20, ankle: -8,
                  shoulder: -46 - 44 * punchL, shoulderZ: 16 - 10 * punchL,
                  elbow: -110 + 104 * punchL }),
        R: side({ hip: 12, knee: 24, ankle: -8,
                  shoulder: -46 - 44 * punchR, shoulderZ: -16 + 10 * punchR,
                  elbow: -110 + 104 * punchR })
      }
    }

    // ---- session positions: static, t is ignored ----
    case 'lying': {
      const s = side({ hip: -120, knee: 99, ankle: 21, shoulder: 4, shoulderZ: 14, elbow: -6 })
      return { ...base, rootY: 0.28, torso: -90, L: s, R: { ...s } }
    }
    case 'seated': {
      const s = side({ hip: -90, knee: 90, ankle: 0, shoulder: -18, shoulderZ: 10, elbow: -74 })
      return { ...base, rootY: 0.50, torso: -2, L: s, R: { ...s } }
    }
    case 'standing': {
      const s = side({ shoulder: -8, shoulderZ: 7, elbow: -8 })
      return { ...base, rootY: 0.92, L: s, R: { ...s } }
    }

    default:
      return base
  }
}

type Limb = { hip: THREE.Group; hipZ: THREE.Group; knee: THREE.Group; ankle: THREE.Group; shoulder: THREE.Group; shoulderZ: THREE.Group; elbow: THREE.Group }

let renderer: THREE.WebGLRenderer
let scene: THREE.Scene
let camera: THREE.PerspectiveCamera
let controls: OrbitControls
let root: THREE.Group
let torso: THREE.Group
let limbs: Limb[] = []
let platform: THREE.Mesh | null = null
let roller: THREE.Mesh | null = null
let machine: THREE.Group | null = null
let raf = 0
let visible = true

function matte(color: number, emissive = 0) {
  return new THREE.MeshStandardMaterial({
    color, roughness: 1, metalness: 0,
    emissive: new THREE.Color(emissive),
    emissiveIntensity: emissive ? 0.42 : 0
  })
}

function segment(len: number, radius: number, mat: THREE.Material) {
  const mesh = new THREE.Mesh(
    new THREE.CapsuleGeometry(radius, Math.max(0.001, len - radius * 2), 4, 12),
    mat
  )
  mesh.position.y = -len / 2
  return mesh
}

function joint(parent: THREE.Object3D, y = 0) {
  const g = new THREE.Group()
  g.position.y = y
  parent.add(g)
  return g
}

function buildRig() {
  const skin = matte(BODY)
  const work = matte(WORK)
  work.color = new THREE.Color(0xf3c88a)

  root = new THREE.Group()

  torso = joint(root)
  const tm = new THREE.Mesh(new THREE.CapsuleGeometry(0.135, L.torso - 0.27, 4, 14), skin)
  tm.position.y = L.torso / 2
  torso.add(tm)

  const neck = joint(torso, L.torso)
  const head = new THREE.Mesh(new THREE.SphereGeometry(L.head, 20, 16), skin)
  head.position.y = L.head + 0.03
  neck.add(head)

  limbs = []
  for (const s of [-1, 1]) {
    // Z first so abduction happens about the body's midline, then X swing
    const hipZ = new THREE.Group()
    hipZ.position.x = s * 0.095
    root.add(hipZ)
    const hip = joint(hipZ)
    hip.add(segment(L.thigh, 0.075, work))

    const knee = joint(hip, -L.thigh)
    knee.add(segment(L.shin, 0.058, skin))

    const ankle = joint(knee, -L.shin)
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.055, L.foot), skin)
    foot.position.set(0, -0.03, L.foot / 2 - 0.04)
    ankle.add(foot)

    const shoulderZ = new THREE.Group()
    shoulderZ.position.set(s * 0.175, L.torso - 0.07, 0)
    torso.add(shoulderZ)
    const shoulder = joint(shoulderZ)
    shoulder.add(segment(L.upperArm, 0.05, skin))

    const elbow = joint(shoulder, -L.upperArm)
    elbow.add(segment(L.foreArm, 0.045, skin))

    limbs.push({ hip, hipZ, knee, ankle, shoulder, shoulderZ, elbow })
  }
}

function applyPose(name: string, t: number) {
  const p = pose(name, t)
  root.position.set(p.rootX, p.rootY, p.rootZ)
  root.rotation.y = rad(p.rootRotY)
  torso.rotation.set(rad(p.torso), 0, rad(p.torsoZ))

  const sides = [p.L, p.R]
  limbs.forEach((limb, i) => {
    const v = sides[i]
    const sign = i === 0 ? 1 : -1
    limb.hipZ.rotation.z = rad(v.hipZ * (sign === 1 ? -1 : -1))
    limb.hip.rotation.x = rad(v.hip)
    limb.knee.rotation.x = rad(v.knee)
    limb.ankle.rotation.x = rad(v.ankle)
    limb.shoulderZ.rotation.z = rad(-v.shoulderZ)
    limb.shoulder.rotation.x = rad(v.shoulder)
    limb.elbow.rotation.x = rad(v.elbow)
  })

  root.updateMatrixWorld(true)

  if (platform) {
    const v = new THREE.Vector3()
    limbs[0].ankle.getWorldPosition(v)
    platform.position.set(0, v.y, v.z + 0.16)
    platform.rotation.x = rad(-38)
  }
  if (roller) {
    const v = new THREE.Vector3()
    limbs[0].ankle.getWorldPosition(v)
    roller.position.set(0, v.y, v.z)
  }
}

function buildMachine(name: string) {
  const mat = matte(MACHINE)
  const railMat = matte(RAIL)
  const g = new THREE.Group()
  platform = null
  roller = null

  if (name === 'leg-press') {
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.08, 0.8), mat)
    back.position.set(0, 0.28, -0.3); back.rotation.x = rad(40); g.add(back)
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.08, 0.36), mat)
    seat.position.set(0, 0.32, 0.02); g.add(seat)
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 1.6), railMat)
    rail.position.set(0, 0.82, 0.78); rail.rotation.x = rad(-22); g.add(rail)
    platform = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.62, 0.07), mat)
    g.add(platform)
  }

  if (name === 'leg-extension') {
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.08, 0.5), mat)
    seat.position.set(0, 0.46, 0.1); g.add(seat)
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.62, 0.08), mat)
    back.position.set(0, 0.78, -0.2); back.rotation.x = rad(-10); g.add(back)
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.46, 0.08), railMat)
    post.position.set(0, 0.2, 0.44); g.add(post)
    roller = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.44, 18), mat)
    roller.rotation.z = rad(90); g.add(roller)
  }

  if (name === 'seated') {
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.07, 0.44), mat)
    seat.position.set(0, 0.46, 0.12); g.add(seat)
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.5, 0.07), mat)
    back.position.set(0, 0.72, -0.12); g.add(back)
    for (const [x, z] of [[-0.18, 0.3], [0.18, 0.3], [-0.18, -0.06], [0.18, -0.06]]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.44, 0.05), railMat)
      leg.position.set(x, 0.22, z); g.add(leg)
    }
  }

  if (name === 'lying') {
    const mmat = matte(MACHINE)
    const mat2 = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.05, 1.7), mmat)
    mat2.position.set(0, 0.025, -0.22); g.add(mat2)
  }

  if (name === 'leg-curl') {
    const bench = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.09, 1.25), mat)
    bench.position.set(0, 0.5, 0.26); g.add(bench)
    const leg1 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 0.08), railMat)
    leg1.position.set(0, 0.23, 0.74); g.add(leg1)
    const leg2 = leg1.clone(); leg2.position.z = -0.2; g.add(leg2)
    roller = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.42, 18), mat)
    roller.rotation.z = rad(90); g.add(roller)
  }

  return g
}

function setView(v: string) {
  if (!controls) return
  const r = 2.9
  if (v === 'front') camera.position.set(0, 1.0, r)
  else if (v === '45') camera.position.set(r * 0.72, 1.1, r * 0.72)
  else camera.position.set(r, 0.95, 0.15)
  controls.target.set(0, 0.72, 0.2)
  controls.update()
}

onMounted(() => {
  const el = host.value!
  scene = new THREE.Scene()
  camera = new THREE.PerspectiveCamera(38, el.clientWidth / el.clientHeight, 0.1, 100)

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
  renderer.setSize(el.clientWidth, el.clientHeight)
  el.appendChild(renderer.domElement)

  controls = new OrbitControls(camera, renderer.domElement)
  controls.enablePan = false
  controls.enableDamping = true
  controls.minDistance = 1.6
  controls.maxDistance = 5.5

  const key = new THREE.DirectionalLight(0xffffff, 2.0)
  key.position.set(-2.4, 3, 2)
  scene.add(key)
  scene.add(new THREE.HemisphereLight(0xffffff, 0xd8cfbb, 1.15))

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(2.4, 48),
    new THREE.MeshStandardMaterial({ color: 0xdfe9d8, roughness: 1 })
  )
  floor.rotation.x = -Math.PI / 2
  scene.add(floor)

  buildRig()
  scene.add(root)
  machine = buildMachine(props.exercise)
  scene.add(machine)

  applyPose(props.exercise, props.t)
  setView(props.view)

  // 30fps is plenty for a diagram, and halves the battery cost
  let last = 0
  const loop = (now: number) => {
    raf = requestAnimationFrame(loop)
    if (!visible || now - last < 33) return
    last = now
    controls.update()
    renderer.render(scene, camera)
  }
  raf = requestAnimationFrame(loop)

  const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting))
  io.observe(el)
  const onVis = () => (visible = !document.hidden)
  document.addEventListener('visibilitychange', onVis)

  const ro = new ResizeObserver(() => {
    camera.aspect = el.clientWidth / el.clientHeight
    camera.updateProjectionMatrix()
    renderer.setSize(el.clientWidth, el.clientHeight)
  })
  ro.observe(el)

  onBeforeUnmount(() => {
    ro.disconnect()
    io.disconnect()
    document.removeEventListener('visibilitychange', onVis)
    cancelAnimationFrame(raf)
    controls.dispose()
    scene.traverse((o: any) => {
      o.geometry?.dispose?.()
      if (Array.isArray(o.material)) o.material.forEach((m: any) => m.dispose())
      else o.material?.dispose?.()
    })
    renderer.dispose()
    renderer.domElement.remove()
  })
})

watch(() => props.t, (t) => root && applyPose(props.exercise, t))
watch(() => props.view, setView)
watch(() => props.exercise, (name) => {
  if (!scene) return
  if (machine) scene.remove(machine)
  machine = buildMachine(name)
  scene.add(machine)
  applyPose(name, props.t)
})
</script>

<template>
  <div ref="host" class="viewport" />
</template>

<style scoped>
.viewport { width: 100%; height: 100%; touch-action: none }
</style>

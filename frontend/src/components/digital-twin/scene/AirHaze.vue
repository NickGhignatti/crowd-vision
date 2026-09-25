<script setup lang="ts">
import { computed, onBeforeUnmount, shallowRef, watch } from 'vue'
import { useTresContext } from '@tresjs/core'
import {
  AdditiveBlending,
  BoxGeometry,
  Color,
  InstancedBufferAttribute,
  Matrix4,
  NormalBlending,
  type InstancedMesh,
} from 'three'
import { MeshBasicNodeMaterial } from 'three/webgpu'
import {
  float,
  instancedBufferAttribute,
  mx_fractal_noise_float,
  positionWorld,
  smoothstep,
  time,
  uniform,
  vec3,
} from 'three/tsl'
import { AIR_HAZE, type AirHaze } from '@/utils/digital-twin/airHaze.ts'
import { themeOpacity } from '@/utils/digital-twin/colors.ts'
import { applyRoomColors, applyRoomMatrices } from '@/composables/digital-twin/useInstancedRooms.ts'
import { useTheme } from '@/composables/commons/useTheme.ts'

const props = defineProps<{ hazes: AirHaze[]; colors: Record<string, string> }>()

const { renderer } = useTresContext()
const { theme } = useTheme()
const mesh = shallowRef<InstancedMesh | null>(null)
const rooms = computed(() => props.hazes.map((haze) => haze.room))
/** Rooms without a reading keep their instance, collapsed to nothing. */
const unlitOf = (hazes: AirHaze[]) =>
  new Set(hazes.filter((haze) => !haze.lit).map((haze) => haze.room.id))
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

// The parent remounts this per room set only, so buffers of that size serve every update.
const geometry = new BoxGeometry(1, 1, 1)
const density = new InstancedBufferAttribute(new Float32Array(props.hazes.length), 1)
const speed = new InstancedBufferAttribute(new Float32Array(props.hazes.length), 1)
geometry.setAttribute('density', density)
geometry.setAttribute('speed', speed)

// World-space noise stretched along x/z reads as streaks; sliding it over time reads as wind.
const { x, y, z } = AIR_HAZE.stretch
const clock = reducedMotion ? uniform(0) : time
const shift = clock.mul(instancedBufferAttribute<'float'>(speed, 'float'))
// Three noise octaves break the streak edges into wisps; 0.35 maps their sum back to about 0..1.
const field = mx_fractal_noise_float(
  positionWorld.mul(vec3(x, y, z)).sub(vec3(shift, float(0), shift.mul(0.3))),
  3,
)
const thickness = instancedBufferAttribute<'float'>(density, 'float')
// Denser air lowers the threshold, so more of the room fills with haze.
const threshold = float(AIR_HAZE.coverage.empty).sub(thickness.mul(AIR_HAZE.coverage.perDensity))
const streaks = smoothstep(
  threshold.sub(AIR_HAZE.softness / 4),
  threshold.add((AIR_HAZE.softness * 3) / 4),
  field.mul(0.35).add(0.5),
)
const shape = streaks.mul(float(0.4).add(thickness.mul(0.6)))

const material = computed(() => {
  const next = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false })
  next.opacityNode = uniform(themeOpacity(AIR_HAZE.opacity, theme.value)).mul(shape)
  // Additive glow vanishes on a light background, so only the dark theme adds.
  next.blending = theme.value === 'dark' ? AdditiveBlending : NormalBlending
  return next
})

const scratchColor = new Color()
const scratchMatrix = new Matrix4()
// Assigned, not bound: Tres calls a method prop instead of replacing it.
// The haze is scenery, so a click through it must still reach the room.
const noRaycast = () => {}

watch(
  [mesh, material, () => props.hazes, () => props.colors],
  ([target, next, hazes, colors], [, previous]) => {
    if (previous && previous !== next) previous.dispose()
    if (!target) return
    target.material = next
    target.raycast = noRaycast
    hazes.forEach((haze, index) => {
      density.setX(index, haze.density)
      speed.setX(index, haze.speed)
    })
    density.needsUpdate = true
    speed.needsUpdate = true
    applyRoomMatrices(target, rooms.value, scratchMatrix, unlitOf(hazes))
    applyRoomColors(target, rooms.value, colors, scratchColor, '#000000')
    renderer.invalidate()
  },
  { immediate: true, flush: 'post' },
)

// The scene renders on demand; moving haze needs a frame every tick, but only while some haze is
// lit — the layer now stays mounted with every room collapsed when air mode is off, and an
// unconditional pump would render continuously in every mode. rAF already stops in a hidden tab.
let frame = 0
const tick = () => {
  renderer.invalidate()
  frame = requestAnimationFrame(tick)
}
const animating = computed(() => !reducedMotion && props.hazes.some((haze) => haze.lit))
watch(
  animating,
  (on) => {
    cancelAnimationFrame(frame)
    if (on) frame = requestAnimationFrame(tick)
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  cancelAnimationFrame(frame)
  material.value.dispose()
  geometry.dispose()
})
</script>

<template>
  <TresInstancedMesh
    v-if="hazes.length > 0"
    ref="mesh"
    :args="[geometry, undefined, hazes.length]"
  />
</template>

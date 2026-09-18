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
import { float, instancedBufferAttribute, positionGeometry, uniform } from 'three/tsl'
import { THERMAL_GLOW, themeOpacity } from '@/utils/digital-twin/colors.ts'
import type { ThermalGlow } from '@/utils/digital-twin/thermalGlow.ts'
import { applyRoomColors, applyRoomMatrices } from '@/composables/digital-twin/useInstancedRooms.ts'
import { useTheme } from '@/composables/commons/useTheme.ts'

const props = defineProps<{ glows: ThermalGlow[]; colors: Record<string, string> }>()

const { renderer } = useTresContext()
const { theme } = useTheme()
const mesh = shallowRef<InstancedMesh | null>(null)
const rooms = computed(() => props.glows.map((glow) => glow.room))

// The parent remounts this per glow count, so one buffer of that size serves every update.
const geometry = new BoxGeometry(1, 1, 1)
const strength = new InstancedBufferAttribute(new Float32Array(props.glows.length), 1)
geometry.setAttribute('strength', strength)

// Strongest on the floor, clear at the ceiling; the unit box spans y -0.5..0.5.
const rise = float(1).sub(positionGeometry.y.add(0.5)).pow(uniform(THERMAL_GLOW.falloff))
const shape = rise.mul(instancedBufferAttribute(strength))

const material = computed(() => {
  const next = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false })
  next.opacityNode = uniform(themeOpacity(THERMAL_GLOW.floorOpacity, theme.value)).mul(shape)
  // Additive glow vanishes on a light background, so only the dark theme adds.
  next.blending = theme.value === 'dark' ? AdditiveBlending : NormalBlending
  return next
})

const scratchColor = new Color()
const scratchMatrix = new Matrix4()
// Assigned, not bound: Tres calls a method prop instead of replacing it.
// The glow is scenery, so a click through it must still reach the room.
const noRaycast = () => {}

watch(
  [mesh, material, () => props.glows, () => props.colors],
  ([target, next, glows, colors], [, previous]) => {
    if (previous && previous !== next) previous.dispose()
    if (!target) return
    target.material = next
    target.raycast = noRaycast
    glows.forEach((glow, index) => strength.setX(index, glow.strength))
    strength.needsUpdate = true
    applyRoomMatrices(target, rooms.value, scratchMatrix)
    applyRoomColors(target, rooms.value, colors, scratchColor, '#000000')
    renderer.invalidate()
  },
  { immediate: true, flush: 'post' },
)

onBeforeUnmount(() => {
  material.value.dispose()
  geometry.dispose()
})
</script>

<template>
  <TresInstancedMesh
    v-if="glows.length > 0"
    ref="mesh"
    :args="[geometry, undefined, glows.length]"
  />
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, shallowRef, watch } from 'vue'
import { useTresContext } from '@tresjs/core'
import {
  CircleGeometry,
  Matrix4,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  type InstancedMesh,
} from 'three'
import { MeshBasicNodeMaterial } from 'three/webgpu'
import { splitDevices } from '@/utils/digital-twin/devices.ts'
import type { Device } from '@/utils/digital-twin/devices.ts'

/** `capacity` is fixed per mount; the parent remounts this when the crowd outgrows it. */
const props = defineProps<{ devices: Device[]; capacity: number; theme: 'light' | 'dark' }>()

// A dot floats at phone height; its halo lies just above the floor so it never flickers into it.
const DOT_LIFT = 1.1
const HALO_LIFT = 0.04
const DOT_SIZE = 0.32
const CONNECTED = { light: '#0f766e', dark: '#5eead4' }
const PASSING = { light: '#64748b', dark: '#cbd5e1' }
// Halos of a crowded room pile up, and on the dark background they read as a solid blob sooner.
const HALO_OPACITY = { light: 0.14, dark: 0.08 }

const { renderer } = useTresContext()

const dotGeometry = new SphereGeometry(DOT_SIZE, 16, 12)
const ringGeometry = new TorusGeometry(DOT_SIZE, 0.06, 8, 24)
const haloGeometry = new CircleGeometry(1, 40)
const dotMaterial = new MeshBasicNodeMaterial()
const ringMaterial = new MeshBasicNodeMaterial()
const haloMaterial = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false })

const dots = shallowRef<InstancedMesh | null>(null)
const rings = shallowRef<InstancedMesh | null>(null)
const halos = shallowRef<InstancedMesh | null>(null)
const split = computed(() => splitDevices(props.devices))

const matrix = new Matrix4()
const at = new Vector3()
const size = new Vector3()
const flat = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2)
// Assigned, not bound: Tres calls a method prop instead of replacing it.
// Dots are scenery, so a click through them must still reach the room.
const noRaycast = () => {}

function place(mesh: InstancedMesh, devices: Device[], lift: number, scale: (d: Device) => number) {
  devices.forEach((device, index) => {
    const s = scale(device)
    at.set(device.x, device.y + lift, device.z)
    size.set(s, s, 1)
    mesh.setMatrixAt(index, matrix.compose(at, flat, size))
  })
  mesh.count = devices.length
  mesh.instanceMatrix.needsUpdate = true
  mesh.raycast = noRaycast
}

watch(
  [dots, rings, halos, split, () => props.theme],
  ([dot, ring, halo, { connected, passing }, theme]) => {
    dotMaterial.color.set(CONNECTED[theme])
    ringMaterial.color.set(PASSING[theme])
    haloMaterial.color.set(CONNECTED[theme])
    haloMaterial.opacity = HALO_OPACITY[theme]
    if (dot) place(dot, connected, DOT_LIFT, () => 1)
    if (ring) place(ring, passing, DOT_LIFT, () => 1)
    if (halo) place(halo, props.devices, HALO_LIFT, ({ radius }) => radius)
    renderer.invalidate()
  },
  { immediate: true, flush: 'post' },
)

onBeforeUnmount(() => {
  for (const owned of [dotGeometry, ringGeometry, haloGeometry]) owned.dispose()
  for (const owned of [dotMaterial, ringMaterial, haloMaterial]) owned.dispose()
})
</script>

<template>
  <TresInstancedMesh ref="halos" :args="[haloGeometry, haloMaterial, capacity]" />
  <TresInstancedMesh ref="dots" :args="[dotGeometry, dotMaterial, capacity]" />
  <TresInstancedMesh ref="rings" :args="[ringGeometry, ringMaterial, capacity]" />
</template>

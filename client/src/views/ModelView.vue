<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import NavBar from '@/components/NavBar.vue'
import LeftMenu from '@/components/menus/LeftMenu.vue'
import RightMenu from '@/components/menus/RightMenu.vue'
import type { BuildingPayload } from '@/scripts/schema.ts'

const canvasRef = ref<HTMLCanvasElement | null>(null)
const canvasContainerRef = ref<HTMLDivElement | null>(null)

let renderer: THREE.WebGLRenderer | null = null
let scene: THREE.Scene | null = null
let camera: THREE.PerspectiveCamera | null = null
let controls: OrbitControls | null = null
let animationId: number | null = null
let meshGroup: THREE.Group | null = null
let resizeObserver: ResizeObserver | null = null

const buildingRef = ref<BuildingPayload | null>(null)

watch(
  () => buildingRef.value,
  (newValue) => {
    if (newValue) drawBuilding()
  },
)

const requestBuildingSchema = async () => {
  try {
    const response = await fetch("http://localhost:3000/building/unibo-campus-cesena")
    if (!response.ok) throw new Error('Failed to fetch')
    const data = await response.json()
    buildingRef.value = data.building
  } catch (e) {
    console.error(e)
  }
}

const DEFAULT_POS = { x: 10, y: 10, z: 10 }

onMounted(() => {
  initThree()
  setupResizeObserver() // Initialize the observer
  requestBuildingSchema()
  if (buildingRef.value) {
    drawBuilding()
  }
})

onUnmounted(() => {
  if (resizeObserver) resizeObserver.disconnect() // Cleanup observer
  if (animationId) cancelAnimationFrame(animationId)
  renderer?.dispose()
  controls?.dispose()
})

const setupResizeObserver = () => {
  if (!canvasContainerRef.value) return
  resizeObserver = new ResizeObserver(() => {
    handleResize()
  })
  resizeObserver.observe(canvasContainerRef.value)
}

const initThree = () => {
  if (!canvasRef.value) return

  scene = new THREE.Scene()
  scene.background = new THREE.Color('#f8fafc')

  const aspect = canvasRef.value.clientWidth / canvasRef.value.clientHeight
  camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 1000)
  camera.position.set(DEFAULT_POS.x, DEFAULT_POS.y, DEFAULT_POS.z)

  renderer = new THREE.WebGLRenderer({
    canvas: canvasRef.value,
    antialias: true,
    alpha: true,
  })
  renderer.setSize(canvasRef.value.clientWidth, canvasRef.value.clientHeight)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.shadowMap.enabled = true

  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true // Adds smooth inertia (requires controls.update in loop)
  controls.dampingFactor = 0.05
  controls.target.set(0, 0, 0)

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6)
  scene.add(ambientLight)

  const dirLight = new THREE.DirectionalLight(0xffffff, 0.8)
  dirLight.position.set(10, 20, 10)
  dirLight.castShadow = true
  scene.add(dirLight)

  meshGroup = new THREE.Group()

  const gridHelper = new THREE.GridHelper(50, 50, '#cbd5e1', '#e2e8f0')
  scene.add(gridHelper)
  scene.add(meshGroup)

  animate()
}

const drawBuilding = () => {
  if (buildingRef.value && meshGroup) {
    meshGroup.clear()

    buildingRef.value.rooms.forEach((room) => {
      const geometryBase = new THREE.BoxGeometry(
        room.dimensions.width,
        room.dimensions.height,
        room.dimensions.depth,
      )

      const materialBase = new THREE.MeshStandardMaterial({
        color: '#e2e8f0',
        transparent: true,
        opacity: 0.3,
        depthWrite: false,
        side: THREE.DoubleSide,
      })

      const element = new THREE.Mesh(geometryBase, materialBase)
      element.position.set(room.position.x, room.position.y, room.position.z)
      element.castShadow = true
      element.receiveShadow = true

      const edgesGeometry = new THREE.EdgesGeometry(geometryBase)
      const edgesMaterial = new THREE.LineBasicMaterial({
        color: '#000000',
        linewidth: 2,
      })
      const border = new THREE.LineSegments(edgesGeometry, edgesMaterial)
      element.add(border)

      meshGroup!.add(element)
    })
  }
}

const animate = () => {
  animationId = requestAnimationFrame(animate)
  if (controls) controls.update()
  if (renderer && scene && camera) renderer.render(scene, camera)
}

const resetView = () => {
  if (!camera || !controls) return
  camera.position.set(DEFAULT_POS.x, DEFAULT_POS.y, DEFAULT_POS.z)
  controls.target.set(0, 0, 0) // Reset control target
  controls.update()
}

const zoomIn = () => {
  if (!camera) return
  const direction = new THREE.Vector3()
  camera.getWorldDirection(direction)
  camera.position.add(direction.multiplyScalar(2))
}

const zoomOut = () => {
  if (!camera) return
  const direction = new THREE.Vector3()
  camera.getWorldDirection(direction)
  camera.position.add(direction.multiplyScalar(-2))
}

const handleResize = () => {
  if (!canvasContainerRef.value || !camera || !renderer) return

  const width = canvasContainerRef.value.clientWidth
  const height = canvasContainerRef.value.clientHeight

  camera.aspect = width / height
  camera.updateProjectionMatrix()
  renderer.setSize(width, height)
}
</script>

<template>
  <div class="h-screen flex flex-col bg-slate-50 overflow-hidden">
    <NavBar />

    <div class="flex flex-1 relative h-[calc(100vh-64px)] w-full overflow-hidden">
      <LeftMenu structure-id="UniBo campus cesena" />

      <main ref="canvasContainerRef" class="flex-1 relative bg-slate-50 z-0 min-w-0">
        <div class="absolute inset-0">
          <canvas ref="canvasRef" class="w-full h-full block outline-none"></canvas>
        </div>

        <div
          class="absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-2 bg-white/90 backdrop-blur rounded-full px-4 py-2 shadow-xl border border-slate-200/50 z-10"
        >
          <button
            @click="resetView"
            class="p-2 text-slate-500 hover:text-emerald-600 transition-colors"
            title="Reset View"
          >
            <i class="ph-bold ph-cube text-xl"></i>
          </button>
          <button
            @click="zoomIn"
            class="p-2 text-slate-500 hover:text-emerald-600 transition-colors"
            title="Zoom In"
          >
            <i class="ph-bold ph-plus text-xl"></i>
          </button>
          <button
            @click="zoomOut"
            class="p-2 text-slate-500 hover:text-emerald-600 transition-colors"
            title="Zoom Out"
          >
            <i class="ph-bold ph-minus text-xl"></i>
          </button>
        </div>
      </main>

      <RightMenu :building="buildingRef" />
    </div>
  </div>
</template>

import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

export class SchoolScene {
  constructor(containerElement, roomsData) {
    this.container = containerElement
    this.rooms = roomsData
    this.students = []
    this.animationId = null
    this.scene = null
    this.camera = null
    this.renderer = null
    this.controls = null
    this.gasTexture = null
    this.roofMesh = null

    this.init()
  }

  init() {
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0x0f172a)
    this.scene.fog = new THREE.Fog(0x0f172a, 20, 60)
    const { clientWidth: width, clientHeight: height } = this.container
    this.camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000)
    this.camera.position.set(15, 15, 15)
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    this.renderer.setSize(width, height)
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.container.appendChild(this.renderer.domElement)
    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.05
    this.addLights()
    this.addHelpers()
    this.gasTexture = this.createGasTexture()
    this.buildSchool()
    this.animate()
    window.addEventListener('resize', () => this.onResize())
  }

  addLights() {
    const ambient = new THREE.AmbientLight(0xffffff, 0.6)
    this.scene.add(ambient)
    const dir = new THREE.DirectionalLight(0xaaccff, 0.8)
    dir.position.set(10, 20, 10)
    this.scene.add(dir)
  }

  addHelpers() {
    const grid = new THREE.GridHelper(60, 60, 0x334155, 0x1e293b)
    this.scene.add(grid)
  }

  createGasTexture() {
    const canvas = document.createElement('canvas')
    canvas.width = 64
    canvas.height = 64
    const ctx = canvas.getContext('2d')
    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
    grad.addColorStop(0, 'rgba(255, 255, 255, 1)')
    grad.addColorStop(0.4, 'rgba(100, 240, 255, 0.6)')
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, 64, 64)
    return new THREE.CanvasTexture(canvas)
  }

  buildSchool() {
    const schoolGroup = new THREE.Group()
    const h = 3

    this.rooms.forEach(room => {
      const floorGeo = new THREE.PlaneGeometry(room.w - 0.2, room.d - 0.2)
      const color = room.id === 'hallway' ? 0x10b981 : 0x3b82f6
      const floorMat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.1,
        side: THREE.DoubleSide
      })
      const floor = new THREE.Mesh(floorGeo, floorMat)
      floor.rotation.x = -Math.PI / 2
      floor.position.set(room.x, 0.05, room.z)
      schoolGroup.add(floor)

      const boxGeo = new THREE.BoxGeometry(room.w, h, room.d)
      const edges = new THREE.EdgesGeometry(boxGeo)
      const lineMat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.4 })
      const walls = new THREE.LineSegments(edges, lineMat)
      walls.position.set(room.x, h / 2, room.z)
      schoolGroup.add(walls)
    })

    const roofGeo = new THREE.ConeGeometry(9, 3, 4)
    const roofEdges = new THREE.EdgesGeometry(roofGeo)
    const roofLines = new THREE.LineSegments(roofEdges, new THREE.LineBasicMaterial({ color: 0x64748b }))
    roofLines.position.y = 5.5
    roofLines.rotation.y = Math.PI / 4
    this.roofMesh = roofLines
    schoolGroup.add(roofLines)

    this.scene.add(schoolGroup)
  }

  addStudentToRoom(roomIndex) {
    const room = this.rooms[roomIndex]
    if (!room) return

    const mat = new THREE.SpriteMaterial({
      map: this.gasTexture,
      color: room.id === 'hallway' ? 0x34d399 : 0x60a5fa,
      transparent: true, opacity: 0.7,
      blending: THREE.AdditiveBlending, depthWrite: false
    })
    const sprite = new THREE.Sprite(mat)

    const scale = 0.8 + Math.random() * 0.5
    sprite.scale.set(scale, scale * 0.7, 1.0)

    const pad = 0.3
    const bounds = {
      xMin: (room.x - room.w / 2) + pad, xMax: (room.x + room.w / 2) - pad,
      zMin: (room.z - room.d / 2) + pad, zMax: (room.z + room.d / 2) - pad
    }

    sprite.position.set(
      bounds.xMin + Math.random() * (bounds.xMax - bounds.xMin),
      0.5,
      bounds.zMin + Math.random() * (bounds.zMax - bounds.zMin)
    )

    sprite.userData = {
      roomIndex,
      bounds,
      velX: (Math.random() - 0.5) * 0.03,
      velZ: (Math.random() - 0.5) * 0.03
    }

    this.scene.add(sprite)
    this.students.push(sprite)
  }

  removeStudentFromRoom(roomIndex) {
    let idx = -1
    for (let i = this.students.length - 1; i >= 0; i--) {
      if (this.students[i].userData.roomIndex === roomIndex) {
        idx = i
        break
      }
    }
    if (idx !== -1) {
      const s = this.students[idx]
      this.scene.remove(s)
      s.material.dispose()
      this.students.splice(idx, 1)
    }
  }

  clearAll() {
    this.students.forEach(s => {
      this.scene.remove(s)
      s.material.dispose()
    })
    this.students = []
  }

  setRoofVisibility(visible) {
    if (this.roofMesh) this.roofMesh.visible = visible
  }

  focusOn(x, z) {
    this.controls.target.set(x, 0, z)
    this.camera.position.set(x, 8, z + 10)
    this.controls.update()
  }

  resetCamera() {
    this.controls.target.set(0, 0, 0)
    this.camera.position.set(15, 15, 15)
    this.controls.update()
  }

  onResize() {
    if (!this.container) return
    const w = this.container.clientWidth
    const h = this.container.clientHeight
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h)
  }

  animate() {
    this.animationId = requestAnimationFrame(() => this.animate())

    this.students.forEach(s => {
      const p = s.position
      const d = s.userData
      const b = d.bounds

      p.x += d.velX
      p.z += d.velZ

      if (p.x < b.xMin || p.x > b.xMax) d.velX *= -1
      if (p.z < b.zMin || p.z > b.zMax) d.velZ *= -1
    })

    this.controls.update()
    this.renderer.render(this.scene, this.camera)
  }

  dispose() {
    cancelAnimationFrame(this.animationId)
    this.renderer.dispose()
    this.gasTexture.dispose()
    window.removeEventListener('resize', this.onResize)
  }
}

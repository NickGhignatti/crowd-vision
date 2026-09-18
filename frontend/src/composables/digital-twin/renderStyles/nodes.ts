import { Vector3, type InstancedBufferAttribute, type InstancedMesh, type Object3D } from 'three'
import type { Node } from 'three/webgpu'
import {
  cameraPosition,
  float,
  fwidth,
  instancedBufferAttribute,
  max,
  min,
  normalGeometry,
  positionGeometry,
  positionWorld,
  select,
  smoothstep,
  uniform,
  uv,
  varying,
  vec3,
} from 'three/tsl'

const falloff = (border: Node<'float'>, width: number) =>
  float(1)
    .sub(smoothstep(0, uniform(width), border))
    .pow(2)

/** Per-instance flags of `HiddenEdges`: `walls` -x, +x, -z, +z; `corners` -x-z, +x-z, -x+z, +x+z. */
export interface EdgeMask {
  walls: InstancedBufferAttribute
  corners: InstancedBufferAttribute
}

/**
 * 1 on a box face's border, fading to 0 over `width` screen pixels. With `mask`, a unit box
 * instance drops the edges it marks while a neighbour's lit face draws them instead.
 */
export function edgeGlow(width: number, mask?: EdgeMask) {
  // Each box face spans uv 0..1; dividing by fwidth turns the border distance into pixels.
  if (!mask) {
    const border = min(uv(), float(1).sub(uv())).div(fwidth(uv()))
    return falloff(min(border.x, border.y), width)
  }
  const walls = instancedBufferAttribute<'vec4'>(mask.walls, 'vec4')
  const corners = instancedBufferAttribute<'vec4'>(mask.corners, 'vec4')
  const p = positionGeometry
  // A face is flat along its own axis, which has no border there.
  const flat = normalGeometry.abs()
  const [onX, onY, onZ] = [flat.x, flat.y, flat.z]
  // Past an edge's plane the keeper's face on it is lit, so this room's wall face may drop the line.
  // Per vertex, each edge's own corners decide it; rounding drops the far corners' blend.
  const toCamera = cameraPosition.sub(positionWorld).sign()
  const [past, pastLow] = [toCamera.max(0), toCamera.negate().max(0)]
  const sharesX = (flag: Node<'float'>) => flag.mod(2)
  const sharesZ = (flag: Node<'float'>) => flag.div(2).floor()
  const onXFace = (flag: Node<'float'>, beyond: Node<'float'>) =>
    max(sharesX(flag), sharesZ(flag).mul(beyond))
  const onZFace = (flag: Node<'float'>, beyond: Node<'float'>) =>
    max(sharesZ(flag), sharesX(flag).mul(beyond))
  const wallFace = onX
    .mul(select(p.x.greaterThan(0), walls.y, walls.x))
    .add(onZ.mul(select(p.z.greaterThan(0), walls.w, walls.z)))
  const xSide = p.x.greaterThan(0)
  const zSide = p.z.greaterThan(0)
  const low = vec3(
    onY.mul(walls.x).add(onZ.mul(onZFace(select(zSide, corners.z, corners.x), pastLow.x))),
    wallFace.mul(pastLow.y),
    onY.mul(walls.z).add(onX.mul(onXFace(select(xSide, corners.y, corners.x), pastLow.z))),
  )
  const high = vec3(
    onY.mul(walls.y).add(onZ.mul(onZFace(select(zSide, corners.w, corners.y), past.x))),
    wallFace.mul(past.y),
    onY.mul(walls.w).add(onX.mul(onXFace(select(xSide, corners.w, corners.z), past.z))),
  )
  // The masks hold per face, so the vertex stage works them out and each pixel only measures.
  const slope = fwidth(p).max(1e-7)
  const toLow = p
    .add(0.5)
    .div(slope)
    .add(varying(flat.add(low)).add(0.5).floor().mul(1e6))
  const toHigh = float(0.5)
    .sub(p)
    .div(slope)
    .add(varying(flat.add(high)).add(0.5).floor().mul(1e6))
  const near = min(toLow, toHigh)
  return falloff(min(near.x, min(near.y, near.z)), width)
}

const centre = new Vector3()

function boundsOf(object: Object3D) {
  // An InstancedMesh bounds all its instances; a plain Mesh only has its geometry's bounds.
  const mesh = object as InstancedMesh
  if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere()
  return mesh.boundingSphere ?? mesh.geometry.boundingSphere
}

/** The drawn mesh's world bounds: camera distance to their centre, and their radius. */
export function focusSphere() {
  const distance = uniform(1).onObjectUpdate(({ object, camera }) => {
    const sphere = object && boundsOf(object)
    if (!object || !camera || !sphere) return 1
    centre.copy(sphere.center).applyMatrix4(object.matrixWorld)
    return camera.position.distanceTo(centre)
  })
  const radius = uniform(1).onObjectUpdate(({ object }) => {
    const sphere = object && boundsOf(object)
    return object && sphere
      ? Math.max(sphere.radius * object.matrixWorld.getMaxScaleOnAxis(), 0.001)
      : 1
  })
  return { distance, radius }
}

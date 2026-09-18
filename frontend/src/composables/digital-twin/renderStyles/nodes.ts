import { Vector3, type InstancedBufferAttribute, type InstancedMesh, type Object3D } from 'three'
import type { Node } from 'three/webgpu'
import {
  float,
  fwidth,
  instancedBufferAttribute,
  min,
  positionGeometry,
  select,
  smoothstep,
  uniform,
  uv,
  vec3,
} from 'three/tsl'

const falloff = (border: Node<'float'>, width: number) =>
  float(1)
    .sub(smoothstep(0, uniform(width), border))
    .pow(2)

/**
 * 1 on a box face's border, fading to 0 over `width` screen pixels. With `hidden`, a unit box
 * instance's -x, +x, -z, +z walls marked 1 lose their edges, their own face included.
 */
export function edgeGlow(width: number, hidden?: InstancedBufferAttribute) {
  // Each box face spans uv 0..1; dividing by fwidth turns the border distance into pixels.
  if (!hidden) {
    const border = min(uv(), float(1).sub(uv())).div(fwidth(uv()))
    return falloff(min(border.x, border.y), width)
  }
  const walls = instancedBufferAttribute<'vec4'>(hidden, 'vec4')
  const p = positionGeometry
  const slope = fwidth(p)
  // A face is flat along its own axis, which has no border there: push it out of reach.
  const flat = vec3(1).sub(slope.mul(1e9).min(1))
  const off = (lo: Node<'float'>, hi: Node<'float'>) => flat.add(vec3(lo, 0, hi)).mul(1e6)
  const low = p.add(0.5).div(slope.max(1e-7)).add(off(walls.x, walls.z))
  const high = float(0.5).sub(p).div(slope.max(1e-7)).add(off(walls.y, walls.w))
  const near = min(low, high)
  const ownFace = flat.x
    .mul(select(p.x.greaterThan(0), walls.y, walls.x))
    .add(flat.z.mul(select(p.z.greaterThan(0), walls.w, walls.z)))
  return falloff(min(near.x, min(near.y, near.z)), width).mul(float(1).sub(ownFace))
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

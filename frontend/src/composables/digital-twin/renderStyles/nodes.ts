import { Vector3, type InstancedMesh, type Object3D } from 'three'
import { float, fwidth, min, smoothstep, uniform, uv } from 'three/tsl'

/** 1 on a box face's border, fading to 0 over `width` screen pixels. */
export function edgeGlow(width: number) {
  // Each box face spans uv 0..1; dividing by fwidth turns the border distance into pixels.
  const border = min(uv(), float(1).sub(uv())).div(fwidth(uv()))
  return float(1)
    .sub(smoothstep(0, uniform(width), min(border.x, border.y)))
    .pow(2)
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

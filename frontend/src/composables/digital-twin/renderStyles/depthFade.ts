import { AdditiveBlending, NormalBlending, type InstancedBufferAttribute } from 'three'
import { MeshLambertNodeMaterial } from 'three/webgpu'
import { min, mix, positionView, smoothstep, uniform } from 'three/tsl'
import { renderStyleConfig, type DepthShading } from '@/utils/digital-twin/renderStyleConfig.ts'
import { edgeGlow, focusSphere } from './nodes.ts'
import type { RenderStyle } from './types.ts'

/** Faint on the camera's side of the building, solid toward the far side, at any zoom. */
function createDepthMaterial(
  shading: DepthShading,
  additive: boolean,
  hiddenWalls?: InstancedBufferAttribute,
) {
  const material = new MeshLambertNodeMaterial({ transparent: true, depthWrite: false })
  const { distance, radius } = focusSphere()
  const t = smoothstep(
    distance.add(radius.mul(uniform(shading.near))),
    distance.add(radius.mul(uniform(shading.far))),
    positionView.length(),
  )
  const fade = mix(uniform(shading.nearOpacity), uniform(shading.farOpacity), t)
  const glow = uniform(shading.edgeStrength).mul(edgeGlow(shading.edgeWidth, hiddenWalls))
  material.opacityNode = min(fade.add(glow), 1)
  // Additive glow vanishes on a light background, so only the dark theme adds.
  material.blending = additive ? AdditiveBlending : NormalBlending
  return material
}

const config = renderStyleConfig('depth')

export const depthFade: RenderStyle = {
  id: 'depth',
  material: (role, theme, hiddenWalls) =>
    createDepthMaterial(config[role], theme === 'dark', hiddenWalls),
}

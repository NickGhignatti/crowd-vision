import { AdditiveBlending, NormalBlending } from 'three'
import { MeshLambertNodeMaterial } from 'three/webgpu'
import { float, min, normalView, positionViewDirection, uniform } from 'three/tsl'
import { renderStyleConfig, type ShellShading } from '@/utils/digital-twin/renderStyleConfig.ts'
import { edgeGlow, type EdgeMask } from './nodes.ts'
import type { RenderStyle } from './types.ts'

/** A see-through room skin: nearly clear facing the camera, firmer toward its silhouette and edges. */
function createShellMaterial(shading: ShellShading, additive: boolean, edges?: EdgeMask) {
  const { base, strength, power, edgeWidth, edgeStrength } = shading
  const material = new MeshLambertNodeMaterial({ transparent: true, depthWrite: false })
  const rim = float(1).sub(normalView.dot(positionViewDirection).abs()).pow(uniform(power))
  const fresnel = uniform(base).add(uniform(strength).mul(rim))
  material.opacityNode = min(fresnel.add(uniform(edgeStrength).mul(edgeGlow(edgeWidth, edges))), 1)
  // Additive glow vanishes on a light background, so only the dark theme adds.
  material.blending = additive ? AdditiveBlending : NormalBlending
  return material
}

const config = renderStyleConfig('ghost')

export const ghostShell: RenderStyle = {
  id: 'ghost',
  material: (role, theme, edges) => createShellMaterial(config[role], theme === 'dark', edges),
}

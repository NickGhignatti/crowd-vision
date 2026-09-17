import { AdditiveBlending, NormalBlending } from 'three'
import { MeshLambertNodeMaterial } from 'three/webgpu'
import {
  float,
  fwidth,
  min,
  normalView,
  positionViewDirection,
  smoothstep,
  uniform,
  uv,
} from 'three/tsl'
import { renderStyleConfig, type ShellShading } from '@/utils/digital-twin/renderStyleConfig.ts'
import type { RenderStyle } from './types.ts'

/** A see-through room skin: nearly clear facing the camera, firmer toward its silhouette and edges. */
function createShellMaterial(shading: ShellShading, additive: boolean) {
  const { base, strength, power, edgeWidth, edgeStrength } = shading
  const material = new MeshLambertNodeMaterial({ transparent: true, depthWrite: false })
  const rim = float(1).sub(normalView.dot(positionViewDirection).abs()).pow(uniform(power))
  // Each box face spans uv 0..1; dividing by fwidth turns the border distance into pixels.
  const border = min(uv(), float(1).sub(uv())).div(fwidth(uv()))
  const glow = float(1)
    .sub(smoothstep(0, uniform(edgeWidth), min(border.x, border.y)))
    .pow(2)
  const fresnel = uniform(base).add(uniform(strength).mul(rim))
  material.opacityNode = min(fresnel.add(uniform(edgeStrength).mul(glow)), 1)
  // Additive glow vanishes on a light background, so only the dark theme adds.
  material.blending = additive ? AdditiveBlending : NormalBlending
  return material
}

const config = renderStyleConfig('ghost')

export const ghostShell: RenderStyle = {
  id: 'ghost',
  material: (role, theme) => createShellMaterial(config[role], theme === 'dark'),
}

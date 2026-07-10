export type RenderMode = 'always' | 'on-demand'

/**
 * AutoRotate drives the camera from inside the render loop itself (`onBeforeRender`),
 * which only fires when a frame actually renders. In on-demand mode that's a deadlock:
 * no frame -> no callback -> no camera move -> no frame. So force continuous rendering
 * while rotating, and drop back to on-demand once it stops.
 */
export function selectRenderMode(isRotating: boolean): RenderMode {
  return isRotating ? 'always' : 'on-demand'
}

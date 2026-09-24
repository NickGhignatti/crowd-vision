import { onBeforeUnmount, watch } from 'vue'
import type { Ref } from 'vue'
import { useTresContext } from '@tresjs/core'
import { Sprite } from 'three'
import type { Group, Texture } from 'three'
import { SpriteNodeMaterial } from 'three/webgpu'

import type { Coordinates } from '@/types/digital-twin/building.ts'

export interface SpriteItem {
  key: string
  position: Coordinates
  map: Texture
}

/**
 * Keeps a group's sprites in step with a list, imperatively. Tres cannot take a node material as a
 * prop (it re-patches the sprite each render, which re-renders it) nor build one from a tag (they
 * live in `three/webgpu`), so the sprites are made here — as `RoomInstances` does for its mesh.
 */
export function useSpriteLayer(
  group: Ref<Group | null>,
  items: Ref<SpriteItem[]>,
  size: number,
  name: string,
) {
  const { renderer } = useTresContext()
  const sprites = new Map<string, Sprite>()
  // One material per texture, shared by every sprite drawing it.
  const materials = new Map<string, SpriteNodeMaterial>()

  const materialFor = (map: Texture): SpriteNodeMaterial => {
    const existing = materials.get(map.uuid)
    if (existing) return existing
    const material = new SpriteNodeMaterial({ map, transparent: true, depthTest: false })
    materials.set(map.uuid, material)
    return material
  }

  watch(
    [group, items],
    ([target, list]) => {
      if (!target) return
      const seen = new Set<string>()

      for (const item of list) {
        seen.add(item.key)
        let sprite = sprites.get(item.key)
        if (!sprite) {
          sprite = new Sprite(materialFor(item.map))
          sprite.name = name
          sprite.renderOrder = 10
          sprite.userData.key = item.key
          sprites.set(item.key, sprite)
          target.add(sprite)
        }
        sprite.material = materialFor(item.map)
        sprite.position.set(item.position.x, item.position.y, item.position.z)
        sprite.scale.set(size, size, 1)
      }

      for (const [key, sprite] of sprites) {
        if (seen.has(key)) continue
        sprite.removeFromParent()
        sprites.delete(key)
      }
      renderer.invalidate()
    },
    { immediate: true, flush: 'post' },
  )

  // Unmounting leaves no sprite behind and frees the shaders the materials compiled.
  onBeforeUnmount(() => {
    for (const sprite of sprites.values()) sprite.removeFromParent()
    sprites.clear()
    for (const material of materials.values()) material.dispose()
    materials.clear()
    renderer.invalidate()
  })
}

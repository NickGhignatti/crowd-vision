<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue'
import { useTresContext } from '@tresjs/core'
import type { Mesh } from 'three'
import type { Room } from '@/types/digital-twin/building.ts'
import { renderStyleConfig } from '@/utils/digital-twin/renderStyleConfig.ts'
import { useRenderStyle } from '@/composables/digital-twin/useRenderStyle.ts'
import { useTheme } from '@/composables/commons/useTheme.ts'
import {
  materialKey,
  selectedRoomMaterials,
} from '@/composables/digital-twin/selectedRoomMaterials.ts'

const props = defineProps<{ room: Room; color?: string }>()

defineEmits<{ select: [roomId: string] }>()

const { renderer } = useTresContext()
const { theme } = useTheme()
const { current } = useRenderStyle()
const mesh = shallowRef<Mesh | null>(null)
const material = computed(() => selectedRoomMaterials.get(materialKey(current.value, theme.value)))

watch(
  [mesh, material, () => props.color],
  ([target, next]) => {
    next.color.set(props.color ?? renderStyleConfig(current.value).idleColor[theme.value])
    if (!target) return
    target.material = next
    renderer.invalidate()
  },
  { immediate: true, flush: 'post' },
)
</script>

<template>
  <TresGroup :position="[room.position.x, room.position.y, room.position.z]">
    <TresMesh ref="mesh" name="room-shell" @click="$emit('select', room.id)">
      <TresBoxGeometry
        :args="[room.dimensions.width, room.dimensions.height, room.dimensions.depth]"
      />
    </TresMesh>
  </TresGroup>
</template>

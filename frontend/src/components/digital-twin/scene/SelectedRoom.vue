<script setup lang="ts">
import { computed, onBeforeUnmount, shallowRef, watch } from 'vue'
import { useTresContext } from '@tresjs/core'
import type { Mesh } from 'three'
import type { Room } from '@/types/digital-twin/building.ts'
import { SHELL_COLOR, roomShell } from '@/utils/digital-twin/colors.ts'
import { createShellMaterial } from '@/composables/digital-twin/useShellMaterial.ts'
import { useTheme } from '@/composables/commons/useTheme.ts'

const props = defineProps<{ room: Room; color?: string }>()

defineEmits<{ select: [roomId: string] }>()

const { renderer } = useTresContext()
const { theme } = useTheme()
const mesh = shallowRef<Mesh | null>(null)
const material = computed(() => createShellMaterial(roomShell(true), theme.value === 'dark'))

watch(
  [mesh, material, () => props.color],
  ([target, next], [, previous]) => {
    if (previous && previous !== next) previous.dispose()
    next.color.set(props.color ?? SHELL_COLOR[theme.value])
    if (!target) return
    target.material = next
    renderer.invalidate()
  },
  { immediate: true, flush: 'post' },
)

// Each new selection remounts this mesh; a shader left behind leaks GPU memory.
onBeforeUnmount(() => material.value.dispose())
</script>

<template>
  <TresGroup :position="[room.position.x, room.position.y, room.position.z]">
    <TresMesh ref="mesh" @click="$emit('select', room.id)">
      <TresBoxGeometry
        :args="[room.dimensions.width, room.dimensions.height, room.dimensions.depth]"
      />
    </TresMesh>
  </TresGroup>
</template>

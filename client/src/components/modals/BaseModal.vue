<script setup lang="ts">
defineProps<{
  isOpen: boolean
}>()

defineEmits<{
  (e: 'close'): void
}>()
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-from-class="opacity-0 scale-95"
      enter-to-class="opacity-100 scale-100"
      leave-from-class="opacity-100 scale-100"
      leave-to-class="opacity-0 scale-95"
    >
      <div
        v-if="isOpen"
        class="fixed inset-0 z-[100] flex items-center justify-center p-4 font-sans"
      >
        <div
          class="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
          @click="$emit('close')"
        ></div>

        <div
          class="relative w-full max-w-sm bg-slate-50 rounded-2xl shadow-2xl p-8 transform transition-all border border-slate-200 overflow-hidden"
          @click.stop
        >
          <div
            class="absolute inset-0 z-0 opacity-50 bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:14px_24px] pointer-events-none"
          ></div>

          <div class="absolute top-4 right-4 z-10">
            <button
              @click="$emit('close')"
              class="text-slate-400 hover:text-slate-600 transition-colors p-1 rounded-md hover:bg-slate-200/50"
            >
              <i class="ph-bold ph-x text-lg"></i>
            </button>
          </div>

          <slot />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
const isOpen = defineModel<boolean>({ default: false })
</script>

<template>
  <div class="relative min-w-[200px]">
    <slot name="trigger" :toggle="() => (isOpen = !isOpen)" :is-open="isOpen" />

    <Transition
      enter-active-class="transition duration-100 ease-out"
      enter-from-class="transform scale-95 opacity-0"
      enter-to-class="transform scale-100 opacity-100"
      leave-active-class="transition duration-75 ease-in"
      leave-from-class="transform scale-100 opacity-100"
      leave-to-class="transform scale-95 opacity-0"
    >
      <div
        v-if="isOpen"
        class="absolute z-50 w-full mt-2 bg-white border border-slate-100 rounded-xl shadow-xl overflow-hidden origin-top-right"
      >
        <slot />
      </div>
    </Transition>

    <div v-if="isOpen" class="fixed inset-0 z-40 bg-transparent" @click="isOpen = false" />
  </div>
</template>

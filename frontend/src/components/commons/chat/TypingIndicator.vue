<template>
  <div
    class="inline-flex items-center gap-1 rounded-2xl rounded-bl-md bg-surface-container-lowest px-3.5 py-3 shadow-soft"
    aria-hidden="true"
  >
    <span
      v-for="delay in [0, 120, 240]"
      :key="delay"
      class="size-1.5 animate-bounce rounded-full bg-outline"
      :style="{ animationDelay: `${delay}ms` }"
    />
  </div>
</template>

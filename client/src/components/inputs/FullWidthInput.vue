<script setup lang="ts">
defineProps<{
  modelValue: string
  placeholder?: string
}>()

defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()
</script>

<template>
  <input
    type="text"
    :value="modelValue"
    :placeholder="placeholder"
    class="flex-1 w-full bg-transparent border-b-2 border-slate-200 focus:border-emerald-500 outline-none py-1.5 text-slate-800 font-semibold text-sm placeholder:text-slate-400 transition-colors"
    @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
  />
</template>

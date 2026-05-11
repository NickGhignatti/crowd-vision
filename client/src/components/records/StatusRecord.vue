<script setup lang="ts">
defineProps<{
  colspan: number
  pulse?: boolean
}>()
</script>

<template>
  <tr>
    <td
      :colspan="colspan"
      class="p-8 text-center text-slate-500"
      :class="{ 'animate-pulse': pulse }"
    >
      <slot />
    </td>
  </tr>
</template>

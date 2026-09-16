import { computed, onMounted, ref } from 'vue'
import { useBuildingsStore } from '@/stores/buildings.ts'
import { useDomainsStore } from '@/stores/domain.ts'
import { roomsToRows } from '@/utils/dashboard.ts'

/** The buildings the dashboard can show, the chosen one, and its rooms as table rows. */
export function useDashboardBuildings() {
  const domainsStore = useDomainsStore()
  const buildingsStore = useBuildingsStore()

  const selectedId = ref<string>()
  const isLoading = ref(true)

  const options = computed(() =>
    buildingsStore.all.map((building) => ({
      value: building.id,
      label: building.name?.trim() || building.id,
    })),
  )

  const rooms = computed(() => {
    const building = selectedId.value ? buildingsStore.getById(selectedId.value) : undefined
    return roomsToRows(building?.rooms ?? [])
  })

  onMounted(async () => {
    try {
      await domainsStore.fetchMemberships()
      await buildingsStore.fetch(domainsStore.memberships ?? [])
      selectedId.value ??= options.value[0]?.value
    } catch (error) {
      console.error('Error loading dashboard buildings:', error)
    } finally {
      isLoading.value = false
    }
  })

  return { options, selectedId, rooms, isLoading }
}

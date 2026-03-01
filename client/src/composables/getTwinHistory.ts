import { ref, watchEffect } from 'vue'

export interface ApiDataPoint {
  timestamp: string
  avg: number
  max: number
  min: number
  sum: number
}

export function getTwinHistory(twinId: any, range: any, apiType: 'peopleCount' | 'temperature') {
    const data = ref<ApiDataPoint[]>([])
    const isLoading = ref(false)
    const labels = ref<string[]>([])
    const error = ref(null)
    const serverUrl = import.meta.env.VITE_SERVER_URL

    watchEffect(async () => {
        if (!twinId.value) return
        
        isLoading.value = true
        data.value = []
        error.value = null

        try {
            const response = await fetch(
                `${serverUrl}/sensor/${apiType}/dashboard/entireTwin/?twin=${twinId.value}&timeRange=${range.value}`
            )
            
            if (!response.ok) throw new Error('Fetch failed')
            
            const result = await response.json()
            console.log('API get twin history Result:', result)

            const dataArray = result.temperature || result.peopleCount || []; 

            labels.value = dataArray.map((d: ApiDataPoint) => {
                const date = new Date(d.timestamp);
                return range.value === '1D' 
                    ? date.getHours() + ':00'       // "10:00"
                    : date.toLocaleDateString();    // "2/8/2026"
            });
            
            data.value = result[apiType] || []
        } catch (err: any) {
            error.value = err.message
            // Fallback to empty or mock on error if strictly needed
            console.error(err)
        } finally {
            isLoading.value = false
        }
    })

    return { data, isLoading, labels, error }
}

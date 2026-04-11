import { ref, watchEffect, toValue } from 'vue'

export function useIsRunning(buildingIdSource: any) {
    const isSimRunning = ref(false)
    const error = ref(null)
    const serverUrl = import.meta.env.VITE_SERVER_URL

    const refetch = async () => {
        const id = toValue(buildingIdSource) 
        if (!id) return

        try {
            const response = await fetch(`${serverUrl}/simulator/control/status/?buildingId=${id}`)
            if (!response.ok) throw new Error('Fetch failed')
            
            const result = await response.json()
            isSimRunning.value = result.isRunning
            error.value = null 
        } catch (err: any) {
            error.value = err.message
            console.error(err)
        }
    }

    // Auto-runs when buildingIdSource changes
    watchEffect(() => {
        refetch()
    })

    return { isSimRunning, error, refetch }
}

export async function toggleSimulator(buildingId: string, action: 'start' | 'stop', rooms?: string[]) {
    const serverUrl = import.meta.env.VITE_SERVER_URL

    if (action == 'start') {
        startSimulator(buildingId, serverUrl, rooms)
    } else {
        stopSimulator(buildingId, serverUrl)
    } 
}

const startSimulator = async (buildingId: string, serverUrl: string, rooms?: string[]) => {
    try {
        const response = await fetch(`${serverUrl}/simulator/control/start/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                buildingId: buildingId,
                roomIds: rooms || [],
            }),
        });
        if (!response.ok) throw new Error('Fetch failed')
        
        const result = await response.json()
    } catch (err: any) {
        console.error(err)
    }
}

const stopSimulator = async (buildingId: string, serverUrl: string) => {
    try {
        const response = await fetch(`${serverUrl}/simulator/control/stop/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                buildingId: buildingId,
            }),
        });
        if (!response.ok) throw new Error('Fetch failed')
        
        const result = await response.json()
    } catch (err: any) {
        console.error(err)
    }
}
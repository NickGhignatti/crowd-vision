import { ref, watchEffect, toValue } from 'vue'

export function useIsRunning(twinIdSource: any) {
    const isSimRunning = ref(false)
    const error = ref(null)
    const serverUrl = import.meta.env.VITE_SERVER_URL

    const refetch = async () => {
        const id = toValue(twinIdSource) 
        if (!id) return

        try {
            const response = await fetch(`${serverUrl}/simulator/control/status/?twinId=${id}`)
            if (!response.ok) throw new Error('Fetch failed')
            
            const result = await response.json()
            isSimRunning.value = result.isRunning
            error.value = null 
        } catch (err: any) {
            error.value = err.message
            console.error(err)
        }
    }

    // Auto-runs when twinIdSource changes
    watchEffect(() => {
        refetch()
    })

    return { isSimRunning, error, refetch }
}

export async function toggleSimulator(twinId: string, action: 'start' | 'stop', rooms?: string[]) {
    const serverUrl = import.meta.env.VITE_SERVER_URL

    if (action == 'start') {
        startSimulator(twinId, serverUrl, rooms)
    } else {
        stopSimulator(twinId, serverUrl)
    } 
}

const startSimulator = async (twinId: string, serverUrl: string, rooms?: string[]) => {
    try {
        console.log('Starting simulator for twin:', twinId)
        const response = await fetch(`${serverUrl}/simulator/control/start/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                twinId: twinId,
                roomIds: rooms || [],
            }),
        });
        if (!response.ok) throw new Error('Fetch failed')
        
        const result = await response.json()
        console.log('API start simulator Result:', result)       
    } catch (err: any) {
        console.error(err)
    }
}

const stopSimulator = async (twinId: string, serverUrl: string) => {
    try {
        console.log('Stopping simulator for twin:', twinId)
        const response = await fetch(`${serverUrl}/simulator/control/stop/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                twinId: twinId,
            }),
        });
        if (!response.ok) throw new Error('Fetch failed')
        
        const result = await response.json()
        console.log('API stop simulator Result:', result)       
    } catch (err: any) {
        console.error(err)
    }
}
import { useState, useEffect, useCallback, useRef } from 'react'

export function usePorts(onAutoDetect) {
  const [ports, setPorts] = useState([])
  const [loading, setLoading] = useState(false)
  const hasAutoSelected = useRef(false)

  const refreshPorts = useCallback(async () => {
    setLoading(true)
    try {
      const result = await window.api.getPorts()
      setPorts(result)

      // Auto-select first ESP32 port if we haven't yet
      if (!hasAutoSelected.current && onAutoDetect) {
        const esp32 = result.find((p) => p.isEsp32)
        if (esp32) {
          hasAutoSelected.current = true
          onAutoDetect(esp32.path)
        }
      }
    } catch (err) {
      console.error('Failed to list ports:', err)
    }
    setLoading(false)
  }, [onAutoDetect])

  useEffect(() => {
    refreshPorts()
    const interval = setInterval(refreshPorts, 3000)
    return () => clearInterval(interval)
  }, [refreshPorts])

  return { ports, refreshPorts, loading }
}

import { useState, useEffect, useCallback } from 'react'

export function useFlash() {
  const [output, setOutput] = useState([])
  const [phase, setPhase] = useState('idle')
  const [percent, setPercent] = useState(0)
  const [isRunning, setIsRunning] = useState(false)
  const [result, setResult] = useState(null)

  useEffect(() => {
    const unsubOutput = window.api.onFlashOutput(({ line }) => {
      setOutput((prev) => [...prev, line])
    })
    const unsubProgress = window.api.onFlashProgress(({ phase: p, percent: pct }) => {
      if (p) setPhase(p)
      if (typeof pct === 'number') setPercent(pct)
    })
    return () => {
      unsubOutput()
      unsubProgress()
    }
  }, [])

  const startFlash = useCallback(async (config) => {
    setOutput([])
    setResult(null)
    setPercent(0)
    setPhase('flashing')
    setIsRunning(true)
    try {
      const res = await window.api.flashDevice(config)
      setResult(res)
      return res
    } catch (err) {
      setPhase('error')
      setResult({ success: false, error: err.message })
      return { success: false, error: err.message }
    } finally {
      setIsRunning(false)
    }
  }, [])

  return { startFlash, output, phase, percent, isRunning, result }
}

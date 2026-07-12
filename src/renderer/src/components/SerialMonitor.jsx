import React, { useState, useEffect, useRef } from 'react'
import { usePorts } from '../hooks/usePorts'
import { t } from '../i18n/fr'

export default function SerialMonitor() {
  const [isOpen, setIsOpen] = useState(false)
  const [selectedPort, setSelectedPort] = useState('')
  const [lines, setLines] = useState([])
  const { ports, refreshPorts } = usePorts()
  const containerRef = useRef(null)

  useEffect(() => {
    const unsub = window.api.onSerialData(({ data }) => {
      setLines((prev) => [...prev, data])
    })
    return unsub
  }, [])

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [lines])

  const handleToggle = async () => {
    if (isOpen) {
      await window.api.serialClose()
      setIsOpen(false)
    } else {
      if (!selectedPort) return
      const result = await window.api.serialOpen(selectedPort)
      if (result.success) setIsOpen(true)
    }
  }

  return (
    <div className="tf-serial">
      <div className="tf-serial__controls">
        <select
          className="tf-select"
          value={selectedPort}
          onChange={(e) => setSelectedPort(e.target.value)}
          disabled={isOpen}
        >
          <option value="">{t.serial.select}</option>
          {ports.map((p) => (
            <option key={p.path} value={p.path}>
              {p.path} — {p.manufacturer}
            </option>
          ))}
        </select>
        <button className="tf-btn tf-btn--ghost tf-btn--sm" onClick={refreshPorts} disabled={isOpen}>
          &#8635;
        </button>
        <span className="tf-serial__baud">{t.serial.baud}</span>
        <button
          className={`tf-btn tf-btn--sm ${isOpen ? 'tf-btn--danger' : 'tf-btn--primary'}`}
          onClick={handleToggle}
        >
          {isOpen ? t.serial.disconnect : t.serial.connect}
        </button>
        <button className="tf-btn tf-btn--ghost tf-btn--sm" onClick={() => setLines([])}>
          {t.serial.clear}
        </button>
      </div>

      <div className="tf-terminal tf-terminal--full">
        <div className="tf-terminal__body" ref={containerRef}>
          {lines.length === 0 ? (
            <span className="tf-terminal__placeholder">{t.serial.placeholder}</span>
          ) : (
            lines.map((line, i) => (
              <div key={i} className="tf-terminal__line">
                {line}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

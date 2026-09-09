import React, { useRef, useEffect } from 'react'
import { t } from '../i18n/fr'

export default function TerminalOutput({ lines }) {
  const containerRef = useRef(null)

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [lines])

  return (
    <div className="tf-terminal">
      <div className="tf-terminal__header">{t.terminal.title}</div>
      <div className="tf-terminal__body" ref={containerRef}>
        {lines.length === 0 ? (
          <span className="tf-terminal__placeholder">
            {t.terminal.placeholder}
          </span>
        ) : (
          lines.map((line, i) => (
            <div key={i} className="tf-terminal__line">
              {line}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

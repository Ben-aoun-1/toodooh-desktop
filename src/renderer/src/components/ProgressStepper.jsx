import React from 'react'
import { t } from '../i18n/fr'

const STEPS = [
  { key: 'flashing', label: t.steps.flashing },
  { key: 'provisioning', label: t.steps.provisioning },
  { key: 'connecting', label: t.steps.connecting },
  { key: 'online', label: t.steps.online },
]

// Map backend phases to a step index.
const STEP_ORDER = {
  idle: -1,
  flashing: 0,
  provisioning: 1,
  connecting: 2,
  'wifi-only': 2,
  online: 3,
  error: -2,
}

export default function ProgressStepper({ phase, percent }) {
  const currentIndex = STEP_ORDER[phase] ?? -1

  return (
    <div className="tf-stepper">
      {STEPS.map((step, i) => {
        let status = 'pending'
        if (phase === 'error') status = 'error'
        else if (i < currentIndex) status = 'complete'
        else if (i === currentIndex) status = 'active'

        const showPct = step.key === 'flashing' && status === 'active' && typeof percent === 'number'

        return (
          <React.Fragment key={step.key}>
            <div className={`tf-stepper__step tf-stepper__step--${status}`}>
              <div className="tf-stepper__indicator">
                {status === 'complete' ? '✓' : i + 1}
              </div>
              <span className="tf-stepper__label">
                {step.label}
                {showPct ? ` ${percent}%` : ''}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`tf-stepper__connector ${i < currentIndex ? 'tf-stepper__connector--done' : ''}`} />
            )}
          </React.Fragment>
        )
      })}
    </div>
  )
}

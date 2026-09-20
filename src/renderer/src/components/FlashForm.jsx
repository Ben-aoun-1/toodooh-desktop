import React, { useState, useCallback } from 'react'
import TerminalOutput from './TerminalOutput'
import ProgressStepper from './ProgressStepper'
import { usePorts } from '../hooks/usePorts'
import { useFlash } from '../hooks/useFlash'
import { t } from '../i18n/fr'

const DEFAULTS = { ssid: '', pass: '', agent: '', comPort: '', openNetwork: false }

export default function FlashForm({ firmware }) {
  const [config, setConfig] = useState(DEFAULTS)
  const onAutoDetect = useCallback((portPath) => {
    setConfig((prev) => (prev.comPort ? prev : { ...prev, comPort: portPath }))
  }, [])
  const { ports, refreshPorts, loading: portsLoading } = usePorts(onAutoDetect)
  const { startFlash, output, phase, percent, isRunning, result } = useFlash()
  const noBoard = !portsLoading && !ports.some((p) => p.isEsp32)

  const handleChange = (field) => (e) => {
    const value = e.target.value
    setConfig((prev) => ({ ...prev, [field]: value }))
  }

  // Open network = an EMPTY password on the wire. It is an explicit checkbox and
  // not just a blank field, so a forgotten password can't silently be sent as one.
  const toggleOpenNetwork = (e) => {
    const openNetwork = e.target.checked
    setConfig((prev) => ({ ...prev, openNetwork, pass: openNetwork ? '' : prev.pass }))
  }

  const handleFlash = async () => {
    if (!config.ssid.trim()) return alert(t.alerts.needSsid)
    if (!config.openNetwork && !config.pass) return alert(t.alerts.needPass)
    if (!config.agent.trim()) return alert(t.alerts.needAgent)
    if (!config.comPort) return alert(t.alerts.needPort)
    await startFlash({
      comPort: config.comPort,
      ssid: config.ssid,
      pass: config.openNetwork ? '' : config.pass,
      agent: config.agent.trim(),
    })
  }

  const firmwareMissing = firmware && firmware.ok === false

  return (
    <div className="tf-flash-layout">
      <div className="tf-flash-form">
        <div className="tf-card">
          <h2 className="tf-card__title">{t.form.title}</h2>

          <div className="tf-field">
            <label className="tf-label">{t.form.ssid}</label>
            <input
              className="tf-input"
              value={config.ssid}
              onChange={handleChange('ssid')}
              placeholder={t.form.ssidPlaceholder}
            />
            <span className="tf-hint">{t.form.ssidHint}</span>
          </div>

          <div className="tf-field">
            <label className="tf-label">{t.form.pass}</label>
            <input
              className="tf-input"
              type="password"
              value={config.openNetwork ? '' : config.pass}
              onChange={handleChange('pass')}
              placeholder={config.openNetwork ? t.form.passPlaceholderOpen : t.form.passPlaceholder}
              disabled={config.openNetwork}
            />
            <label className="tf-check">
              <input
                type="checkbox"
                checked={config.openNetwork}
                onChange={toggleOpenNetwork}
              />
              <span>{t.form.openNetwork}</span>
            </label>
            <span className="tf-hint">{t.form.openNetworkHint}</span>
          </div>

          <div className="tf-field">
            <label className="tf-label">{t.form.agent}</label>
            <input
              className="tf-input"
              value={config.agent}
              onChange={handleChange('agent')}
              placeholder={t.form.agentPlaceholder}
            />
            <span className="tf-hint">{t.form.agentHint}</span>
          </div>

          <div className="tf-field">
            <label className="tf-label">{t.form.port}</label>
            <div className="tf-port-row">
              <select className="tf-select" value={config.comPort} onChange={handleChange('comPort')}>
                <option value="">{t.form.portSelect}</option>
                {ports.map((p) => (
                  <option key={p.path} value={p.path}>
                    {p.path} {p.isEsp32 ? `— ESP32 (${p.chipName})` : `— ${p.manufacturer}`}
                  </option>
                ))}
              </select>
              <button
                className="tf-btn tf-btn--ghost tf-btn--sm"
                onClick={refreshPorts}
                disabled={portsLoading}
                title={t.form.portRefresh}
              >
                &#8635;
              </button>
            </div>
            {noBoard && <span className="tf-hint tf-hint--warn">{t.form.noBoardHint}</span>}
          </div>

          <button
            className="tf-btn tf-btn--primary tf-btn--full"
            onClick={handleFlash}
            disabled={isRunning || firmwareMissing}
          >
            {isRunning ? t.form.flashing : t.form.flash}
          </button>

          {firmwareMissing && (
            <div className="tf-alert tf-alert--warning">
              <span>{t.statusbar.firmwareMissing}</span>
            </div>
          )}

          {result && <ResultBanner result={result} />}
        </div>
      </div>

      <div className="tf-flash-output">
        <ProgressStepper phase={phase} percent={percent} />
        <TerminalOutput lines={output} />
      </div>
    </div>
  )
}

function ResultBanner({ result }) {
  if (result.success && result.online !== false) {
    return (
      <div className="tf-alert tf-alert--ok">
        <strong>{t.result.onlineTitle}</strong>
        <span>{t.result.onlineBody}</span>
      </div>
    )
  }
  if (result.success) {
    return (
      <div className="tf-alert tf-alert--warning">
        <strong>{t.result.wifiOnlyTitle}</strong>
        <span>{t.result.wifiOnlyBody}</span>
      </div>
    )
  }
  const msg =
    result.error === 'wifi-auth' ? t.status.wifiAuth :
    result.error === 'wifi-no-ip' ? t.status.wifiNoIp :
    result.error === 'not-saved' ? t.status.notSaved :
    result.error === 'no-connect' ? t.status.noConnect :
    result.error
  return (
    <div className="tf-alert tf-alert--error">
      <strong>{t.result.errorTitle}</strong>
      <span>{msg}</span>
    </div>
  )
}

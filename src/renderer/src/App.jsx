import React, { useState, useEffect } from 'react'
import FlashForm from './components/FlashForm'
import SerialMonitor from './components/SerialMonitor'
import StatusBar from './components/StatusBar'
import { t } from './i18n/fr'

export default function App() {
  const [activeTab, setActiveTab] = useState('flash')
  const [firmware, setFirmware] = useState({ loading: true })

  useEffect(() => {
    window.api.getFirmwareInfo().then((info) => setFirmware({ loading: false, ...info }))
  }, [])

  return (
    <div className="tf-app">
      <header className="tf-header">
        <div className="tf-header__logo">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <rect width="24" height="24" rx="6" fill="#57C98D" />
            <path d="M7 12L10.5 15.5L17 9" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <h1>{t.appName}</h1>
        </div>
        <nav className="tf-tabs">
          <button
            className={`tf-tabs__tab ${activeTab === 'flash' ? 'tf-tabs__tab--active' : ''}`}
            onClick={() => setActiveTab('flash')}
          >
            {t.tabs.flash}
          </button>
          <button
            className={`tf-tabs__tab ${activeTab === 'serial' ? 'tf-tabs__tab--active' : ''}`}
            onClick={() => setActiveTab('serial')}
          >
            {t.tabs.serial}
          </button>
        </nav>
      </header>

      <main className="tf-main">
        {activeTab === 'flash' && <FlashForm firmware={firmware} />}
        {activeTab === 'serial' && <SerialMonitor />}
      </main>

      <StatusBar firmware={firmware} />
    </div>
  )
}

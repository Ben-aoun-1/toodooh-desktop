import React from 'react'
import { t } from '../i18n/fr'

export default function StatusBar({ firmware }) {
  const loading = firmware?.loading
  const ok = firmware?.ok
  return (
    <footer className="tf-statusbar">
      <div
        className={`tf-statusbar__item ${
          loading ? '' : ok ? 'tf-statusbar__item--ok' : 'tf-statusbar__item--error'
        }`}
      >
        <span className="tf-statusbar__dot" />
        {loading
          ? t.statusbar.firmwareLoading
          : ok
            ? firmware.base
            : t.statusbar.firmwareMissing}
      </div>
      <div className="tf-statusbar__item">{t.statusbar.version}</div>
    </footer>
  )
}

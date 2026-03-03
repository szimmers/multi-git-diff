import { useState } from 'react'

/**
 * Modal for configuring external app integrations.
 * @param {object}   props
 * @param {object}   props.settings - { araxis: { label, installed, enabled }, ... }
 * @param {(enabled: object) => void} props.onSave
 * @param {()=>void} props.onClose
 */
export default function SettingsModal({ settings, onSave, onClose }) {
  const [enabled, setEnabled] = useState(() =>
    Object.fromEntries(Object.entries(settings).map(([k, v]) => [k, v.enabled]))
  )

  const handleSave = () => {
    onSave(enabled)
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal__header">
          <span className="modal__title modal__title--neutral">External Apps</span>
        </div>
        <div className="settings-list">
          {Object.entries(settings).map(([key, { label, installed }]) => (
            <div key={key} className="settings-row">
              <div className="settings-row__info">
                <span className="settings-row__label">{label}</span>
                <span className={`settings-row__status${installed ? ' settings-row__status--ok' : ''}`}>
                  {installed ? 'Installed' : 'Not installed'}
                </span>
              </div>
              <label className={`settings-row__toggle${!installed ? ' settings-row__toggle--disabled' : ''}`}>
                <input
                  type="checkbox"
                  checked={!!enabled[key] && installed}
                  disabled={!installed}
                  onChange={() => setEnabled(prev => ({ ...prev, [key]: !prev[key] }))}
                />
                Enable
              </label>
            </div>
          ))}
        </div>
        <div className="modal__footer">
          <button className="modal-btn modal-btn--copy" onClick={onClose}>Cancel</button>
          <button className="modal-btn modal-btn--close" onClick={handleSave}>Save</button>
        </div>
      </div>
    </div>
  )
}

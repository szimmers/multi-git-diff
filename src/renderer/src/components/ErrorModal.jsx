import { useState } from 'react'

/**
 * Modal dialog for git operation errors.
 * Stays open until the user dismisses it; includes a Copy button.
 * @param {object}   props
 * @param {string}   props.message  - error text to display
 * @param {()=>void} props.onClose
 */
export default function ErrorModal({ message, onClose }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(message)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal__header">
          <span className="modal__title">Git Error</span>
        </div>
        <pre className="modal__body">{message}</pre>
        <div className="modal__footer">
          <button className="modal-btn modal-btn--copy" onClick={handleCopy}>
            {copied ? 'Copied!' : 'Copy'}
          </button>
          <button className="modal-btn modal-btn--close" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}

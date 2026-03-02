/**
 * Commit message input, Commit button, and Push button.
 * @param {object} props
 * @param {string}   props.message
 * @param {(s:string)=>void} props.onMessageChange
 * @param {()=>void} props.onCommit
 * @param {()=>void} props.onPush
 * @param {boolean}  props.busy        - disables all controls while a git op is in flight
 * @param {number}   props.stagedCount - number of staged files; shown on Commit button
 * @param {number}   props.ahead       - unpushed commits; shown on Push button
 * @param {boolean}  props.hasRemote   - whether the branch has a tracking remote
 */
export default function CommitPanel({
  message, onMessageChange, onCommit, onPush,
  busy, stagedCount, ahead, hasRemote,
}) {
  const canCommit = message.trim().length > 0 && stagedCount > 0 && !busy
  const canPush   = hasRemote && ahead > 0 && !busy

  const handleKeyDown = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && canCommit) onCommit()
  }

  return (
    <div className="commit-panel">
      <textarea
        className="commit-message"
        placeholder="Commit message (⌘↵ to commit)"
        value={message}
        onChange={e => onMessageChange(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={busy}
        rows={3}
      />
      <div className="commit-actions">
        <button className="btn btn--commit" onClick={onCommit} disabled={!canCommit}>
          {busy ? 'Working…' : `Commit${stagedCount > 0 ? ` (${stagedCount})` : ''}`}
        </button>
        <button className="btn btn--push" onClick={onPush} disabled={!canPush}>
          {busy ? '…' : `Push${ahead > 0 ? ` ↑${ahead}` : ''}`}
        </button>
      </div>
    </div>
  )
}

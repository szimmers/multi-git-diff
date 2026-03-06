/**
 * Commit message input, Commit / Push / Pull / Merge-main / Stash buttons.
 * @param {object} props
 * @param {string}   props.message
 * @param {(s:string)=>void} props.onMessageChange
 * @param {()=>void} props.onCommit
 * @param {()=>void} props.onPush
 * @param {()=>void} props.onPull
 * @param {()=>void} props.onPullMain
 * @param {boolean}  props.busy        - disables all controls while a git op is in flight
 * @param {number}   props.stagedCount - number of staged files; shown on Commit button
 * @param {number}   props.ahead       - unpushed commits; shown on Push button
 * @param {number}   props.behind      - unpulled commits; shown on Pull button
 * @param {boolean}  props.hasRemote       - whether the branch has a tracking remote
 * @param {boolean}  props.noVerify        - pass --no-verify to git commit
 * @param {(v:boolean)=>void} props.onNoVerifyChange
 */
export default function CommitPanel({
  message, onMessageChange, onCommit, onPush, onPull, onPullMain,
  busy, stagedCount, ahead, behind, hasRemote, noVerify, onNoVerifyChange,
}) {
  const canCommit   = message.trim().length > 0 && stagedCount > 0 && !busy
  const canPush     = hasRemote && ahead > 0 && !busy
  const canPull     = hasRemote && !busy
  const canPullMain = hasRemote && !busy

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
        <label className="commit-no-verify">
          <input
            type="checkbox"
            checked={!!noVerify}
            onChange={e => onNoVerifyChange(e.target.checked)}
            disabled={busy}
          />
          --no-verify
        </label>
        <button className="btn btn--commit" onClick={onCommit} disabled={!canCommit}
          title="Commit staged files">
          {busy ? 'Working…' : `Commit${stagedCount > 0 ? ` (${stagedCount})` : ''}`}
        </button>
        <button className="btn btn--push" onClick={onPush} disabled={!canPush}
          title="Push this branch to origin">
          {busy ? '…' : `Push${ahead > 0 ? ` ↑${ahead}` : ''}`}
        </button>
        <button className="btn btn--pull" onClick={onPull} disabled={!canPull}
          title="Pull origin's version of this branch (git pull)">
          {busy ? '…' : `Pull${behind > 0 ? ` ↓${behind}` : ''}`}
        </button>
        <button className="btn btn--pull" onClick={onPullMain} disabled={!canPullMain}
          title="Merge the default branch (main/master) into this branch">
          {busy ? '…' : 'Merge main'}
        </button>
      </div>
    </div>
  )
}

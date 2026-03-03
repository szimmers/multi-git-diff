import { useMemo, useEffect, useRef, useState } from 'react'
import { html as toDiffHtml } from 'diff2html'
import hljs from 'highlight.js/lib/core'
import jsonLang from 'highlight.js/lib/languages/json'

hljs.registerLanguage('json', jsonLang)

function relativeDate(ts) {
  const s = Date.now() / 1000 - ts
  if (s < 60)          return 'just now'
  if (s < 3600)        return `${Math.floor(s / 60)}m ago`
  if (s < 86400)       return `${Math.floor(s / 3600)}h ago`
  if (s < 86400 * 30)  return `${Math.floor(s / 86400)}d ago`
  if (s < 86400 * 365) return `${Math.floor(s / (86400 * 30))}mo ago`
  return `${Math.floor(s / (86400 * 365))}yr ago`
}

function BlameView({ lines, onHashClick }) {
  if (!lines.length) {
    return (
      <div className="diff-viewer diff-viewer--empty">
        <span className="diff-placeholder">Loading blame…</span>
      </div>
    )
  }
  return (
    <div className="blame-view">
      {lines.map(line => (
        <div key={line.lineNum} className="blame-row" data-hash={line.hash}>
          <span className="blame-hash" title={line.summary} onClick={() => onHashClick(line.hash, line.summary)}>{line.hash}</span>
          <span className="blame-author" title={line.author}>{line.author.slice(0, 16)}</span>
          <span className="blame-date">{relativeDate(line.time)}</span>
          <span className="blame-linenum">{line.lineNum}</span>
          <span className="blame-content">{line.content}</span>
        </div>
      ))}
    </div>
  )
}

/**
 * Renders either a diff2html diff, a git blame view, or a full commit diff.
 * JSON files get additional syntax highlighting via highlight.js.
 * @param {object}   props
 * @param {string}   props.diff
 * @param {object|null} props.selectedFile
 * @param {{ label: string, onClick: ()=>void }[]} props.externalButtons
 * @param {boolean}  props.blameOn
 * @param {object[]} props.blameData        - parsed blame lines from parseBlame()
 * @param {()=>void} props.onToggleBlame
 * @param {(hash:string, summary:string)=>void} props.onBlameHashClick
 * @param {{hash:string, summary:string}|null} props.commitView
 * @param {string}   props.commitDiff       - raw git show output
 * @param {()=>void} props.onClearCommitView
 */
export default function DiffViewer({
  diff, selectedFile, externalButtons = [],
  blameOn, blameData, onToggleBlame, onBlameHashClick,
  commitView, commitDiff, onClearCommitView,
  stashView, stashDiff, onClearStashView, onStashPop, busy,
}) {
  const diffRef       = useRef(null)
  const commitDiffRef = useRef(null)

  const diffHtml = useMemo(() => {
    if (!diff) return ''
    return toDiffHtml(diff, { drawFileList: false, matching: 'lines', outputFormat: 'line-by-line' })
  }, [diff])

  const commitDiffHtml = useMemo(() => {
    if (!commitDiff) return ''
    return toDiffHtml(commitDiff, { drawFileList: false, matching: 'lines', outputFormat: 'line-by-line' })
  }, [commitDiff])

  const stashDiffHtml = useMemo(() => {
    if (!stashDiff) return ''
    return toDiffHtml(stashDiff, { drawFileList: false, matching: 'lines', outputFormat: 'line-by-line' })
  }, [stashDiff])

  // JSON syntax highlighting for file diffs
  useEffect(() => {
    if (!diffRef.current || !selectedFile) return
    const ext = selectedFile.path.split('.').pop()?.toLowerCase()
    if (ext !== 'json') return
    diffRef.current.querySelectorAll('.d2h-code-line-ctn').forEach(el => {
      hljs.highlightElement(el)
    })
  }, [diffHtml, selectedFile])

  const [hashCopied, setHashCopied] = useState(false)

  const copyHash = () => {
    navigator.clipboard.writeText(commitView?.hash ?? '')
    setHashCopied(true)
    setTimeout(() => setHashCopied(false), 1500)
  }

  // Stash view
  if (stashView) {
    return (
      <div className="diff-viewer">
        <div className="diff-header">
          <button className="back-btn" onClick={onClearStashView} title="Back">← Back</button>
          <span className="diff-filename">{stashView.ref}</span>
          <span className="commit-summary">{stashView.message}</span>
          <button
            className="btn btn--stash-pop"
            onClick={() => onStashPop(stashView.ref)}
            disabled={busy}
            title="Apply and remove this stash (git stash pop)"
          >
            Pop
          </button>
        </div>
        {stashDiffHtml
          ? <div className="diff-content diff-content--commit" dangerouslySetInnerHTML={{ __html: stashDiffHtml }} />
          : <div className="diff-viewer diff-viewer--empty"><span className="diff-placeholder">Empty stash</span></div>
        }
      </div>
    )
  }

  // Commit view
  if (commitView) {
    return (
      <div className="diff-viewer">
        <div className="diff-header">
          <button className="back-btn" onClick={onClearCommitView} title="Back to file diff">← Back</button>
          <span
            className={`diff-filename commit-hash-btn${hashCopied ? ' commit-hash-btn--copied' : ''}`}
            onClick={copyHash}
            title="Click to copy hash"
          >
            {hashCopied ? 'Copied!' : commitView.hash}
          </span>
          <span className="commit-summary">{commitView.summary}</span>
        </div>
        {commitDiffHtml
          ? <div ref={commitDiffRef} className="diff-content diff-content--commit" dangerouslySetInnerHTML={{ __html: commitDiffHtml }} />
          : <div className="diff-viewer diff-viewer--empty"><span className="diff-placeholder">No diff available</span></div>
        }
      </div>
    )
  }

  if (!selectedFile) {
    return (
      <div className="diff-viewer diff-viewer--empty">
        <span className="diff-placeholder">Select a file to view diff</span>
      </div>
    )
  }

  const canBlame = selectedFile.status !== '?'

  return (
    <div className="diff-viewer">
      <div className="diff-header">
        <span className="diff-filename" title={selectedFile.path}>{selectedFile.path}</span>
        <span className="diff-badge">{selectedFile.isStaged ? 'STAGED' : 'UNSTAGED'}</span>
        {canBlame && (
          <button
            className={`blame-btn${blameOn ? ' blame-btn--active' : ''}`}
            onClick={onToggleBlame}
            title="Toggle git blame"
          >
            Blame
          </button>
        )}
        {externalButtons.map(btn => (
          <button key={btn.label} className="araxis-btn" onClick={btn.onClick}>{btn.label}</button>
        ))}
      </div>

      {blameOn
        ? <BlameView lines={blameData} onHashClick={onBlameHashClick} />
        : diffHtml
          ? <div ref={diffRef} className="diff-content" dangerouslySetInnerHTML={{ __html: diffHtml }} />
          : <div className="diff-viewer diff-viewer--empty"><span className="diff-placeholder">No diff available</span></div>
      }
    </div>
  )
}

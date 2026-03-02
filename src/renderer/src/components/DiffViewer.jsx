import { useMemo, useEffect, useRef } from 'react'
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
 * Renders either a diff2html diff or a git blame view for the selected file.
 * JSON files get additional syntax highlighting via highlight.js.
 * @param {object}   props
 * @param {string}   props.diff
 * @param {object|null} props.selectedFile
 * @param {()=>void} props.onOpenAraxis
 * @param {boolean}  props.blameOn
 * @param {object[]} props.blameData   - parsed blame lines from parseBlame()
 * @param {()=>void} props.onToggleBlame
 * @param {(hash:string, summary:string)=>void} props.onBlameHashClick
 */
export default function DiffViewer({ diff, selectedFile, onOpenAraxis, blameOn, blameData, onToggleBlame, onBlameHashClick }) {
  const diffRef = useRef(null)

  const diffHtml = useMemo(() => {
    if (!diff) return ''
    return toDiffHtml(diff, { drawFileList: false, matching: 'lines', outputFormat: 'line-by-line' })
  }, [diff])

  useEffect(() => {
    if (!diffRef.current || !selectedFile) return
    const ext = selectedFile.path.split('.').pop()?.toLowerCase()
    if (ext !== 'json') return
    diffRef.current.querySelectorAll('.d2h-code-line-ctn').forEach(el => {
      hljs.highlightElement(el)
    })
  }, [diffHtml, selectedFile])

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
        <button className="araxis-btn" onClick={onOpenAraxis}>Open in Araxis ↗</button>
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

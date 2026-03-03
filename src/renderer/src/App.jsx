import { useState, useEffect, useCallback, useRef } from 'react'
import Sidebar from './components/Sidebar'
import FileList from './components/FileList'
import DiffViewer from './components/DiffViewer'
import CommitPanel from './components/CommitPanel'
import ErrorModal from './components/ErrorModal'

// ─── Blame parser ─────────────────────────────────────────────────────────────

/**
 * Parses `git blame --porcelain` output into per-line objects.
 * @param {string} raw - porcelain blame output
 * @returns {{ lineNum: number, hash: string, author: string, time: number, summary: string, content: string }[]}
 */
function parseBlame(raw) {
  const lines = []
  const meta  = {}
  const parts = raw.split('\n')
  let i = 0
  while (i < parts.length) {
    const line = parts[i]
    if (!/^[0-9a-f]{40} /.test(line)) { i++; continue }
    const hash      = line.slice(0, 40)
    const finalLine = parseInt(line.split(' ')[2])
    i++
    if (!meta[hash]) meta[hash] = { author: '?', time: 0, summary: '' }
    while (i < parts.length && !parts[i].startsWith('\t')) {
      const m = parts[i]
      if (m.startsWith('author '))      meta[hash].author  = m.slice(7)
      if (m.startsWith('author-time ')) meta[hash].time    = parseInt(m.slice(12))
      if (m.startsWith('summary '))     meta[hash].summary = m.slice(8)
      i++
    }
    const content = parts[i]?.startsWith('\t') ? parts[i].slice(1) : ''
    i++
    lines.push({ lineNum: finalLine, hash: hash.slice(0, 8), ...meta[hash], content })
  }
  return lines.sort((a, b) => a.lineNum - b.lineNum)
}

// ─── Resize divider ───────────────────────────────────────────────────────────

function ResizeDivider({ onResizeStart }) {
  return (
    <div
      className="resize-divider"
      onMouseDown={e => { e.preventDefault(); onResizeStart(e.clientX) }}
    />
  )
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [repos, setRepos]               = useState([])
  const [activeRepo, setActiveRepo]     = useState(null)
  const [repoBranches, setRepoBranches] = useState({})
  const [status, setStatus]             = useState({ staged: [], unstaged: [], branch: '', ahead: 0, behind: 0 })
  const [selectedFile, setSelectedFile] = useState(null)
  const [diff, setDiff]                 = useState('')
  const [blameOn, setBlameOn]           = useState(false)
  const [blameData, setBlameData]       = useState([])
  const [commitView, setCommitView]     = useState(null)  // { hash, summary }
  const [commitDiff, setCommitDiff]     = useState('')
  const [commitMessage, setCommitMessage] = useState('')
  const [busy, setBusy]                 = useState(false)
  const [toast, setToast]               = useState(null)
  const [errorModal, setErrorModal]     = useState(null)  // string | null
  const [sidebarWidth, setSidebarWidth] = useState(200)
  const [filelistWidth, setFilelistWidth] = useState(290)
  const [isResizing, setIsResizing]     = useState(false)
  const toastTimer = useRef(null)

  const showToast = useCallback((type, message) => {
    setToast({ type, message })
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 3000)
  }, [])

  /**
   * Fetches and applies the latest git status for a repo.
   * Also clears selectedFile if it no longer appears in staged or unstaged.
   * @param {{ path: string }} repo
   * @returns {Promise<object|null>} The new status object, or null if no repo.
   */
  const refreshStatus = useCallback(async (repo) => {
    if (!repo) return null
    const s = await window.api.getStatus(repo.path)
    setStatus(s)
    setRepoBranches(prev => ({
      ...prev,
      [repo.path]: { branch: s.branch, ahead: s.ahead, behind: s.behind },
    }))
    setSelectedFile(prev => {
      if (!prev) return null
      const stillStaged   = s.staged?.some(f => f.path === prev.path)
      const stillUnstaged = s.unstaged?.some(f => f.path === prev.path)
      return (stillStaged || stillUnstaged) ? prev : null
    })
    return s
  }, [])

  // Load workspaces + seed branch info for all repos
  useEffect(() => {
    window.api.getWorkspaces().then(async r => {
      setRepos(r)
      if (r.length) setActiveRepo(r[0])
      const branches = {}
      await Promise.all(r.map(async repo => {
        const s = await window.api.getStatus(repo.path)
        branches[repo.path] = { branch: s.branch || '—', ahead: s.ahead || 0, behind: s.behind || 0 }
      }))
      setRepoBranches(branches)
    })
  }, [])

  // ⌘1–4 / ⌘R
  useEffect(() => {
    const handler = (e) => {
      if (e.metaKey && /^[1-9]$/.test(e.key)) {
        const repo = repos[parseInt(e.key) - 1]
        if (repo) setActiveRepo(repo)
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'r') {
        e.preventDefault()
        if (activeRepo) refreshStatus(activeRepo)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [repos, activeRepo, refreshStatus])

  // Status + watcher when active repo changes
  useEffect(() => {
    if (!activeRepo) return
    setSelectedFile(null)
    setDiff('')
    setBlameData([])
    refreshStatus(activeRepo)
    window.api.watch(activeRepo.path)
    const off = window.api.onChanged(repoPath => {
      if (repoPath === activeRepo.path) refreshStatus(activeRepo)
    })
    return () => { window.api.unwatch(activeRepo.path); off() }
  }, [activeRepo, refreshStatus])

  // Diff
  useEffect(() => {
    if (!selectedFile || !activeRepo) { setDiff(''); return }
    window.api
      .getDiff(activeRepo.path, selectedFile.path, selectedFile.isStaged, selectedFile.status === '?')
      .then(setDiff)
  }, [selectedFile, activeRepo])

  // Blame
  useEffect(() => {
    if (!blameOn || !selectedFile || !activeRepo || selectedFile.status === '?') {
      setBlameData([])
      return
    }
    window.api.getBlame(activeRepo.path, selectedFile.path).then(result => {
      if (result?.ok) setBlameData(parseBlame(result.raw))
    })
  }, [blameOn, selectedFile, activeRepo])

  // ─── Column resize ───────────────────────────────────────────────────────────

  /**
   * Factory that returns an onResizeStart(startX) mouse handler for a resizable column.
   * currentWidth is captured at call time to avoid stale closure issues.
   * @param {number} currentWidth - width at the moment the divider is grabbed
   * @param {(w: number) => void} setWidth
   * @param {number} min - minimum allowed width in px
   * @param {number} max - maximum allowed width in px
   * @returns {(startX: number) => void}
   */
  const makeResizeStart = (currentWidth, setWidth, min, max) => (startX) => {
    const startW = currentWidth
    setIsResizing(true)
    const move = e => setWidth(Math.max(min, Math.min(max, startW + (e.clientX - startX))))
    const up   = () => { setIsResizing(false); window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up) }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  const handleSelectFile = useCallback((file) => {
    setCommitView(null)
    setCommitDiff('')
    setSelectedFile(file)
  }, [])

  // ─── Workspace handlers ──────────────────────────────────────────────────────
  const handleAddWorkspace = useCallback(async () => {
    const updated = await window.api.addWorkspace()
    if (!updated) return
    setRepos(updated)
  }, [])

  const handleRemoveWorkspace = useCallback(async (path) => {
    const updated = await window.api.removeWorkspace(path)
    setRepos(updated)
    setActiveRepo(prev => prev?.path !== path ? prev : updated[0] ?? null)
  }, [])

  const handleReorderRepos = useCallback((fromIndex, toIndex) => {
    setRepos(prev => {
      const updated = [...prev]
      const [moved] = updated.splice(fromIndex, 1)
      updated.splice(toIndex, 0, moved)
      window.api.setWorkspaces(updated)
      return updated
    })
  }, [])

  // ─── Git action handlers ─────────────────────────────────────────────────────
  const handleFileMenu = useCallback(async (filePath, status) => {
    const result = await window.api.showFileMenu(activeRepo.path, filePath, status)
    if (result === 'gitignore') {
      showToast('success', 'Added to .gitignore')
      await refreshStatus(activeRepo)
    } else if (result === 'delete') {
      showToast('success', 'File deleted')
      await refreshStatus(activeRepo)
    } else if (result === 'revert') {
      showToast('success', 'Changes reverted')
      await refreshStatus(activeRepo)
    } else if (result?.error) {
      showToast('error', result.error)
    }
  }, [activeRepo, showToast, refreshStatus])

  const handleStage = useCallback(async (filePath) => {
    const currentIndex = status.unstaged.findIndex(f => f.path === filePath)
    await window.api.stage(activeRepo.path, [filePath])
    const newStatus = await refreshStatus(activeRepo)
    const unstaged = newStatus?.unstaged ?? []
    if (unstaged.length > 0) {
      const nextIndex = Math.min(currentIndex, unstaged.length - 1)
      setSelectedFile({ ...unstaged[nextIndex], isStaged: false })
    } else {
      setSelectedFile(null)
    }
  }, [activeRepo, status.unstaged, refreshStatus])

  const handleUnstage = useCallback(async (filePath) => {
    await window.api.unstage(activeRepo.path, [filePath])
    await refreshStatus(activeRepo)
  }, [activeRepo, refreshStatus])

  const handleStageAll = useCallback(async () => {
    await window.api.stageAll(activeRepo.path)
    await refreshStatus(activeRepo)
  }, [activeRepo, refreshStatus])

  const handleUnstageAll = useCallback(async () => {
    await window.api.unstageAll(activeRepo.path)
    await refreshStatus(activeRepo)
  }, [activeRepo, refreshStatus])

  const handleCommit = useCallback(async () => {
    if (!commitMessage.trim()) { showToast('error', 'Commit message required'); return }
    if (!status.staged.length) { showToast('error', 'Nothing staged to commit'); return }
    setBusy(true)
    try {
      const result = await window.api.commit(activeRepo.path, commitMessage)
      if (result.ok) {
        setCommitMessage('')
        showToast('success', 'Committed')
        setCommitView(null)
        setCommitDiff('')
        await refreshStatus(activeRepo)
      } else {
        setErrorModal(result.error)
      }
    } finally { setBusy(false) }
  }, [activeRepo, commitMessage, status.staged.length, showToast, refreshStatus])

  const handlePush = useCallback(async () => {
    setBusy(true)
    try {
      const result = await window.api.push(activeRepo.path)
      if (result.ok) {
        showToast('success', 'Pushed to origin')
        setCommitView(null)
        setCommitDiff('')
        await refreshStatus(activeRepo)
      } else {
        setErrorModal(result.error)
      }
    } finally { setBusy(false) }
  }, [activeRepo, showToast, refreshStatus])

  const handlePull = useCallback(async () => {
    setBusy(true)
    try {
      const result = await window.api.pull(activeRepo.path)
      if (result.ok) {
        showToast('success', 'Pulled from origin')
        await refreshStatus(activeRepo)
      } else {
        setErrorModal(result.error)
      }
    } finally { setBusy(false) }
  }, [activeRepo, showToast, refreshStatus])

  const handlePullMain = useCallback(async () => {
    setBusy(true)
    try {
      const result = await window.api.pullMain(activeRepo.path)
      if (result.ok) {
        showToast('success', `Merged ${result.branch} into branch`)
        await refreshStatus(activeRepo)
      } else {
        setErrorModal(result.error)
      }
    } finally { setBusy(false) }
  }, [activeRepo, showToast, refreshStatus])

  const handleBlameHashClick = useCallback(async (hash, summary) => {
    const result = await window.api.gitShow(activeRepo.path, hash)
    if (!result?.ok) { showToast('error', result?.error || 'git show failed'); return }
    setCommitDiff(result.raw)
    setCommitView({ hash, summary, filePath: selectedFile?.path })
  }, [activeRepo, selectedFile, showToast])

  const handleOpenAraxis = useCallback(async () => {
    if (!selectedFile) return
    const result = await window.api.openAraxis(activeRepo.path, selectedFile.path, selectedFile.isStaged)
    if (result && !result.ok) showToast('error', result.error || 'Araxis launch failed')
  }, [activeRepo, selectedFile, showToast])

  return (
    <div className={`app${isResizing ? ' is-resizing' : ''}`}>
      <div className="titlebar" />
      {toast && <div className={`toast toast--${toast.type}`}>{toast.message}</div>}
      {errorModal && <ErrorModal message={errorModal} onClose={() => setErrorModal(null)} />}

      <Sidebar
        repos={repos}
        activeRepo={activeRepo}
        repoBranches={repoBranches}
        onSelectRepo={setActiveRepo}
        onRefresh={() => refreshStatus(activeRepo)}
        onAddWorkspace={handleAddWorkspace}
        onRemoveWorkspace={handleRemoveWorkspace}
        onReorder={handleReorderRepos}
        style={{ width: sidebarWidth }}
      />

      <ResizeDivider onResizeStart={makeResizeStart(sidebarWidth, setSidebarWidth, 140, 400)} />

      <FileList
        staged={status.staged}
        unstaged={status.unstaged}
        selectedFile={selectedFile}
        onSelectFile={handleSelectFile}
        onStage={handleStage}
        onUnstage={handleUnstage}
        onStageAll={handleStageAll}
        onUnstageAll={handleUnstageAll}
        onFileMenu={handleFileMenu}
        style={{ width: filelistWidth }}
      />

      <ResizeDivider onResizeStart={makeResizeStart(filelistWidth, setFilelistWidth, 180, 600)} />

      <div className="main-panel">
        <DiffViewer
          diff={diff}
          selectedFile={selectedFile}
          onOpenAraxis={handleOpenAraxis}
          blameOn={blameOn}
          blameData={blameData}
          onToggleBlame={() => setBlameOn(v => !v)}
          onBlameHashClick={handleBlameHashClick}
          commitView={commitView}
          commitDiff={commitDiff}
          onClearCommitView={() => { setCommitView(null); setCommitDiff('') }}
        />
        <CommitPanel
          message={commitMessage}
          onMessageChange={setCommitMessage}
          onCommit={handleCommit}
          onPush={handlePush}
          onPull={handlePull}
          onPullMain={handlePullMain}
          busy={busy}
          stagedCount={status.staged.length}
          ahead={status.ahead}
          behind={status.behind}
          hasRemote={!!status.tracking}
        />
      </div>
    </div>
  )
}

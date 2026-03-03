import { useState } from 'react'

/**
 * Left sidebar listing all workspaces with branch and ahead/behind indicators.
 * Repos can be reordered by dragging.
 * Below the repo list, shows the stash list for the active repo.
 * @param {object}     props
 * @param {object[]}   props.repos
 * @param {object|null} props.activeRepo
 * @param {object}     props.repoBranches  - keyed by repo path: { branch, ahead, behind }
 * @param {(repo:object)=>void} props.onSelectRepo
 * @param {()=>void}   props.onRefresh
 * @param {()=>void}   props.onAddWorkspace
 * @param {(path:string)=>void} props.onRemoveWorkspace
 * @param {(fromIndex:number, toIndex:number)=>void} props.onReorder
 * @param {{ ref: string, message: string }[]} props.stashList
 * @param {(ref:string, message:string)=>void} props.onStashClick
 * @param {()=>void}   props.onOpenSettings
 * @param {object}     props.style - passed to the root element for resizable width
 */
export default function Sidebar({ repos, activeRepo, repoBranches, onSelectRepo, onRefresh, onAddWorkspace, onRemoveWorkspace, onReorder, stashList, onStashClick, onOpenSettings, style }) {
  const [dragIndex, setDragIndex]       = useState(null)
  const [dragOverIndex, setDragOverIndex] = useState(null)

  const handleDrop = (e, toIndex) => {
    e.preventDefault()
    if (dragIndex !== null && dragIndex !== toIndex) onReorder(dragIndex, toIndex)
    setDragIndex(null)
    setDragOverIndex(null)
  }

  return (
    <aside className="sidebar" style={style}>
      <div className="sidebar__header">
        <span className="sidebar__title">Repos</span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button className="refresh-btn" onClick={onRefresh} title="Refresh (⌘R)">⟳</button>
          <button className="refresh-btn" onClick={onAddWorkspace} title="Add workspace">+</button>
        </div>
      </div>

      <ul className="repo-list">
        {repos.map((repo, i) => {
          const isActive   = activeRepo?.path === repo.path
          const branchInfo = repoBranches[repo.path]
          const isDragOver = dragOverIndex === i && dragIndex !== i
          return (
            <li
              key={repo.path}
              className={`repo-item${isActive ? ' repo-item--active' : ''}${isDragOver ? ' repo-item--drag-over' : ''}`}
              draggable={true}
              onDragStart={() => setDragIndex(i)}
              onDragEnd={() => { setDragIndex(null); setDragOverIndex(null) }}
              onDragOver={e => { e.preventDefault(); setDragOverIndex(i) }}
              onDragLeave={() => setDragOverIndex(null)}
              onDrop={e => handleDrop(e, i)}
              onClick={() => onSelectRepo(repo)}
              title={`${repo.path}\n⌘${i + 1}`}
            >
              <div className="repo-item__row">
                <span className="repo-item__name">{repo.name}</span>
                <button
                  className="repo-remove-btn"
                  title="Remove workspace"
                  onClick={e => { e.stopPropagation(); onRemoveWorkspace(repo.path) }}
                >
                  ×
                </button>
              </div>
              <div className="repo-item__meta">
                <span className="branch-name">{branchInfo?.branch || '—'}</span>
                {branchInfo?.ahead  > 0 && <span className="ahead">↑{branchInfo.ahead}</span>}
                {branchInfo?.behind > 0 && <span className="behind">↓{branchInfo.behind}</span>}
              </div>
            </li>
          )
        })}
      </ul>

      <div className="sidebar__footer">
        <button className="sidebar__settings-btn" onClick={onOpenSettings} title="External app settings">⚙ Settings</button>
      </div>

      {stashList.length > 0 && (
        <div className="stash-section">
          <div className="stash-section__header">
            Stashes <span className="count">({stashList.length})</span>
          </div>
          <ul className="stash-list">
            {stashList.map(entry => (
              <li
                key={entry.ref}
                className="stash-item"
                title={`${entry.ref}: ${entry.message}\nClick to preview`}
                onClick={() => onStashClick(entry.ref, entry.message)}
              >
                <span className="stash-item__ref">{entry.ref}</span>
                <span className="stash-item__msg">{entry.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </aside>
  )
}

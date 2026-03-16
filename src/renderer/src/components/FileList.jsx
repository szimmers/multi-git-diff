function FileItem({ file, isStaged, isSelected, onSelect, onAction, onContextMenu, stashSelected, onToggleStashSelect }) {
  return (
    <div
      className={`file-item${isSelected ? ' file-item--selected' : ''}`}
      onClick={() => onSelect({ ...file, isStaged })}
      onContextMenu={onContextMenu ? e => { e.preventDefault(); onContextMenu(file.path, file.status) } : undefined}
    >
      {!isStaged && onToggleStashSelect && (
        <input
          type="checkbox"
          className="file-check"
          checked={stashSelected}
          onChange={() => onToggleStashSelect(file.path)}
          onClick={e => e.stopPropagation()}
          title="Select for stash / stage / discard"
        />
      )}
      <span className="file-status" data-s={file.status}>{file.status}</span>
      <span className="file-path" title={file.path}>{file.path}</span>
      <button
        className="file-action"
        title={isStaged ? 'Unstage' : 'Stage'}
        onClick={e => { e.stopPropagation(); onAction(file.path) }}
      >
        {isStaged ? '−' : '+'}
      </button>
    </div>
  )
}

/**
 * Two-section file list: Staged (with Unstage All) and Unstaged (with Stage All).
 * Right-click context menu is available on unstaged files only.
 * @param {object}     props
 * @param {object[]}   props.staged
 * @param {object[]}   props.unstaged
 * @param {object|null} props.selectedFile
 * @param {(file:object)=>void} props.onSelectFile
 * @param {(path:string)=>void} props.onStage
 * @param {(path:string)=>void} props.onUnstage
 * @param {()=>void}   props.onStageAll
 * @param {()=>void}   props.onUnstageAll
 * @param {(path:string, status:string)=>void} props.onFileMenu - triggered by right-click on unstaged files
 * @param {Set<string>} props.stashSelection - file paths selected for stashing
 * @param {(path:string)=>void} props.onToggleStashSelect
 * @param {object}     props.style - passed to the root element for resizable width
 */
export default function FileList({
  staged, unstaged, selectedFile,
  onSelectFile, onStage, onUnstage, onStageAll, onUnstageAll, onFileMenu,
  stashSelection, onToggleStashSelect, onStash, onStageSelected, onClearSelection,
  onSelectAll, onDiscard, style,
}) {
  const selCount   = stashSelection?.size ?? 0
  const canStash   = selCount > 0 || staged.length > 0 || unstaged.length > 0
  const stashLabel = selCount > 0 ? `Stash (${selCount})` : 'Stash All'
  const stageLabel = selCount > 0 ? `Stage (${selCount})` : 'Stage All'
  const allSelected = unstaged.length > 0 && selCount === unstaged.length
  return (
    <div className="file-list" style={style}>
      {/* Staged */}
      <div className="file-section">
        <div className="file-section__header">
          <span>Staged <span className="count">({staged.length})</span></span>
          {staged.length > 0 && (
            <button className="section-btn" onClick={onUnstageAll}>Unstage All</button>
          )}
        </div>
        <div className="file-section__body">
          {staged.length === 0
            ? <div className="empty-state">No staged changes</div>
            : staged.map(file => (
              <FileItem
                key={`s-${file.path}`}
                file={file}
                isStaged={true}
                isSelected={selectedFile?.path === file.path && selectedFile?.isStaged === true}
                onSelect={onSelectFile}
                onAction={onUnstage}
              />
            ))
          }
        </div>
      </div>

      {/* Unstaged */}
      <div className="file-section">
        <div className="file-section__header">
          <span>Unstaged <span className="count">({unstaged.length})</span></span>
          <div style={{ display: 'flex', gap: 4 }}>
            {unstaged.length > 0 && (
              <button
                className="section-btn"
                onClick={allSelected ? onClearSelection : onSelectAll}
                title={allSelected ? 'Deselect all' : 'Select all unstaged files'}
              >
                {allSelected ? 'Deselect All' : 'Select All'}
              </button>
            )}
            {selCount > 0 && !allSelected && (
              <button className="section-btn" onClick={onClearSelection} title="Clear selection">✕</button>
            )}
            {unstaged.length > 0 && (
              <button
                className="section-btn section-btn--danger"
                onClick={onDiscard}
                title={selCount > 0 ? `Discard changes to ${selCount} file(s)` : 'Discard all unstaged changes'}
              >
                {selCount > 0 ? `Discard (${selCount})` : 'Discard All'}
              </button>
            )}
            {canStash && (
              <button className="section-btn section-btn--stash" onClick={onStash}
                title={selCount > 0 ? `Stash the ${selCount} checked file(s)` : 'Stash all staged and unstaged changes'}>
                {stashLabel}
              </button>
            )}
            {unstaged.length > 0 && (
              <button className="section-btn"
                onClick={selCount > 0 ? onStageSelected : onStageAll}
                title={selCount > 0 ? `Stage the ${selCount} checked file(s)` : 'Stage all unstaged files'}>
                {stageLabel}
              </button>
            )}
          </div>
        </div>
        <div className="file-section__body">
          {unstaged.length === 0
            ? <div className="empty-state">No unstaged changes</div>
            : unstaged.map(file => (
              <FileItem
                key={`u-${file.path}`}
                file={file}
                isStaged={false}
                isSelected={selectedFile?.path === file.path && selectedFile?.isStaged === false}
                onSelect={onSelectFile}
                onAction={onStage}
                onContextMenu={onFileMenu}
                stashSelected={stashSelection?.has(file.path) ?? false}
                onToggleStashSelect={onToggleStashSelect}
              />
            ))
          }
        </div>
      </div>
    </div>
  )
}

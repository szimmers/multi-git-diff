function FileItem({ file, isStaged, isSelected, onSelect, onAction, onContextMenu }) {
  return (
    <div
      className={`file-item${isSelected ? ' file-item--selected' : ''}`}
      onClick={() => onSelect({ ...file, isStaged })}
      onContextMenu={onContextMenu ? e => { e.preventDefault(); onContextMenu(file.path) } : undefined}
    >
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
 * @param {(path:string)=>void} props.onFileMenu - triggered by right-click on unstaged files
 * @param {object}     props.style - passed to the root element for resizable width
 */
export default function FileList({
  staged, unstaged, selectedFile,
  onSelectFile, onStage, onUnstage, onStageAll, onUnstageAll, onFileMenu, style,
}) {
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
          {unstaged.length > 0 && (
            <button className="section-btn" onClick={onStageAll}>Stage All</button>
          )}
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
              />
            ))
          }
        </div>
      </div>
    </div>
  )
}

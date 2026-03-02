import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  getWorkspaces:   ()       => ipcRenderer.invoke('workspaces:get'),
  addWorkspace:    ()       => ipcRenderer.invoke('workspaces:add'),
  removeWorkspace: (path)        => ipcRenderer.invoke('workspaces:remove', path),
  setWorkspaces:   (workspaces)  => ipcRenderer.invoke('workspaces:set', workspaces),
  getStatus:   (repoPath)                    => ipcRenderer.invoke('git:status',     repoPath),
  getDiff:     (repoPath, filePath, staged, isUntracked) => ipcRenderer.invoke('git:diff', repoPath, filePath, staged, isUntracked),
  stage:       (repoPath, filePaths)         => ipcRenderer.invoke('git:stage',      repoPath, filePaths),
  unstage:     (repoPath, filePaths)         => ipcRenderer.invoke('git:unstage',    repoPath, filePaths),
  stageAll:    (repoPath)                    => ipcRenderer.invoke('git:stageAll',   repoPath),
  unstageAll:  (repoPath)                    => ipcRenderer.invoke('git:unstageAll', repoPath),
  commit:      (repoPath, message)           => ipcRenderer.invoke('git:commit',     repoPath, message),
  push:        (repoPath)                    => ipcRenderer.invoke('git:push',       repoPath),
  openAraxis:  (repoPath, filePath, staged)  => ipcRenderer.invoke('git:openAraxis', repoPath, filePath, staged),
  getBlame:    (repoPath, filePath)          => ipcRenderer.invoke('git:blame',      repoPath, filePath),
  showFileMenu:(repoPath, filePath)          => ipcRenderer.invoke('git:fileMenu',   repoPath, filePath),
  watch:       (repoPath)                    => ipcRenderer.invoke('git:watch',      repoPath),
  unwatch:     (repoPath)                    => ipcRenderer.invoke('git:unwatch',    repoPath),

  onChanged: (callback) => {
    const handler = (_, repoPath) => callback(repoPath)
    ipcRenderer.on('git:changed', handler)
    return () => ipcRenderer.removeListener('git:changed', handler)
  },
})

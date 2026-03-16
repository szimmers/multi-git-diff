import { app, BrowserWindow, ipcMain, dialog, Menu } from 'electron'
import { join, basename } from 'path'
import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { execFile } from 'child_process'
import { simpleGit } from 'simple-git'
import chokidar from 'chokidar'

const ARAXIS     = '/Applications/Araxis Merge.app/Contents/Utilities/compare'
const SUBLIME    = '/Applications/Sublime Text.app/Contents/SharedSupport/bin/subl'
const WEBSTORM   = '/Applications/WebStorm.app/Contents/MacOS/webstorm'
const SOURCETREE = '/Applications/Sourcetree.app'

// ─── Workspace persistence ────────────────────────────────────────────────────

/** @returns {string} Absolute path to the workspaces JSON file in userData. */
function workspacesFile() {
  return join(app.getPath('userData'), 'workspaces.json')
}

/**
 * Reads persisted workspaces from disk.
 * @returns {{ name: string, path: string }[]}
 */
function readWorkspaces() {
  const file = workspacesFile()
  if (!existsSync(file)) return []
  try {
    return JSON.parse(readFileSync(file, 'utf-8'))
  } catch {
    return []
  }
}

/**
 * Persists workspaces to disk.
 * @param {{ name: string, path: string }[]} workspaces
 */
function writeWorkspaces(workspaces) {
  writeFileSync(workspacesFile(), JSON.stringify(workspaces, null, 2))
}

// ─── Settings persistence ─────────────────────────────────────────────────────

function settingsFile() {
  return join(app.getPath('userData'), 'settings.json')
}

function readSettings() {
  try { return JSON.parse(readFileSync(settingsFile(), 'utf-8')) } catch { return {} }
}

function writeSettings(s) {
  writeFileSync(settingsFile(), JSON.stringify(s, null, 2))
}

const watchers = new Map()
let mainWindow

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#f5f5f5',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 12, y: 13 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
    },
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// Close all chokidar watchers before Node tears down its event loop.
// Without this, fsevents.node crashes with SIGABRT during shutdown because
// its FSEvents instance is destroyed after libuv's mutex is already freed.
app.on('before-quit', () => {
  for (const watcher of watchers.values()) watcher.close()
  watchers.clear()
})

// ─── IPC: Workspaces ─────────────────────────────────────────────────────────

ipcMain.handle('workspaces:get', () => readWorkspaces())

ipcMain.handle('workspaces:add', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Add Workspace',
    properties: ['openDirectory'],
  })
  if (canceled || !filePaths.length) return null

  const dir = filePaths[0]
  const workspaces = readWorkspaces()
  if (workspaces.some(w => w.path === dir)) return workspaces // already present

  const updated = [...workspaces, { name: basename(dir), path: dir }]
  writeWorkspaces(updated)
  return updated
})

ipcMain.handle('workspaces:remove', (_, path) => {
  const updated = readWorkspaces().filter(w => w.path !== path)
  writeWorkspaces(updated)
  return updated
})

ipcMain.handle('workspaces:set', (_, workspaces) => {
  writeWorkspaces(workspaces)
})

// ─── IPC: Status ─────────────────────────────────────────────────────────────

ipcMain.handle('git:status', async (_, repoPath) => {
  try {
    const git = simpleGit(repoPath)
    const status = await git.status()

    const staged = []
    const unstaged = []

    for (const file of status.files) {
      const idx = file.index       // staged status char
      const wd  = file.working_dir // working dir status char

      if (idx !== ' ' && idx !== '?') {
        staged.push({ path: file.path, status: idx, from: file.from || null })
      }
      if (wd !== ' ') {
        unstaged.push({ path: file.path, status: wd })
      }
    }

    return {
      staged,
      unstaged,
      branch:   status.current,
      ahead:    status.ahead,
      behind:   status.behind,
      tracking: status.tracking,
    }
  } catch (err) {
    return { error: err.message, staged: [], unstaged: [], branch: '?', ahead: 0, behind: 0 }
  }
})

// ─── IPC: Diff ───────────────────────────────────────────────────────────────

/**
 * Returns a unified diff string for a single file.
 * For untracked files, synthesises a diff from the raw file content.
 * @param {string} repoPath
 * @param {string} filePath  - repo-relative path
 * @param {boolean} staged   - true → diff HEAD vs index; false → diff index vs working tree
 * @param {boolean} isUntracked
 */
ipcMain.handle('git:diff', async (_, repoPath, filePath, staged, isUntracked) => {
  try {
    const git = simpleGit(repoPath)

    if (isUntracked) {
      const fullPath = join(repoPath, filePath)
      let content
      try {
        content = readFileSync(fullPath, 'utf-8')
      } catch {
        return ''
      }
      // Check for binary content
      if (content.includes('\0')) {
        return `--- /dev/null\n+++ b/${filePath}\n@@ -0,0 +0,0 @@\nBinary file`
      }
      const lines = content.split('\n')
      const body = lines.map(l => `+${l}`).join('\n')
      return `--- /dev/null\n+++ b/${filePath}\n@@ -0,0 +1,${lines.length} @@\n${body}`
    }

    const diff = staged
      ? await git.diff(['--cached', '--', filePath])
      : await git.diff(['--', filePath])

    return diff || ''
  } catch {
    return ''
  }
})

// ─── IPC: Stage / Unstage ────────────────────────────────────────────────────

ipcMain.handle('git:stage', async (_, repoPath, filePaths) => {
  const git = simpleGit(repoPath)
  await git.add(Array.isArray(filePaths) ? filePaths : [filePaths])
})

ipcMain.handle('git:unstage', async (_, repoPath, filePaths) => {
  const git = simpleGit(repoPath)
  const paths = Array.isArray(filePaths) ? filePaths : [filePaths]
  await git.reset(['HEAD', '--', ...paths])
})

ipcMain.handle('git:stageAll', async (_, repoPath) => {
  const git = simpleGit(repoPath)
  await git.add('.')
})

ipcMain.handle('git:unstageAll', async (_, repoPath) => {
  const git = simpleGit(repoPath)
  await git.reset(['HEAD'])
})

// ─── IPC: Commit / Push ──────────────────────────────────────────────────────

ipcMain.handle('git:commit', async (_, repoPath, message, noVerify) => {
  try {
    const git = simpleGit(repoPath)
    const options = noVerify ? ['--no-verify'] : []
    const result = await git.commit(message, options)
    return { ok: true, result }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('git:push', async (_, repoPath) => {
  try {
    const git = simpleGit(repoPath)
    const result = await git.push(['origin', 'HEAD'])
    return { ok: true, result }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('git:pull', async (_, repoPath) => {
  try {
    const git = simpleGit(repoPath)
    const result = await git.pull()
    return { ok: true, result }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('git:pullMain', async (_, repoPath) => {
  try {
    const git = simpleGit(repoPath)
    let defaultBranch = 'main'
    try {
      const ref = await git.raw(['symbolic-ref', 'refs/remotes/origin/HEAD', '--short'])
      defaultBranch = ref.trim().replace(/^origin\//, '')
    } catch { /* fall back to main */ }
    const result = await git.pull('origin', defaultBranch)
    return { ok: true, result, branch: defaultBranch }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

// ─── IPC: Stash ──────────────────────────────────────────────────────────────

/**
 * Stashes changes. If filePaths is provided, stashes only those files.
 * @param {string}   repoPath
 * @param {string[]} [filePaths] - repo-relative paths to stash selectively
 */
ipcMain.handle('git:stash', async (_, repoPath, filePaths) => {
  try {
    const git = simpleGit(repoPath)
    const args = filePaths?.length ? ['push', '--', ...filePaths] : []
    await git.stash(args)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

/** Returns the patch for a single stash entry (git stash show -p <ref>). */
ipcMain.handle('git:stashShow', async (_, repoPath, ref) => {
  try {
    const git = simpleGit(repoPath)
    const raw = await git.raw(['stash', 'show', '-p', ref])
    return { ok: true, raw }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

/** Returns the stash list for a repo. */
ipcMain.handle('git:stashList', async (_, repoPath) => {
  try {
    const git = simpleGit(repoPath)
    const raw = await git.raw(['stash', 'list'])
    const entries = raw.trim()
      ? raw.trim().split('\n').map(line => {
          const m = line.match(/^(stash@\{\d+\}):\s*(.+)$/)
          return m ? { ref: m[1], message: m[2] } : { ref: line, message: line }
        })
      : []
    return { ok: true, entries }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

/**
 * Pops a specific stash entry.
 * @param {string} repoPath
 * @param {string} ref - e.g. 'stash@{0}'
 */
ipcMain.handle('git:stashPop', async (_, repoPath, ref) => {
  try {
    const git = simpleGit(repoPath)
    await git.stash(['pop', ref ?? 'stash@{0}'])
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

// ─── IPC: Open in Araxis ─────────────────────────────────────────────────────

ipcMain.handle('fs:readImageAsDataUrl', (_, filePath) => {
  try {
    const data = readFileSync(filePath)
    const ext = filePath.split('.').pop().toLowerCase()
    const mime = ext === 'svg' ? 'image/svg+xml' : `image/${ext === 'jpg' ? 'jpeg' : ext}`
    return `data:${mime};base64,${data.toString('base64')}`
  } catch {
    return null
  }
})

ipcMain.handle('settings:get', () => {
  const saved = readSettings()
  return {
    araxis:     { label: 'Araxis Merge', installed: existsSync(ARAXIS),     enabled: saved.araxis     === true },
    sublime:    { label: 'Sublime Text', installed: existsSync(SUBLIME),    enabled: saved.sublime    === true },
    webstorm:   { label: 'WebStorm',     installed: existsSync(WEBSTORM),   enabled: saved.webstorm   === true },
    sourcetree: { label: 'Sourcetree',   installed: existsSync(SOURCETREE), enabled: saved.sourcetree === true },
  }
})

ipcMain.handle('settings:set', (_, enabled) => writeSettings(enabled))


/**
 * Writes temp files and launches Araxis Merge for a side-by-side diff.
 * Staged: HEAD vs index. Unstaged: index (or HEAD) vs working tree.
 * @param {string} repoPath
 * @param {string} filePath - repo-relative path
 * @param {boolean} staged
 */
ipcMain.handle('git:openAraxis', async (_, repoPath, filePath, staged) => {
  try {
    const git = simpleGit(repoPath)
    const tmpDir = join(tmpdir(), 'difffest')
    mkdirSync(tmpDir, { recursive: true })

    const safeName = filePath.replace(/[^a-zA-Z0-9._-]/g, '_')
    let leftPath, rightPath

    if (staged) {
      // HEAD vs index (staged)
      const headContent = await git.show([`HEAD:${filePath}`]).catch(() => '')
      const idxContent  = await git.show([`:${filePath}`]).catch(() => '')
      leftPath  = join(tmpDir, `head_${safeName}`)
      rightPath = join(tmpDir, `index_${safeName}`)
      writeFileSync(leftPath, headContent)
      writeFileSync(rightPath, idxContent)
    } else {
      // index (or HEAD) vs working tree
      let baseContent = ''
      try {
        baseContent = await git.show([`:${filePath}`])
      } catch {
        try { baseContent = await git.show([`HEAD:${filePath}`]) } catch { /* untracked */ }
      }
      leftPath  = join(tmpDir, `base_${safeName}`)
      rightPath = join(repoPath, filePath)
      writeFileSync(leftPath, baseContent)
    }

    execFile(ARAXIS, [leftPath, rightPath], err => {
      if (err) console.error('Araxis launch error:', err.message)
    })

    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

// ─── IPC: Open in Sublime Text ────────────────────────────────────────────────

ipcMain.handle('git:openSublime', (_, repoPath, filePath) => {
  execFile(SUBLIME, [join(repoPath, filePath)], err => {
    if (err) console.error('Sublime launch error:', err.message)
  })
  return { ok: true }
})

ipcMain.handle('git:openWebstorm', (_, repoPath, filePath) => {
  execFile(WEBSTORM, [join(repoPath, filePath)], err => {
    if (err) console.error('WebStorm launch error:', err.message)
  })
  return { ok: true }
})

ipcMain.handle('git:openSourcetree', (_, repoPath) => {
  execFile('/usr/bin/open', ['-a', 'Sourcetree', repoPath], err => {
    if (err) console.error('Sourcetree launch error:', err.message)
  })
  return { ok: true }
})

// ─── IPC: File context menu ───────────────────────────────────────────────────

/**
 * Shows a native context menu for an unstaged file.
 * Untracked files ('?') get "Delete File"; tracked files get "Revert Changes".
 * Resolves with 'gitignore' | 'delete' | 'revert' | null | { error }.
 * @param {string} repoPath
 * @param {string} filePath - repo-relative path
 * @param {string} status   - git status character ('?', 'M', etc.)
 */
ipcMain.handle('git:fileMenu', (_, repoPath, filePath, status) => {
  return new Promise(resolve => {
    const isUntracked = status === '?'
    let handled = false
    const done = (value) => { handled = true; resolve(value) }

    const addToGitignore = {
      label: 'Add to .gitignore',
      click: () => {
        handled = true
        try {
          const gitignorePath = join(repoPath, '.gitignore')
          let existing = ''
          try { existing = readFileSync(gitignorePath, 'utf-8') } catch { /* no file yet */ }
          const lines = existing.split('\n').map(l => l.trim())
          if (!lines.includes(filePath)) {
            const prefix = existing.length > 0 && !existing.endsWith('\n') ? '\n' : ''
            appendFileSync(gitignorePath, prefix + filePath + '\n')
          }
          done('gitignore')
        } catch (err) {
          done({ error: err.message })
        }
      },
    }

    const deleteFile = {
      label: 'Delete File',
      click: async () => {
        handled = true
        const { response } = await dialog.showMessageBox(mainWindow, {
          type: 'warning',
          buttons: ['Delete', 'Cancel'],
          defaultId: 1,
          message: `Delete ${filePath}?`,
          detail: 'This file is untracked and cannot be recovered.',
        })
        if (response !== 0) { done(null); return }
        try {
          rmSync(join(repoPath, filePath), { recursive: true, force: true })
          done('delete')
        } catch (err) {
          done({ error: err.message })
        }
      },
    }

    const revertChanges = {
      label: 'Revert Changes',
      click: async () => {
        handled = true
        try {
          const git = simpleGit(repoPath)
          await git.checkout(['--', filePath])
          done('revert')
        } catch (err) {
          done({ error: err.message })
        }
      },
    }

    const template = isUntracked
      ? [addToGitignore, deleteFile]
      : [addToGitignore, revertChanges]

    const menu = Menu.buildFromTemplate(template)
    menu.popup({ window: mainWindow, callback: () => { if (!handled) resolve(null) } })
  })
})

// ─── IPC: Discard files ───────────────────────────────────────────────────────

/**
 * Reverts tracked files and deletes untracked files in bulk, with a confirmation dialog.
 * @param {string} repoPath
 * @param {{ path: string, status: string }[]} files
 */
ipcMain.handle('git:discardFiles', async (_, repoPath, files) => {
  const tracked   = files.filter(f => f.status !== '?')
  const untracked = files.filter(f => f.status === '?')

  const detail = [
    tracked.length   ? `${tracked.length} tracked file(s) will be reverted.`                     : '',
    untracked.length ? `${untracked.length} untracked file(s) will be permanently deleted.` : '',
  ].filter(Boolean).join('\n')

  const { response } = await dialog.showMessageBox(mainWindow, {
    type: 'warning',
    buttons: ['Discard', 'Cancel'],
    defaultId: 1,
    message: `Discard changes to ${files.length} file(s)?`,
    detail,
  })
  if (response !== 0) return { ok: false, cancelled: true }

  try {
    if (tracked.length) {
      const git = simpleGit(repoPath)
      await git.checkout(['--', ...tracked.map(f => f.path)])
    }
    for (const f of untracked) {
      rmSync(join(repoPath, f.path), { recursive: true, force: true })
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

// ─── IPC: Show commit ────────────────────────────────────────────────────────

ipcMain.handle('git:show', async (_, repoPath, hash) => {
  try {
    const git = simpleGit(repoPath)
    const raw = await git.show([hash])
    return { ok: true, raw }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

// ─── IPC: Blame ──────────────────────────────────────────────────────────────

ipcMain.handle('git:blame', async (_, repoPath, filePath) => {
  try {
    const git = simpleGit(repoPath)
    const raw = await git.raw(['blame', '--porcelain', filePath])
    return { ok: true, raw }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

// ─── IPC: Watch / Unwatch ────────────────────────────────────────────────────

ipcMain.handle('git:watch', (_, repoPath) => {
  if (watchers.has(repoPath)) return

  const watcher = chokidar.watch(
    [
      join(repoPath, '.git/index'),
      join(repoPath, '.git/HEAD'),
      join(repoPath, '.git/COMMIT_EDITMSG'),
      join(repoPath, '.git/refs/stash'),
    ],
    { ignoreInitial: true }
  )

  watcher.on('all', () => {
    mainWindow?.webContents.send('git:changed', repoPath)
  })

  watchers.set(repoPath, watcher)
})

ipcMain.handle('git:unwatch', (_, repoPath) => {
  const w = watchers.get(repoPath)
  if (w) {
    w.close()
    watchers.delete(repoPath)
  }
})

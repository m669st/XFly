import { app, net } from 'electron'
import { createWriteStream, existsSync, renameSync, rmSync, readdirSync, unlinkSync } from 'fs'
import { dirname, join } from 'path'
import pkg from 'electron-updater'
import { diagWrite } from './diag'



const { autoUpdater } = pkg




const FIRST_CHECK_MS = 8_000

const RECHECK_MS = 6 * 60 * 60 * 1000


function portableExe(): string | null {
  return process.env.PORTABLE_EXECUTABLE_FILE || null
}

export function initUpdater(): void {

  if (!app.isPackaged) {
    diagWrite('update', 'dev build — updater off')
    return
  }

  const exe = portableExe()
  if (exe) {
    sweepOldExe(exe)
    startPortableUpdater(exe)
  } else {
    startInstallerUpdater()
  }
}



function startInstallerUpdater(): void {

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.logger = null

  autoUpdater.on('checking-for-update', () => diagWrite('update', 'checking'))
  autoUpdater.on('update-available', (i) => diagWrite('update', `available: ${i.version}`))
  autoUpdater.on('update-not-available', () => diagWrite('update', `up to date (${app.getVersion()})`))
  autoUpdater.on('download-progress', (p) => logProgress(p.percent))
  autoUpdater.on('update-downloaded', (i) =>
    diagWrite('update', `${i.version} ready — installs when XFly is closed`),
  )

  autoUpdater.on('error', (e) => diagWrite('update', `failed: ${e?.message ?? e}`))

  const check = (): void => void autoUpdater.checkForUpdates().catch(() => {})
  setTimeout(check, FIRST_CHECK_MS)
  setInterval(check, RECHECK_MS)
}



const OWNER_REPO = 'm669st/XFly'
const OLD_SUFFIX = '.old'


function sweepOldExe(exe: string): void {
  try {
    const dir = dirname(exe)
    for (const f of readdirSync(dir)) {
      if (!f.endsWith(OLD_SUFFIX)) continue
      try {
        unlinkSync(join(dir, f))
        diagWrite('update', `cleaned up ${f}`)
      } catch {
        /* still locked; next launch will get it */
      }
    }
  } catch {
    /* the directory is not ours to read — nothing to clean */
  }
}

function startPortableUpdater(exe: string): void {
  diagWrite('update', `portable build (${app.getVersion()})`)
  const check = (): void => void checkPortable(exe).catch((e) => diagWrite('update', `failed: ${e?.message ?? e}`))
  setTimeout(check, FIRST_CHECK_MS)
  setInterval(check, RECHECK_MS)
}

let updating = false

async function checkPortable(exe: string): Promise<void> {
  if (updating) return
  diagWrite('update', 'checking')




  const yml = await fetchText(`https://github.com/${OWNER_REPO}/releases/latest/download/latest.yml`)
  const version = /^version:\s*(.+)$/m.exec(yml)?.[1]?.trim()
  if (!version) throw new Error('no version in latest.yml')

  if (!isNewer(version, app.getVersion())) {
    diagWrite('update', `up to date (${app.getVersion()})`)
    return
  }
  diagWrite('update', `available: ${version}`)
  updating = true

  const name = `XFly-${version}-portable.exe`
  const url = `https://github.com/${OWNER_REPO}/releases/download/v${version}/${name}`
  const tmp = exe + '.download'

  try {
    await download(url, tmp)

    const old = exe + OLD_SUFFIX
    if (existsSync(old)) rmSync(old, { force: true })
    renameSync(exe, old)
    renameSync(tmp, exe)
    diagWrite('update', `${version} installed — restart XFly to use it`)
  } catch (e) {

    try {
      if (existsSync(tmp)) rmSync(tmp, { force: true })
    } catch {
      /* ignore */
    }
    updating = false
    throw e
  }
}


function isNewer(a: string, b: string): boolean {
  const p = (v: string) => v.replace(/^v/, '').split(/[.-]/).map((x) => parseInt(x, 10) || 0)
  const [x, y] = [p(a), p(b)]
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0)
    if (d) return d > 0
  }
  return false
}


function fetchText(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = net.request(url)
    req.on('response', (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchText(String(res.headers.location)).then(resolve, reject)
        return
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`))
        return
      }
      let body = ''
      res.on('data', (c) => (body += c))
      res.on('end', () => resolve(body))
    })
    req.on('error', reject)
    req.end()
  })
}

function download(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = net.request(url)
    req.on('response', (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        download(String(res.headers.location), dest).then(resolve, reject)
        return
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`))
        return
      }
      const total = Number(res.headers['content-length'] || 0)
      let got = 0
      const file = createWriteStream(dest)
      res.on('data', (c) => {
        got += c.length
        file.write(c)
        if (total) logProgress((got / total) * 100)
      })
      res.on('end', () => file.end(() => resolve()))
      res.on('error', reject)
      file.on('error', reject)
    })
    req.on('error', reject)
    req.end()
  })
}



let lastStep = -1
function logProgress(percent: number): void {
  const step = Math.floor(percent / 10) * 10
  if (step > lastStep) {
    lastStep = step
    diagWrite('update', `downloading ${step}%`)
  }
}

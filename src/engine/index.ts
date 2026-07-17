























import { ipcRenderer } from 'electron'
import { IPC, type EngineCommand } from '../shared/ipc'
import { XBOX_PLAY_URL } from '../shared/constants'
import { engine, log, diag, emit } from './state'
import { rec } from './record'
import { requestResolution, requestBitrate, wantedAlias, onControlReady } from './datachannel'
import { patchRtcPeerConnection } from './rtc'
import { patchFetch } from './fetch-hook'
import { upscaler } from './upscale'
import { hideXboxChrome } from './chrome'
import { gateGamepads, announceGamepads } from './gamepad-gate'
import { watchMenuShortcut } from './shortcut'
import { skipSplashVideo } from './splash'
import { installPatcher } from './patcher'
import './local-coop'
import './telemetry'
import { harvestTokens } from './tokens'
import { autoSignIn } from './signin'
import { launchTitle } from './launch'


const IS_XBOX = /(^|\.)xbox\.com$/i.test(location.hostname)

if (!IS_XBOX) {
  log('info', `engine: standing down on ${location.hostname} — not xbox.com`)
}

if (IS_XBOX) {
  // Before the page has painted a single frame.
  //
  // This used to wait for DOMContentLoaded, which is late enough for xbox.com to
  // draw its own furniture first — the cookie bar flashing across the top of an
  // otherwise black screen between pressing play and the game arriving was this.
  // The stylesheet only ever hides things, so it is safe to apply on the default
  // and let the settings below turn it back off in the rare case it is unwanted.
  hideXboxChrome()

  ipcRenderer
    .invoke(IPC.settingsAll)
    .then((s) => {
      Object.assign(engine.settings, s || {})
      if (engine.settings.hideXboxChrome === false) document.getElementById('xfly-chrome')?.remove()
    })
    .catch(() => {})


  try {
    patchFetch()
    patchRtcPeerConnection()
    // Before anything can ask the intro clip to play.
    skipSplashVideo()


    gateGamepads()

    installPatcher()
    log('info', 'engine hooks installed')
  } catch (e) {
    log('error', `hook install failed: ${e}`)
  }
}




if (IS_XBOX)
  ipcRenderer.on(IPC.engineCommand, (_e, cmd: EngineCommand) => {
  try {
    if (cmd.type === 'applySettings') {
      Object.assign(engine.settings, cmd.settings)
      upscaler.apply()
      syncResolution()
    } else if (cmd.type === 'setClarity') {
      engine.settings.clarityBoost = cmd.boost
      engine.settings.claritySharpen = cmd.sharpen
      upscaler.apply()
    } else if (cmd.type === 'disconnect') {
      void endSession()
    } else if (cmd.type === 'signIn') {
      autoSignIn()
    } else if (cmd.type === 'launch') {
      launchTitle(cmd.productId, cmd.title)
    } else if (cmd.type === 'launcherVisible') {
      const was = engine.launcherVisible
      engine.launcherVisible = cmd.visible



      if (was && !cmd.visible) announceGamepads()
    }
  } catch (e) {
    log('warn', `command failed: ${e}`)
  }
})


/**
 * Quit for real.
 *
 * history.back() was not quitting anything: it walked the page back to /play, the
 * SPA restored the launch route it had just come from, and the session carried on
 * streaming at full bitrate on a console nobody was watching. xCloud's own quit
 * button deletes the session, so we do that first and only then leave — by
 * assigning the URL, because going back lands on the launch route again.
 */
async function endSession(): Promise<void> {
  const url = engine.sessionUrl
  const auth = engine.sessionAuth || (engine.gsToken ? `Bearer ${engine.gsToken}` : '')
  engine.sessionUrl = ''
  engine.sessionAuth = ''

  if (url) {
    try {
      const res = await fetch(url, {
        method: 'DELETE',
        headers: auth ? { Authorization: auth } : {},
      })
      // The path, not just the status: a 404 here means the url was built wrong, and
      // without seeing it that is indistinguishable from a session already gone.
      diag('session', `DELETE ${new URL(url).pathname.replace(/[0-9A-F-]{36}/i, '<session>')} -> ${res.status}`)
    } catch (e) {
      // Losing the session is the server's problem now; it times out on its own.
      diag('session', `DELETE session failed: ${e}`)
    }
  } else {
    diag('session', 'quit with no session url — leaving the page only')
  }

  location.assign(XBOX_PLAY_URL)
}

function onReady(): void {
  if (!IS_XBOX) return
  harvestTokens()
  watchForVideo()
  watchMenuShortcut()
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', onReady)
else onReady()


let lastAlias: string | null = null
let lastBitrate = 0
function syncResolution(): void {
  const alias = wantedAlias()
  if (alias && alias !== lastAlias && requestResolution(alias)) lastAlias = alias

  const mbps = Number(engine.settings.targetBitrateMbps ?? 0)
  if (mbps > 0 && mbps !== lastBitrate && requestBitrate(mbps * 1e6)) lastBitrate = mbps
}



onControlReady(() => {
  lastAlias = null
  lastBitrate = 0
  syncResolution()
  holdBitrate()
})


const BITRATE_HOLD_MS = 5000
let bitrateHold: ReturnType<typeof setInterval> | null = null
function holdBitrate(): void {
  if (bitrateHold) clearInterval(bitrateHold)
  bitrateHold = setInterval(() => {
    const mbps = Number(engine.settings.targetBitrateMbps ?? 0)
    if (mbps <= 0) return

    if (!requestBitrate(mbps * 1e6, true) && bitrateHold) {
      clearInterval(bitrateHold)
      bitrateHold = null
    }
  }, BITRATE_HOLD_MS)
}



let resizeTimer: ReturnType<typeof setTimeout> | null = null
window.addEventListener('resize', () => {
  if (resizeTimer) clearTimeout(resizeTimer)
  resizeTimer = setTimeout(() => {
    syncResolution()
    if (engine.video) reportVsrEligibility(engine.video)
  }, 600)
})


function reportVsrEligibility(v: HTMLVideoElement): void {
  if (engine.settings.videoEnhancer !== 'vsr' || !v.videoWidth) return
  const dpr = window.devicePixelRatio || 1
  const rect = v.getBoundingClientRect()

  const scale = Math.min(rect.width / v.videoWidth, rect.height / v.videoHeight) * dpr
  const shownW = Math.round(v.videoWidth * scale)
  const shownH = Math.round(v.videoHeight * scale)
  const verdict =
    scale > 1.001 ? 'upscaling — VSR should engage (upscale + de-artifact)'
    : scale > 0.999 ? 'native size — VSR should engage (de-artifact only, needs driver 545+)'
    : 'DOWNSCALING — VSR will NOT engage; the stream is larger than the window'
  diag('vsr', `source ${v.videoWidth}x${v.videoHeight} shown ${shownW}x${shownH} (x${scale.toFixed(2)}) — ${verdict}`)
  rec('vsr', { source: [v.videoWidth, v.videoHeight], shown: [shownW, shownH], scale, verdict })



  if (scale <= 0.999) {
    const fits = Math.round(rect.height * dpr)
    diag(
      'vsr',
      `to fix: ask for a stream that fits ${Math.round(rect.width * dpr)}x${fits}, or give the video more pixels ` +
        `(fullscreen, or a desktop resolution above ${v.videoHeight}p — e.g. NVIDIA DSR)`,
    )
  }
}


let lastSize: string | null = null
let lastSizeAt = 0
function noteResolutionChange(v: HTMLVideoElement): void {
  if (!v.videoWidth) return
  const size = `${v.videoWidth}x${v.videoHeight}`
  if (size === lastSize) return
  const now = performance.now()
  const held = lastSize ? ` after ${((now - lastSizeAt) / 1000).toFixed(1)}s` : ''
  const floor = Number(engine.settings.targetBitrateMbps ?? 0)
  const dir = lastSize && v.videoHeight < Number(lastSize.split('x')[1]) ? 'DOWN' : 'up'
  if (lastSize) {
    diag(
      'server',
      `resolution ${dir}: ${lastSize} -> ${size}${held} ` +
        `(floor=${floor > 0 ? `${floor} Mbps held` : 'NONE — bitrate is Auto, nothing is being asked for'})`,
    )
    rec('server.resize', { from: lastSize, to: size, heldMs: Math.round(now - lastSizeAt), floorMbps: floor })
  }
  lastSize = size
  lastSizeAt = now
}


function watchForVideo(): void {
  const tryAttach = (v: HTMLVideoElement) => {
    if (engine.video === v) return

    if (v.className && v.className.startsWith('XboxSplashVideo')) return
    upscaler.attach(v)
    log('info', 'clarity boost attached to stream video')




    const announce = (why: string) => {
      if (!v.videoWidth) return
      diag('video', `${why} ${v.videoWidth}x${v.videoHeight} -> PLAYING`)
      emit({ type: 'stream.state', state: 'playing' })
    }
    v.addEventListener('loadedmetadata', () => diag('video', `loadedmetadata ${v.videoWidth}x${v.videoHeight}`))
    v.addEventListener('resize', () => reportVsrEligibility(v))
    v.addEventListener('resize', () => noteResolutionChange(v))
    setTimeout(() => reportVsrEligibility(v), 3000)
    v.addEventListener('playing', () => announce('playing event'))
    v.addEventListener('resize', () => announce('resize'))
    v.addEventListener('error', () => diag('video', `error: ${v.error?.code} ${v.error?.message}`))
    if (!v.paused && v.videoWidth) announce('already playing')
  }

  const proto = HTMLMediaElement.prototype
  const desc = Object.getOwnPropertyDescriptor(proto, 'srcObject')
  if (desc?.set) {
    Object.defineProperty(proto, 'srcObject', {
      configurable: true,
      get: desc.get,
      set(this: HTMLVideoElement, val) {
        desc.set!.call(this, val)
        if (this instanceof HTMLVideoElement && val) setTimeout(() => tryAttach(this), 0)
      },
    })
  }

  const mo = new MutationObserver(() => {
    document.querySelectorAll('video').forEach((v) => {
      if ((v as HTMLVideoElement).srcObject) tryAttach(v as HTMLVideoElement)
    })
  })
  mo.observe(document.documentElement, { childList: true, subtree: true })
}

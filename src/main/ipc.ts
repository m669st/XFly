import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc'
import { settings } from './settings'
import { HAS_ACCOUNT, type XFlyWindow } from './window'
import {
  registerTokenCapture,
  getTokens,
  ingestEngineEvent,
  pushAuthState,
  currentAuthState,
  startAuthProbe,
  clearTokens,
  hydrateFromXboxCookies,
} from './tokens'
import { apiRequest } from './api'
import { diagDump, diagOpen, diagPath, diagWrite } from './diag'
import { record, recordOpen, recordPath, recordStats } from './recorder'
import { gpuInfo } from './gpu'

export function registerIpc(win: XFlyWindow): void {
  registerTokenCapture(win)


  startAuthProbe(win)


  void hydrateFromXboxCookies().then((state) => {
    if (state === 'none') {
      diagWrite('auth', 'no xbox token cookie — signed out, without waiting out the probe')

      if (settings.get(HAS_ACCOUNT as never)) {
        settings.set(HAS_ACCOUNT as never, false as never)
        diagWrite('auth', 'cleared the stale account flag — next launch starts as a desktop browser')
      }
      pushAuthState(win)
    }
  })


  ipcMain.handle(IPC.authStateGet, () => currentAuthState())



  ipcMain.on(IPC.windowMinimize, () => win.base.minimize())
  ipcMain.on(IPC.windowMaximizeToggle, () => {
    win.base.isMaximized() ? win.base.unmaximize() : win.base.maximize()
  })
  ipcMain.on(IPC.windowClose, () => win.base.close())
  ipcMain.handle(IPC.windowIsMaximized, () => win.base.isMaximized())


  ipcMain.handle(IPC.settingsAll, () => settings.all())
  ipcMain.handle(IPC.settingsGet, (_e, key: string) => settings.get(key as never))
  ipcMain.handle(IPC.settingsSet, (_e, key: string, value: unknown) => {
    settings.set(key as never, value as never)
    diagWrite('settings', `${key} = ${JSON.stringify(value)}`)

    win.xcloud.webContents.send(IPC.engineCommand, { type: 'applySettings', settings: settings.all() })
    return settings.all()
  })



  ipcMain.on(IPC.xboxShow, () => win.hideOverlay(true))
  ipcMain.on(IPC.xboxHide, () => win.showOverlay())
  ipcMain.on(IPC.xboxNavigate, (_e, url: string) => void win.xcloud.webContents.loadURL(url))
  ipcMain.on(IPC.xboxReload, () => win.xcloud.webContents.reload())


  ipcMain.handle(IPC.apiRequest, (_e, spec) => apiRequest(spec))



  let streaming = false
  let playing = false
  let launchTimer: NodeJS.Timeout | null = null


  const WATCHDOG_MS = 45_000
  const armLaunchWatchdog = (): void => {
    if (launchTimer) clearTimeout(launchTimer)
    launchTimer = setTimeout(() => {
      launchTimer = null
      if (playing) return
      diagWrite('launch', `watchdog: session silent for ${WATCHDOG_MS / 1000}s — returning to launcher`)
      streaming = false
      win.setStreaming(false)
      win.showOverlay()
      win.overlay.webContents.send(IPC.engineEvent, { type: 'stream.state', state: 'ended' })
    }, WATCHDOG_MS)
  }
  ipcMain.on(IPC.engineEvent, (_e, event) => {
    win.overlay.webContents.send(IPC.engineEvent, event)
    if (event?.type === 'log') diagWrite('engine', String(event.msg))
    // The pad's way in and out of our own menu. Showing the overlay is also what
    // makes the xbox page go blind to the controller, so the game cannot be played
    // through the menu sitting on top of it.
    else if (event?.type === 'menu.toggle') {
      if (win.isOverlayVisible) win.hideOverlay(true, 'menu closed from the pad')
      else win.showOverlay('menu opened from the pad')
    }
    else if (event?.type === 'stream.state') diagWrite('state', String(event.state))
    // The session answering at all means it is alive. It may be sitting in xCloud's
    // queue (WaitingForResources) for minutes — measured at 107 seconds, after which
    // it provisioned and played fine, while the watchdog had already thrown the user
    // back to the launcher at 90s. A watchdog is for a session that has stopped
    // responding, not one that is waiting its turn.
    else if (event?.type === 'session.state') {
      diagWrite('session', String(event.state))
      win.overlay.webContents.send(IPC.engineEvent, event)
      if (streaming && !playing) armLaunchWatchdog()
    }

    if (event?.type === 'tokens' || event?.type === 'profile') {
      ingestEngineEvent(event)

      if (getTokens().gsToken) pushAuthState(win)

      if (getTokens().gsToken && !streaming) {
        win.showOverlay()

        if (!getTokens().xbl3) {
          void hydrateFromXboxCookies().then((ok) => ok && pushAuthState(win))
        }

        void win.onSignedIn()
      }
    }



    if (event?.type === 'stream.state') {
      streaming = event.state === 'playing' || event.state === 'starting' || event.state === 'loading'
      playing = event.state === 'playing'
      win.setStreaming(streaming)
      if (playing) {

        if (launchTimer) clearTimeout(launchTimer)
        launchTimer = null
        win.hideOverlay()
      } else {
        win.showOverlay()
      }
    }
  })





  const endSession = (why: string): void => {
    if (!streaming && !playing) return
    diagWrite('state', `session ended (${why})`)
    streaming = false
    playing = false
    win.setStreaming(false)
    if (launchTimer) clearTimeout(launchTimer)
    launchTimer = null
    win.showOverlay()
    win.overlay.webContents.send(IPC.engineEvent, { type: 'stream.state', state: 'ended' })
  }


  win.onLeftSession = () => endSession('SPA returned to the xbox home page')




  ipcMain.handle(IPC.authGetProfile, () => getTokens().profile)

  ipcMain.on(IPC.authSignIn, () => void win.beginSignIn())
  ipcMain.handle(IPC.authLogout, async () => {
    endSession('user signed out')
    await win.signOut()
    clearTokens()
    pushAuthState(win)
  })

  ipcMain.on(IPC.engineCommand, (_e, cmd) => {
    if (cmd?.type === 'disconnect') {
      endSession('user cancelled')
      return
    }
    if (cmd?.type !== 'launch') return
    diagWrite('launch', `productId=${cmd.productId} title=${cmd.title}`)
    streaming = true
    win.setStreaming(true)
    armLaunchWatchdog()
  })

  ipcMain.on(IPC.engineCommand, (_e, cmd) => win.xcloud.webContents.send(IPC.engineCommand, cmd))


  ipcMain.handle(IPC.diagDump, () => diagDump())
  ipcMain.handle(IPC.diagPath, () => diagPath())
  ipcMain.on(IPC.diagOpen, () => diagOpen())


  ipcMain.handle(IPC.gpuInfo, () => gpuInfo())


  ipcMain.on(IPC.recordEvent, (_e, ev: { kind: string; d: unknown }) => record(ev?.kind ?? 'unknown', ev?.d))
  ipcMain.handle(IPC.recordPath, () => recordStats())
  ipcMain.on(IPC.recordOpen, () => recordOpen())
  diagWrite('boot', `session recording -> ${recordPath()}`)
}

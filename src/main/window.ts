import { BaseWindow, BrowserWindow, WebContentsView, shell } from 'electron'
import { join } from 'path'
import {
  XBOX_PLAY_URL,
  XBOX_PARTITION,
  TIZEN_TV_USER_AGENT,
  EDGE_DESKTOP_USER_AGENT,
} from '@shared/constants'
import { IPC } from '@shared/ipc'
import { setupXboxSession, setXboxUserAgent, xboxUserAgent, clearXboxSession } from './session'
import { settings } from './settings'
import { diagWrite } from './diag'
import { redactUrl } from './redact'


export const HAS_ACCOUNT = '_hasAccount'



const isDev = !!process.env.ELECTRON_RENDERER_URL


export class XFlyWindow {
  readonly base: BaseWindow
  readonly xcloud: WebContentsView
  readonly overlay: WebContentsView
  private overlayVisible = true

  private manualReveal = false

  private signInWindow: BrowserWindow | null = null

  private streaming = false

  onLeftSession?: () => void

  setStreaming(v: boolean): void {
    this.streaming = v
  }

  constructor() {
    this.base = new BaseWindow({
      width: 1280,
      height: 800,
      minWidth: 960,
      minHeight: 600,
      backgroundColor: '#000000',
      show: false,
      frame: false,
      titleBarStyle: 'hidden',



      fullscreen: true,
    })




    const ua = settings.get(HAS_ACCOUNT as never) ? TIZEN_TV_USER_AGENT : EDGE_DESKTOP_USER_AGENT
    setupXboxSession(ua)


    this.xcloud = new WebContentsView({
      webPreferences: {
        partition: XBOX_PARTITION,
        preload: join(__dirname, '../preload/engine.cjs'),
        contextIsolation: false, // engine must patch the page's main world
        nodeIntegration: false,
        sandbox: false,
        backgroundThrottling: false,
        webgl: true,
        autoplayPolicy: 'no-user-gesture-required',
      },
    })
    this.xcloud.setBackgroundColor('#000000')

    this.xcloud.webContents.setUserAgent(ua)


    this.overlay = new WebContentsView({
      webPreferences: {
        preload: join(__dirname, '../preload/index.cjs'),
        contextIsolation: true,
        nodeIntegration: false,


        sandbox: false,
        transparent: true,
        // The launcher's own sounds (startup swell, moves) should be able to play the
        // moment the window opens, before any click reaches this view.
        autoplayPolicy: 'no-user-gesture-required',
      },
    })
    this.overlay.setBackgroundColor('#00000000')

    this.base.contentView.addChildView(this.xcloud)
    this.base.contentView.addChildView(this.overlay)

    this.layout()
    this.base.on('resize', () => this.layout())


    this.xcloud.webContents.setWindowOpenHandler(({ url }) => {
      const external =
        !url.startsWith('https://www.xbox.com') && !url.includes('login.live.com') && !url.includes('microsoft')




      diagWrite('view', `page asked to open a window: ${redactUrl(url)} — ${external ? 'sent to the browser' : 'allowed in-app'}`)
      if (external) {
        shell.openExternal(url)
        return { action: 'deny' }
      }
      return { action: 'allow' }
    })


    this.xcloud.webContents.on('console-message', (_e, level, message, line, source) => {


      if (level < 2) return
      const where = source ? ` (${redactUrl(source)}:${line})` : ''
      diagWrite('page', `${level === 3 ? 'error' : 'warn'}: ${message}${where}`)
    })
    this.xcloud.webContents.on('render-process-gone', (_e, details) =>
      diagWrite('page', `RENDERER GONE: ${details.reason} (exit ${details.exitCode})`),
    )
    // The launcher UI is a separate renderer, so its console does not reach here on its
    // own. Forward just the diagnostic lines it deliberately prints.
    this.overlay.webContents.on('console-message', (_e, _level, message) => {
      if (message.includes('[XFLY-LAYOUT]') || message.includes('[XFLY-RIG]')) diagWrite('ui', message)
    })
    this.xcloud.webContents.on('unresponsive', () => diagWrite('page', 'renderer unresponsive'))





    const guardNavigation = (url: string): void => {

      diagWrite('nav', redactUrl(url))


      if (this.manualReveal) return


      const path = url.replace(/^https:\/\/[^/]+/, '').split('?')[0]
      if (/\/play\/?$/.test(path)) {
        this.showOverlay()
        if (this.streaming) this.onLeftSession?.()
        return
      }

      if (this.streaming) return
      if (!/\/launch\//.test(url)) this.showOverlay()
    }
    this.xcloud.webContents.on('did-navigate', (_e, url) => guardNavigation(url))
    this.xcloud.webContents.on('did-navigate-in-page', (_e, url) => guardNavigation(url))





    this.xcloud.webContents.on('did-finish-load', () => this.announceVisibility())



    this.xcloud.webContents.on('did-fail-load', (_e, code, desc, url) =>
      diagWrite('nav', `FAILED ${code} ${desc} ${redactUrl(url)}`),
    )


    this.xcloud.webContents.on('before-input-event', (_e, input) => {
      if (input.type === 'keyDown' && (input.key === 'F8' || (input.key === 'Escape' && input.shift))) {
        this.isOverlayVisible ? this.hideOverlay() : this.showOverlay()
      }
    })

    void this.xcloud.webContents.loadURL(XBOX_PLAY_URL)

    if (isDev) {
      void this.overlay.webContents.loadURL(process.env.ELECTRON_RENDERER_URL as string)
    } else {
      void this.overlay.webContents.loadFile(join(__dirname, '../renderer/index.html'))
    }

    this.overlay.webContents.once('did-finish-load', () => {
      this.base.show()

      this.overlay.webContents.focus()
      this.announceVisibility()
    })
  }

  private layout(): void {
    const { width, height } = this.base.getContentBounds()
    this.xcloud.setBounds({ x: 0, y: 0, width, height })
    this.overlay.setBounds({ x: 0, y: 0, width, height })
  }


  private async applyUserAgent(ua: string): Promise<boolean> {
    if (xboxUserAgent() === ua) return false
    setXboxUserAgent(ua)
    this.xcloud.webContents.setUserAgent(ua)
    await this.xcloud.webContents.loadURL(XBOX_PLAY_URL).catch(() => {})
    return true
  }


  async beginSignIn(): Promise<void> {
    if (this.signInWindow && !this.signInWindow.isDestroyed()) {
      this.signInWindow.focus()
      return
    }

    const w = new BrowserWindow({
      width: 520,
      height: 760,
      show: false,
      autoHideMenuBar: true,

      backgroundColor: '#141414',
      title: 'Sign in',
      webPreferences: {


        partition: XBOX_PARTITION,


        contextIsolation: true,
        nodeIntegration: false,
      },
    })
    this.signInWindow = w
    w.setMenu(null)


    w.webContents.setUserAgent(EDGE_DESKTOP_USER_AGENT)


    const watch = (url: string): void => {
      diagWrite('signin', redactUrl(url))
      if (!/^https:\/\/www\.xbox\.com\//i.test(url)) return
      if (/\/auth\/msa/i.test(url)) return
      diagWrite('signin', 'back on xbox.com — closing the sign-in window')
      w.close()
    }
    w.webContents.on('did-navigate', (_e, url) => watch(url))
    w.webContents.on('did-navigate-in-page', (_e, url) => watch(url))
    w.webContents.on('did-fail-load', (_e, code, desc, url) =>
      diagWrite('signin', `FAILED ${code} ${desc} ${redactUrl(url)}`),
    )

    w.on('closed', () => {
      this.signInWindow = null

      diagWrite('signin', 'window closed — reloading the embedded view')
      void this.xcloud.webContents.loadURL(XBOX_PLAY_URL).catch(() => {})
    })

    w.once('ready-to-show', () => {
      w.show()
      w.focus()
    })


    const origin = XBOX_PLAY_URL.replace(/\/[a-z]{2}-[A-Z]{2}\/play\/?$|\/play\/?$/, '')
    await w
      .loadURL(`${origin}/auth/msa?action=logIn&returnUrl=${encodeURIComponent(XBOX_PLAY_URL)}`)
      .catch((e) => diagWrite('signin', `load failed: ${e}`))
  }


  async onSignedIn(): Promise<void> {
    settings.set(HAS_ACCOUNT as never, true as never)
    if (await this.applyUserAgent(TIZEN_TV_USER_AGENT)) {
      diagWrite('auth', 'signed in — reloading as a TV')
    }
  }


  async signOut(): Promise<void> {
    settings.set(HAS_ACCOUNT as never, false as never)
    this.showOverlay()
    await clearXboxSession()

    if (!(await this.applyUserAgent(EDGE_DESKTOP_USER_AGENT))) {
      await this.xcloud.webContents.loadURL(XBOX_PLAY_URL).catch(() => {})
    }
  }


  private announceVisibility(): void {
    try {
      this.xcloud.webContents.send(IPC.engineCommand, {
        type: 'launcherVisible',
        visible: this.overlayVisible,
      })
    } catch {
      /* the view can be gone during teardown */
    }
  }


  showOverlay(why = ''): void {
    this.manualReveal = false
    if (this.overlayVisible) return
    this.overlayVisible = true
    this.base.contentView.addChildView(this.overlay)
    this.layout()
    this.overlay.webContents.focus()
    diagWrite('view', `launcher shown${why ? ' — ' + why : ''}`)
    this.announceVisibility()
  }


  hideOverlay(manual = false, why = ''): void {
    this.manualReveal = manual
    if (!this.overlayVisible) return
    this.overlayVisible = false
    this.base.contentView.removeChildView(this.overlay)
    this.xcloud.webContents.focus()
    diagWrite('view', `embedded page shown${why ? ' — ' + why : ''}`)
    this.announceVisibility()
  }

  get isOverlayVisible(): boolean {
    return this.overlayVisible
  }

}

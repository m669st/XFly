

export const IPC = {

  windowMinimize: 'window:minimize',
  windowMaximizeToggle: 'window:maximizeToggle',
  windowClose: 'window:close',
  windowIsMaximized: 'window:isMaximized',


  settingsGet: 'settings:get',
  settingsSet: 'settings:set',
  settingsAll: 'settings:all',


  xboxShow: 'xbox:show', // show the stream view (in-game)
  xboxHide: 'xbox:hide', // hide it (back to launcher)
  xboxNavigate: 'xbox:navigate', // navigate the xbox view to a url/deep-link
  xboxReload: 'xbox:reload',
  xboxSetBounds: 'xbox:setBounds',


  authState: 'auth:state', // main -> renderer push, for whatever changes later

  authStateGet: 'auth:state:get',
  authGetProfile: 'auth:getProfile',


  authSignIn: 'auth:signIn',
  authLogout: 'auth:logout',


  apiRequest: 'api:request',


  engineEvent: 'engine:event', // engine -> main -> renderer (stats, stream state)
  engineCommand: 'engine:command', // renderer -> main -> engine (settings, actions)




  diagDump: 'diag:dump',
  diagOpen: 'diag:open',
  diagPath: 'diag:path',


  recordEvent: 'record:event',
  recordOpen: 'record:open',
  recordPath: 'record:path',


  gpuInfo: 'gpu:info',
} as const

export type EngineEvent =
  | { type: 'stream.state'; state: 'loading' | 'starting' | 'playing' | 'ended' }
  /** xCloud's own session state — WaitingForResources means we are queued, not stuck */
  | { type: 'session.state'; state: string }
  | { type: 'stream.stats'; stats: StreamStats }
  | { type: 'session.play'; titleId: string; sessionPath: string }
  | { type: 'sdp'; kind: 'offer' | 'answer'; sdp: string }
  | { type: 'ice'; candidates: string[] }
  | { type: 'log'; level: 'info' | 'warn' | 'error'; msg: string }

export interface StreamStats {
  t: number
  width: number
  height: number
  fps: number
  bitrateMbps: number
  packetsLost: number
  rttMs: number | null
  jitterMs: number
  codec: string
  freezes: number
  bufferbloat: boolean
}

export type EngineCommand =
  | { type: 'applySettings'; settings: Record<string, unknown> }
  | { type: 'setClarity'; boost: number; sharpen: number }
  | { type: 'toggleMic' }
  | { type: 'disconnect' }
  | { type: 'signIn' }
  | { type: 'launch'; productId: string; title: string }
  /**
   * Whether OUR launcher is currently covering the xbox page.
   *
   * Both views are live at the same time and the Gamepad API does not care which
   * one is on top: xbox.com's own SPA was reading the pad while our launcher was
   * over it, navigating its hidden menus and playing its click sounds. Only the
   * surface the user can actually see may have the controller.
   */
  | { type: 'launcherVisible'; visible: boolean }


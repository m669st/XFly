import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc'


const api = {

  minimize: () => ipcRenderer.send(IPC.windowMinimize),
  maximizeToggle: () => ipcRenderer.send(IPC.windowMaximizeToggle),
  close: () => ipcRenderer.send(IPC.windowClose),
  isMaximized: () => ipcRenderer.invoke(IPC.windowIsMaximized) as Promise<boolean>,


  getSettings: () => ipcRenderer.invoke(IPC.settingsAll) as Promise<Record<string, unknown>>,
  setSetting: (key: string, value: unknown) => ipcRenderer.invoke(IPC.settingsSet, key, value) as Promise<Record<string, unknown>>,


  showStream: () => ipcRenderer.send(IPC.xboxShow),
  showLauncher: () => ipcRenderer.send(IPC.xboxHide),
  navigateXbox: (url: string) => ipcRenderer.send(IPC.xboxNavigate, url),
  reloadXbox: () => ipcRenderer.send(IPC.xboxReload),


  getProfile: () => ipcRenderer.invoke(IPC.authGetProfile),
  signIn: () => ipcRenderer.send(IPC.authSignIn),
  signOut: () => ipcRenderer.invoke(IPC.authLogout) as Promise<void>,
  onAuthState: (cb: (state: unknown) => void) => {
    const l = (_e: unknown, s: unknown) => cb(s)
    ipcRenderer.on(IPC.authState, l)
    return () => ipcRenderer.removeListener(IPC.authState, l)
  },

  authState: () =>
    ipcRenderer.invoke(IPC.authStateGet) as Promise<{
      signedIn: boolean
      profile?: unknown
      resolved: boolean
    }>,


  api: (spec: unknown) => ipcRenderer.invoke(IPC.apiRequest, spec),


  onEngineEvent: (cb: (event: unknown) => void) => {
    const l = (_e: unknown, ev: unknown) => cb(ev)
    ipcRenderer.on(IPC.engineEvent, l)
    return () => ipcRenderer.removeListener(IPC.engineEvent, l)
  },
  engineCommand: (cmd: unknown) => ipcRenderer.send(IPC.engineCommand, cmd),




  dumpLog: () => ipcRenderer.invoke(IPC.diagDump) as Promise<string>,
  openLog: () => ipcRenderer.send(IPC.diagOpen),
  logPath: () => ipcRenderer.invoke(IPC.diagPath) as Promise<string>,


  openRecording: () => ipcRenderer.send(IPC.recordOpen),
  recordingStats: () => ipcRenderer.invoke(IPC.recordPath) as Promise<{ path: string; lines: number }>,


  gpu: () =>
    ipcRenderer.invoke(IPC.gpuInfo) as Promise<{
      vendor: 'nvidia' | 'amd' | null
      label: string
      name: string
      driver: string
      idle: boolean
    }>,
}

contextBridge.exposeInMainWorld('xfly', api)

export type XFlyApi = typeof api

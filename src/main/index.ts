import { app, BrowserWindow } from 'electron'
import { XFlyWindow } from './window'
import { registerIpc } from './ipc'
import { diagInit, diagWrite } from './diag'
import { recordInit } from './recorder'
import { settings } from './settings'
import { initUpdater } from './updater'








app.commandLine.appendSwitch('enable-features', 'WebGPU,CanvasOopRasterization')
app.commandLine.appendSwitch('enable-zero-copy')
app.commandLine.appendSwitch('ignore-gpu-blocklist')
app.commandLine.appendSwitch('enable-accelerated-video-decode')






app.commandLine.appendSwitch('force_high_performance_gpu')


app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion')
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows')

app.setName('XFly')




if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.base.isMinimized()) win.base.restore()
      win.base.focus()
    }
  })
}

let win: XFlyWindow | null = null

app.whenReady().then(() => {
  diagInit()
  recordInit()


  diagWrite('settings', `file: ${settings.path()}`)
  diagWrite('settings', JSON.stringify(settings.all()))
  win = new XFlyWindow()
  registerIpc(win)


  initUpdater()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0 && !win) {
      win = new XFlyWindow()
    }
  })
})

process.on('uncaughtException', (e) => diagWrite('main', `uncaught: ${e?.stack || e}`))
process.on('unhandledRejection', (e) => diagWrite('main', `unhandled rejection: ${e}`))

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})


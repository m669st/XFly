import React from 'react'
import ReactDOM from 'react-dom/client'
import { init } from '@noriginmedia/norigin-spatial-navigation'
import App from './App'
import { useStore } from './store'
import { productsToTiles } from './lib/xbox'
import { startGamepadNavigation } from './lib/gamepad'
import './styles.css'

init({ debug: false, visualDebug: false })
startGamepadNavigation()

function connect(): void {
  if (!window.xfly) {
    // eslint-disable-next-line no-console
    console.error('[XFly] preload bridge (window.xfly) missing')
    return
  }
  const applyAuth = (s: any): void => {
    if (!s?.resolved) return
    const store = useStore.getState()
    store.setAuth(!!s.signedIn, null)
    if (s.signedIn && s.profile) store.mergeProfile(s.profile)
  }

  window.xfly.onAuthState(applyAuth)
  void window.xfly
    .authState()
    .then(applyAuth)
    .catch(() => {})
  window.xfly.onEngineEvent((ev: any) => {
    if (!ev) return
    if (ev.type === 'stream.state') useStore.getState().setStreamState(ev.state)
    else if (ev.type === 'menu.toggle') useStore.getState().toggleHud()
    else if (ev.type === 'waittime') useStore.getState().setWaitSeconds(ev.seconds)
    else if (ev.type === 'session.state') useStore.getState().setSessionState(ev.state)
    else if (ev.type === 'regions' && Array.isArray(ev.regions)) useStore.getState().setRegions(ev.regions)
    else if (ev.type === 'stream.stats') useStore.getState().setStats(ev.stats)
    else if (ev.type === 'catalog' && Array.isArray(ev.products)) {
      useStore.getState().mergeLibrary(productsToTiles(ev.products))
    }
  })
  window.xfly.getSettings().then((s) => useStore.getState().setSettings(s)).catch(() => {})
}

function render(): void {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
}

if (import.meta.env.DEV && !window.xfly) {
  void import('./lib/dev-bridge').then((m) => {
    m.installDevBridge()
    connect()
    render()
  })
} else {
  connect()
  render()
}

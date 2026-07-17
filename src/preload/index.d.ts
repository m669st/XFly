import type { XFlyApi } from './index'

declare global {
  interface Window {
    xfly: XFlyApi
  }
}

export {}

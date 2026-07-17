export function hideXboxChrome(): void {
  const css = `
    /* site chrome */
    header, [class*="Header-module"], [class*="GlobalNav"], [data-testid=" open-guide-button"],
    [class*="MarketingBanner"], [class*="Footer-module"], [class*="CookieBanner"] { display: none !important; }
    /* keep the stream fullscreen + clean */
    body { background: #000 !important; overflow: hidden !important; }
    #game-stream, [data-testid="media-container"], video { background: #000 !important; }
    /* xCloud's in-stream toasts/guide we replace with our own HUD */
    [class*="StreamMenu"], [class*="GuideHud"] { opacity: 0.001 !important; }
    /* the "Go to Streaming settings" bar — the corner badges stay */
    #NQIToast { display: none !important; }
  `
  const style = document.createElement('style')
  style.id = 'xfly-chrome'
  style.textContent = css
  document.documentElement.appendChild(style)
}

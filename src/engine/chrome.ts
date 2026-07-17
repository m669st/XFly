export function hideXboxChrome(): void {
  const css = `
    /* site chrome */
    header, [class*="Header-module"], [class*="GlobalNav"], [data-testid=" open-guide-button"],
    [class*="MarketingBanner"], [class*="Footer-module"], [class*="CookieBanner"] { display: none !important; }
    /* Microsoft's consent bar is none of the above — it is its own widget with its own
       id, which is why hiding "CookieBanner" never touched it. */
    #wcpConsentBannerCtrl, div[class*="wcpConsentBanner"], [id*="ConsentBanner"] { display: none !important; }
    /* keep the stream fullscreen + clean */
    body { background: #000 !important; overflow: hidden !important; }
    #game-stream, [data-testid="media-container"], video { background: #000 !important; }
    /* xCloud's in-stream toasts/guide we replace with our own HUD */
    [class*="StreamMenu"], [class*="GuideHud"] { opacity: 0.001 !important; }
    /* the "Go to Streaming settings" bar — the corner badges stay */
    #NQIToast { display: none !important; }
    /* xCloud's own grip handle, top-left in the stream. XFly's menu replaces it, and
       two menus over one game is one too many.

       Gone, not hidden: hiding it left the button sitting there, still clickable and
       still free to open itself on launch — an invisible thing that swallows clicks is
       worse than a visible one. Matched without a #StreamHud prefix and on class*=
       rather than class^=, because it turned up outside that container too. */
    button[class*="GripHandle-module"],
    div[class*="Grip-module__container"] { display: none !important; }
    #StreamHud div[class*="StreamHUD-module__buttonsContainer"] { padding: 0 !important; }
  `
  if (document.getElementById('xfly-chrome')) return

  const style = document.createElement('style')
  style.id = 'xfly-chrome'
  style.textContent = css

  // This runs before the document exists, which is the whole point — but that also
  // means there may be nothing to append to yet.
  const attach = (): void => void (document.head ?? document.documentElement)?.appendChild(style)
  if (document.documentElement) attach()
  else document.addEventListener('DOMContentLoaded', attach, { once: true })
}

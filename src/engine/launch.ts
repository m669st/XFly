import { log, emit } from './state'
import { XBOX_PLAY_URL } from '../shared/constants'

export function productTitleToSlug(title: string): string {
  return title
    .replace(/[;,/?:@&=+_`~$%#^*()!^™\xae\xa9]/g, '')
    .replace(/ {2,}/g, ' ')
    .trim()
    .substring(0, 50)
    .replace(/ /g, '-')
    .toLowerCase()
}

export function launchTitle(productId: string, title: string): void {
  let corrected = false

  const clickTo = (slug: string): boolean => {
    const $page = document.getElementById('PageContent')
    if (!$page) return false
    const m = window.location.href.match(/^(https:\/\/[^/]+\/[a-zA-Z]{2}-[a-zA-Z]{2}\/play)/)
    const base = m ? m[1] : window.location.origin + '/en-US/play'
    const url = `${base}/launch/${slug}/${productId}`

    const a = document.createElement('a')
    a.href = url
    a.style.cssText = 'position:absolute;left:-9999px;width:1px;height:1px;opacity:0'
    $page.appendChild(a)
    a.click()
    setTimeout(() => a.remove(), 1000)
    log('info', `launch -> ${url}`)

    setTimeout(() => verify(), 4000)
    return true
  }

  const giveUp = (why: string, reason: 'notLaunchable' | 'notCloudPlayable' = 'notLaunchable'): void => {
    log('warn', `launch: giving up — ${why}`)
    emit({ type: 'play.denied', reason })
    // Off the dead page so the next pick starts clean.
    setTimeout(() => location.assign(XBOX_PLAY_URL), 200)
  }

  const clickPlay = (): boolean => {
    // The store page's own Play button, not the "Xbox Play Anywhere" label or a nav
    // link — an exact-text, actually-visible button.
    const play = Array.from(document.querySelectorAll('button, a')).find(
      (b) => (b as HTMLElement).textContent?.trim() === 'Play' && (b as HTMLElement).offsetParent !== null,
    ) as HTMLElement | undefined
    if (!play) return false
    log('info', 'launch: on the game page — pressing its Play button')
    play.click()
    return true
  }

  const verify = (): void => {
    const here = decodeURIComponent(window.location.pathname)
    if (here.includes('/launch/') && here.includes(productId)) {
      log('info', `launch check: router accepted — at ${here}`)
      const err = document.querySelector('[class*="ErrorScreen"], [class*="error-screen"], [data-testid*="error"]')
      if (err) log('warn', `launch: error screen — ${(err as HTMLElement).innerText?.slice(0, 200)}`)
      return
    }

    // Routed to the game's store page instead of streaming. Two reasons land here:
    // a slug the router rewrote (retry with its own), or a title that can't launch
    // directly and needs its Play button pressed (older store ids, verified live on
    // theHunter). Try the router slug first, then the Play button, then give up
    // rather than leaving the user on a page that never becomes a game.
    const m = here.match(/\/play\/games\/([^/]+)\/([^/]+)/)
    if (m && m[2] === productId) {
      // The store page says outright when a game will never stream — "not Cloud
      // playable … not currently supported on Xbox Cloud Gaming, even if you purchase
      // the game" (seen on theHunter). No point pressing Play; tell the user why.
      if (/not\s+cloud\s+playable|not\s+currently\s+supported\s+on\s+xbox\s+cloud/i.test(document.body.innerText || '')) {
        giveUp('title is not cloud playable', 'notCloudPlayable')
        return
      }
      if (!corrected) {
        corrected = true
        if (m[1] !== slug) {
          log('warn', `launch: slug rejected; router's own is "${m[1]}" — retrying`)
          clickTo(m[1])
        } else if (!clickPlay()) {
          giveUp('no Play button on the game page')
          return
        }
        setTimeout(() => verify(), 5000)
        return
      }
      // Been here once already: the retry or the Play press did not start a stream.
      if (!clickPlay()) giveUp('game page did not start a stream')
      return
    }
    log('warn', `launch check: ROUTER DID NOT NAVIGATE — at ${here}`)
    giveUp('router did not navigate')
  }

  const slug = productTitleToSlug(title || 'game')
  if (clickTo(slug)) return
  let n = 0
  const iv = setInterval(() => {
    if (clickTo(slug) || ++n > 40) clearInterval(iv)
  }, 250)
}

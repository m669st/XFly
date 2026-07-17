import { log } from './state'

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

  const verify = (): void => {
    const here = decodeURIComponent(window.location.pathname)
    if (here.includes('/launch/') && here.includes(productId)) {
      log('info', `launch check: router accepted — at ${here}`)
      const err = document.querySelector('[class*="ErrorScreen"], [class*="error-screen"], [data-testid*="error"]')
      if (err) log('warn', `launch: error screen — ${(err as HTMLElement).innerText?.slice(0, 200)}`)
      return
    }

    const m = here.match(/\/play\/games\/([^/]+)\/([^/]+)/)
    if (m && m[2] === productId && !corrected) {
      corrected = true
      log('warn', `launch: slug rejected; router's own is "${m[1]}" — retrying`)
      clickTo(m[1])
      return
    }
    log('warn', `launch check: ROUTER DID NOT NAVIGATE — at ${here}`)
  }

  const slug = productTitleToSlug(title || 'game')
  if (clickTo(slug)) return
  let n = 0
  const iv = setInterval(() => {
    if (clickTo(slug) || ++n > 40) clearInterval(iv)
  }, 250)
}

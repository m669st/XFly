import { log } from './state'

export function autoSignIn(): void {
  if (localStorage.getItem('xboxcom_xbl_user_info')) return

  const findButton = (): HTMLElement | null => {
    const selectors = [
      'a[href*="login.live.com"]',
      'a[href*="/auth/msa"]',
      '[data-testid*="signin" i]',
      '[aria-label*="sign in" i]',
    ]
    for (const s of selectors) {
      const el = document.querySelector<HTMLElement>(s)
      if (el) return el
    }
    const clickables = Array.from(document.querySelectorAll<HTMLElement>('button, a, [role="button"]'))
    return (
      clickables.find((el) => /^\s*sign in\s*$/i.test(el.textContent || '') || /giriş/i.test(el.textContent || '')) || null
    )
  }

  let tries = 0
  const iv = setInterval(() => {
    if (localStorage.getItem('xboxcom_xbl_user_info')) {
      clearInterval(iv)
      return
    }
    const btn = findButton()
    if (btn) {
      clearInterval(iv)
      log('info', 'auto-clicking xCloud sign-in')
      btn.click()
    } else if (++tries > 20) {
      clearInterval(iv)
      log('warn', 'sign-in button not found; user must click it manually')
    }
  }, 500)
}

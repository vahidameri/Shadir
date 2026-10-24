// Text direction by content: anything with a Persian/Arabic letter reads right to left (also when it
// starts with an English word: «API ثبت‌نام با OTP»); text with only Latin letters reads left to
// right; numbers and empty text follow the page.
const FA = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/
const LATIN = /[A-Za-z]/

export function dirOf(v: unknown): 'rtl' | 'ltr' | undefined {
  const s = String(v ?? '')
  if (FA.test(s)) return 'rtl'
  if (LATIN.test(s)) return 'ltr'
  return undefined
}

/**
 * Typing fields follow what is typed: every text input and textarea without a fixed direction gets
 * one from its value, as it is typed and when it appears with a value. Fields that set dir themselves
 * (addresses, codes) keep theirs.
 */
export function autoDirFields(root: Document = document) {
  const typed = (el: Element): el is HTMLInputElement | HTMLTextAreaElement =>
    el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && /^(text|search|)$/.test(el.type))
  const apply = (el: Element) => {
    if (!typed(el)) return
    if (el.hasAttribute('dir') && !el.dataset.autodir) return
    const d = dirOf(el.value || el.placeholder)
    el.dataset.autodir = '1'
    if (d) el.setAttribute('dir', d)
    else el.removeAttribute('dir')
  }
  const scan = (n: Node) => {
    if (!(n instanceof Element)) return
    apply(n)
    n.querySelectorAll('input, textarea').forEach(apply)
  }
  root.addEventListener('input', (e) => e.target instanceof Element && apply(e.target), true)
  root.addEventListener('focusin', (e) => e.target instanceof Element && apply(e.target), true)
  new MutationObserver((list) => list.forEach((m) => m.addedNodes.forEach(scan))).observe(root.body, { childList: true, subtree: true })
  scan(root.body)
}

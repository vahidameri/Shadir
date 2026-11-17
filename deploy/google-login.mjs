import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { OAuth2Client } from 'google-auth-library'

export const googleCookie = '__Host-madar-google'
const lifetime = 30 * 60_000
const random = () => randomBytes(24).toString('hex')
const browserKey = /^[0-9a-f]{48}$/

export function createGoogleSignIn(clientId, verify, now = Date.now) {
  const secret = randomBytes(32)
  const used = new Map()
  const client = new OAuth2Client({ transporterOptions: { timeout: 5000 } })
  const verifyToken = verify || (async idToken =>
    (await client.verifyIdToken({ idToken, audience: clientId })).getPayload())
  const sign = (body, browser) => createHmac('sha256', secret).update(body + '.' + browser).digest('hex')

  return {
    challenge(cookie) {
      const browser = browserKey.test(cookie || '') ? cookie : random()
      const body = (now() + lifetime) + '.' + random()
      return { browser, nonce: body + '.' + sign(body, browser) }
    },

    async identity(credential, browser, nonce) {
      if (typeof credential !== 'string' || credential.length > 8192 ||
          !/^[\w-]+\.[\w-]+\.[\w-]+$/.test(credential) ||
          !browserKey.test(browser || '') || typeof nonce !== 'string') return null
      const m = /^(\d{13}\.[0-9a-f]{48})\.([0-9a-f]{64})$/.exec(nonce)
      if (!m || !timingSafeEqual(Buffer.from(m[2]), Buffer.from(sign(m[1], browser)))) return null
      const expires = Number(m[1].split('.')[0])
      if (expires <= now() || used.has(nonce)) return null
      let claims
      try { claims = await verifyToken(credential) } catch { return null }
      if (!claims || claims.nonce !== nonce || claims.email_verified !== true ||
          typeof claims.sub !== 'string' || !claims.sub || claims.sub.length > 255 ||
          typeof claims.exp !== 'number' || claims.exp * 1000 <= now()) return null
      const email = typeof claims.email === 'string' ? claims.email.toLowerCase() : ''
      // Google is authoritative for Gmail and for accounts with a hosted Workspace domain.
      const workspace = typeof claims.hd === 'string' && !!claims.hd
      if (!/^[^\s@]+@[^\s@]+$/.test(email) || !(email.endsWith('@gmail.com') || workspace)) return null
      const time = now()
      for (const [key, until] of used) if (until <= time) used.delete(key)
      if (expires <= time || used.has(nonce) || used.size >= 4000) return null
      used.set(nonce, expires)
      return { email, sub: claims.sub }
    },
  }
}

export function openGoogleSession(app, properties, { email, sub }) {
  const members = (app.rawAll_().Team || []).filter(m =>
    String(m.active).toLowerCase() !== 'false' && String(m.email || '').trim().toLowerCase() === email)
  if (members.length !== 1 || !members[0].id) return { ok: false }
  const id = members[0].id
  const key = 'GOOGLE_SUB.' + id
  const linkedSubject = properties.getProperty(key)
  if (linkedSubject && linkedSubject !== sub) return { ok: false }
  if (!linkedSubject) properties.setProperty(key, sub)
  return app.newSession_(email, id)
}

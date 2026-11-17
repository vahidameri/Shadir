import assert from 'node:assert/strict'
import { generateKeyPairSync, sign } from 'node:crypto'
import { test } from 'node:test'
import { OAuth2Client } from 'google-auth-library'
import { createGoogleSignIn, openGoogleSession } from './google-login.mjs'

const audience = '12345678-ci.apps.googleusercontent.com'
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const client = new OAuth2Client()
client.getFederatedSignonCertsAsync = async () => ({
  certs: { test: publicKey.export({ type: 'spki', format: 'pem' }) }, format: 'PEM',
})
const verify = async idToken => (await client.verifyIdToken({ idToken, audience })).getPayload()
const b64 = value => Buffer.from(JSON.stringify(value)).toString('base64url')
function credential(nonce, overrides) {
  const payload = {
    iss: 'https://accounts.google.com', aud: audience, sub: 'test-sub', nonce,
    iat: Math.floor(Date.now() / 1000) - 1, exp: Math.floor(Date.now() / 1000) + 120,
    email: 'TEST@gmail.com', email_verified: true, ...overrides,
  }
  const jwt = b64({ alg: 'RS256', kid: 'test' }) + '.' + b64(payload)
  return jwt + '.' + sign('sha256', Buffer.from(jwt), privateKey).toString('base64url')
}

test('accepts a valid credential once for the browser that started sign-in', async () => {
  const auth = createGoogleSignIn(audience, verify)
  const { nonce, browser } = auth.challenge()
  const token = credential(nonce)
  assert.notEqual(auth.challenge(browser).nonce, nonce)
  assert.equal(await auth.identity(token, auth.challenge().browser, nonce), null)
  const results = await Promise.all([auth.identity(token, browser, nonce), auth.identity(token, browser, nonce)])
  assert.equal(results.filter(Boolean).length, 1)
  assert.deepEqual(results.find(Boolean), { email: 'test@gmail.com', sub: 'test-sub' })
})

test('rejects incorrect signature, audience, issuer, expiration, nonce and untrusted email', async () => {
  const auth = createGoogleSignIn(audience, verify)
  const { nonce, browser } = auth.challenge()
  const signed = credential(nonce)
  assert.equal(await auth.identity(signed.replace(/\.[^.]+$/, '.bogus'), browser, nonce), null)
  for (const overrides of [
    { aud: 'other-client' }, { iss: 'https://example.com' }, { exp: 1 },
    { exp: Math.floor(Date.now() / 1000) - 1 }, { nonce: 'other-nonce' },
    { email_verified: false }, { email: 'test@example.test' },
  ]) assert.equal(await auth.identity(credential(nonce, overrides), browser, nonce), null)
  assert.deepEqual(
    await auth.identity(credential(nonce, { email: 'test@example.test', hd: 'example.test' }), browser, nonce),
    { email: 'test@example.test', sub: 'test-sub' },
  )
})

test('rejects a challenge after its expiry', async () => {
  let now = Date.now()
  const auth = createGoogleSignIn(audience, verify, () => now)
  const { nonce, browser } = auth.challenge()
  now += 31 * 60_000
  assert.equal(await auth.identity(credential(nonce), browser, nonce), null)
})

test('only the matching active member can obtain a session; link is stable', () => {
  const member = { id: 'a', active: 'true', email: 'Test@gmail.com' }
  let team = [member]
  const values = new Map()
  const properties = {
    getProperty: key => values.get(key),
    setProperty: (key, value) => values.set(key, value),
  }
  const app = {
    rawAll_: () => ({ Team: team }),
    newSession_: (email, memberId) => ({ ok: true, email, memberId }),
  }
  const identity = { email: 'test@gmail.com', sub: 'test-sub' }
  assert.equal(openGoogleSession(app, properties, { ...identity, email: 'unknown@gmail.com' }).ok, false)
  team = [{ ...member, active: false }]
  assert.equal(openGoogleSession(app, properties, identity).ok, false)
  team = [member, { ...member, id: 'duplicate' }]
  assert.equal(openGoogleSession(app, properties, identity).ok, false)
  assert.equal(values.size, 0)
  team = [member]
  assert.equal(openGoogleSession(app, properties, identity).memberId, 'a')
  assert.equal(openGoogleSession(app, properties, identity).ok, true)
  assert.equal(openGoogleSession(app, properties, { ...identity, sub: 'different' }).ok, false)
  assert.equal(values.get('GOOGLE_SUB.a'), identity.sub)
})

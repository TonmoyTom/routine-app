/**
 * Web Push, written against Web Crypto so it runs unmodified on Deno Edge.
 *
 * `npm:web-push` assumes Node's `crypto` and `https`, and its AES-GCM path
 * breaks under Deno — the function dies at import with an opaque
 * WORKER_ERROR. This is the same protocol with no dependencies:
 *
 *   RFC 8291 — payload encryption, aes128gcm
 *   RFC 8292 — VAPID authentication
 */

export interface PushSubscription {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

export interface VapidDetails {
  subject: string
  publicKey: string
  privateKey: string
}

export class PushError extends Error {
  constructor(message: string, readonly statusCode: number) {
    super(message)
  }
}

// ------------------------------------------------------------ base64url

const b64urlToBytes = (s: string): Uint8Array => {
  const padded = (s + '='.repeat((4 - (s.length % 4)) % 4))
    .replace(/-/g, '+')
    .replace(/_/g, '/')
  const raw = atob(padded)
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

const bytesToB64url = (b: Uint8Array): string =>
  btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

const concat = (...parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}

const utf8 = (s: string) => new TextEncoder().encode(s)

// ------------------------------------------------------------------ hkdf

async function hmac(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey(
    'raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data))
}

/** one-block HKDF — every output here is 32 bytes or fewer */
async function hkdf(
  salt: Uint8Array,
  ikm: Uint8Array,
  info: Uint8Array,
  length: number
): Promise<Uint8Array> {
  const prk = await hmac(salt, ikm)
  const okm = await hmac(prk, concat(info, Uint8Array.of(1)))
  return okm.slice(0, length)
}

// ----------------------------------------------------------------- vapid

/**
 * The VAPID keys are raw P-256 values. Web Crypto wants a JWK, so the public
 * key's uncompressed 65 bytes are split into x and y.
 */
async function importVapidKey(publicKey: string, privateKey: string) {
  const pub = b64urlToBytes(publicKey)
  if (pub.length !== 65 || pub[0] !== 0x04) {
    throw new Error('VAPID public key must be 65 uncompressed bytes')
  }
  return crypto.subtle.importKey(
    'jwk',
    {
      kty: 'EC',
      crv: 'P-256',
      x: bytesToB64url(pub.slice(1, 33)),
      y: bytesToB64url(pub.slice(33, 65)),
      d: privateKey.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
      ext: true
    },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  )
}

async function vapidHeader(endpoint: string, v: VapidDetails): Promise<string> {
  const aud = new URL(endpoint).origin
  const header = bytesToB64url(utf8(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const body = bytesToB64url(
    utf8(
      JSON.stringify({
        aud,
        exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
        sub: v.subject
      })
    )
  )

  const key = await importVapidKey(v.publicKey, v.privateKey)
  // Web Crypto returns the raw r||s form, which is what JWS ES256 wants
  const sig = new Uint8Array(
    await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      utf8(`${header}.${body}`)
    )
  )

  return `vapid t=${header}.${body}.${bytesToB64url(sig)}, k=${v.publicKey}`
}

// ------------------------------------------------------------- encryption

async function encrypt(
  payload: string,
  p256dh: string,
  authSecret: string
): Promise<Uint8Array> {
  const uaPublic = b64urlToBytes(p256dh)
  const auth = b64urlToBytes(authSecret)

  // an ephemeral keypair per message, as the spec requires
  const as = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits']
  )
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', as.publicKey))

  const uaKey = await crypto.subtle.importKey(
    'raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []
  )
  const shared = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, as.privateKey, 256)
  )

  // RFC 8291 §3.4 — the auth secret salts the shared secret, and the info
  // string binds both public keys into the derivation
  const keyInfo = concat(utf8('WebPush: info\0'), uaPublic, asPublic)
  const ikm = await hkdf(auth, shared, keyInfo, 32)

  const salt = crypto.getRandomValues(new Uint8Array(16))
  const cek = await hkdf(salt, ikm, utf8('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(salt, ikm, utf8('Content-Encoding: nonce\0'), 12)

  const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt'])
  // 0x02 is the padding delimiter for a final record
  const plaintext = concat(utf8(payload), Uint8Array.of(2))
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, plaintext)
  )

  // header: salt(16) | record size(4) | key id length(1) | key id(65)
  const rs = new Uint8Array(4)
  new DataView(rs.buffer).setUint32(0, 4096)
  return concat(salt, rs, Uint8Array.of(asPublic.length), asPublic, ciphertext)
}

// ---------------------------------------------------------------- send

export async function sendNotification(
  subscription: PushSubscription,
  payload: string,
  vapid: VapidDetails,
  ttl = 86400
): Promise<void> {
  const body = await encrypt(payload, subscription.keys.p256dh, subscription.keys.auth)

  const res = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidHeader(subscription.endpoint, vapid),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(body.length),
      TTL: String(ttl),
      Urgency: 'normal'
    },
    body
  })

  if (!res.ok) {
    throw new PushError(
      `${res.status} ${await res.text().catch(() => '')}`.trim(),
      res.status
    )
  }
}

/** sanity check for the keys without contacting a push service */
export async function checkVapid(v: VapidDetails): Promise<void> {
  await vapidHeader('https://example.com/x', v)
}

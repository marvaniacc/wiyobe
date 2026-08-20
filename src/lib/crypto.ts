import crypto from 'crypto'

function secretKey(): Buffer {
  const secret = process.env.AUTH_SECRET || 'dev-secret'
  return crypto.createHash('sha256').update(secret).digest()
}

// OTP codes are stored hashed — the plaintext code never touches the DB.
export function hashOtpCode(code: string): string {
  return crypto.createHmac('sha256', process.env.AUTH_SECRET || 'dev-secret').update(code).digest('hex')
}

// Sensitive payloads (e.g. signupData with a password) are AES-256-GCM encrypted
// before storage. Hashing alone is impossible here: the data must be recovered
// at verify time to create the account.
export function encryptPayload(plain: string): string {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', secretKey(), iv)
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('base64')}.${tag.toString('base64')}.${enc.toString('base64')}`
}

export function decryptPayload(token: string): string {
  const [ivB64, tagB64, dataB64] = token.split('.')
  const decipher = crypto.createDecipheriv('aes-256-gcm', secretKey(), Buffer.from(ivB64, 'base64'))
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8')
}
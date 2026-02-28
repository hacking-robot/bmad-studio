// GitHub token manager - encrypts/decrypts PAT tokens using Electron's safeStorage
// Tokens are stored encrypted in the app settings file

import { safeStorage } from 'electron'

/**
 * Encrypt a token string using Electron's safeStorage (OS keychain integration).
 * Returns a base64-encoded encrypted string suitable for JSON storage.
 */
export function encryptToken(token: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    // Fallback: store as base64 (not truly secure, but functional)
    return Buffer.from(token, 'utf-8').toString('base64')
  }
  const encrypted = safeStorage.encryptString(token)
  return encrypted.toString('base64')
}

/**
 * Decrypt a base64-encoded encrypted token back to plaintext.
 */
export function decryptToken(encryptedBase64: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    // Fallback: decode base64
    return Buffer.from(encryptedBase64, 'base64').toString('utf-8')
  }
  const buffer = Buffer.from(encryptedBase64, 'base64')
  return safeStorage.decryptString(buffer)
}

/**
 * Inject a token into an HTTPS git URL for authentication.
 * Converts: https://github.com/user/repo.git
 *       To: https://oauth2:<token>@github.com/user/repo.git
 *
 * SSH URLs and non-HTTPS URLs are returned unchanged.
 */
export function injectTokenIntoUrl(url: string, token: string): string {
  // Only inject into HTTPS URLs
  if (!url.startsWith('https://')) {
    return url
  }

  try {
    const parsed = new URL(url)
    parsed.username = 'oauth2'
    parsed.password = token
    return parsed.toString()
  } catch {
    // Malformed URL — return as-is
    return url
  }
}

/**
 * Given an encrypted token (base64) and a URL, decrypt and inject.
 * Returns the original URL if no token or decryption fails.
 */
export function getAuthenticatedUrl(url: string, encryptedToken: string | null): string {
  if (!encryptedToken) return url
  if (!url.startsWith('https://')) return url

  try {
    const token = decryptToken(encryptedToken)
    if (!token) return url
    return injectTokenIntoUrl(url, token)
  } catch {
    return url
  }
}

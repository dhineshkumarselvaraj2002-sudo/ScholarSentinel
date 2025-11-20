/**
 * Rate Limiting Utility for Web Search API
 * 
 * Tracks searches per IP address and enforces limits:
 * - Maximum 10 searches per hour per IP
 * - Configurable limits via environment variables
 */

interface RateLimitEntry {
  count: number
  resetAt: number  // Timestamp when limit resets
  firstSearchAt: number  // Timestamp of first search in current window
}

// In-memory store (for production, use Redis or database)
const rateLimitStore = new Map<string, RateLimitEntry>()

// Configuration
const MAX_SEARCHES_PER_HOUR = parseInt(process.env.MAX_SEARCHES_PER_HOUR || '10', 10)
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000  // 1 hour in milliseconds
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000  // Clean up expired entries every 5 minutes

/**
 * Get client IP address from request
 */
export function getClientIP(request: Request): string {
  // Check various headers for IP (in order of preference)
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    return forwarded.split(',')[0].trim()
  }
  
  const realIP = request.headers.get('x-real-ip')
  if (realIP) {
    return realIP.trim()
  }
  
  const cfConnectingIP = request.headers.get('cf-connecting-ip')
  if (cfConnectingIP) {
    return cfConnectingIP.trim()
  }
  
  // Fallback to a default key (for local development)
  return 'local'
}

/**
 * Check if IP is rate limited
 * 
 * @param ip - Client IP address
 * @returns Object with `allowed` boolean and `remaining` count
 */
export function checkRateLimit(ip: string): {
  allowed: boolean
  remaining: number
  resetAt: number
  error?: string
} {
  const now = Date.now()
  const entry = rateLimitStore.get(ip)
  
  // No entry exists - first request
  if (!entry) {
    const newEntry: RateLimitEntry = {
      count: 1,
      resetAt: now + RATE_LIMIT_WINDOW_MS,
      firstSearchAt: now,
    }
    rateLimitStore.set(ip, newEntry)
    return {
      allowed: true,
      remaining: MAX_SEARCHES_PER_HOUR - 1,
      resetAt: newEntry.resetAt,
    }
  }
  
  // Entry exists - check if window has expired
  if (now > entry.resetAt) {
    // Reset the window
    const newEntry: RateLimitEntry = {
      count: 1,
      resetAt: now + RATE_LIMIT_WINDOW_MS,
      firstSearchAt: now,
    }
    rateLimitStore.set(ip, newEntry)
    return {
      allowed: true,
      remaining: MAX_SEARCHES_PER_HOUR - 1,
      resetAt: newEntry.resetAt,
    }
  }
  
  // Window is still active - check count
  if (entry.count >= MAX_SEARCHES_PER_HOUR) {
    const secondsUntilReset = Math.ceil((entry.resetAt - now) / 1000)
    const minutesUntilReset = Math.ceil(secondsUntilReset / 60)
    
    return {
      allowed: false,
      remaining: 0,
      resetAt: entry.resetAt,
      error: `Rate limit exceeded. Maximum ${MAX_SEARCHES_PER_HOUR} searches per hour. Try again in ${minutesUntilReset} minute(s).`,
    }
  }
  
  // Increment count
  entry.count++
  rateLimitStore.set(ip, entry)
  
  return {
    allowed: true,
    remaining: MAX_SEARCHES_PER_HOUR - entry.count,
    resetAt: entry.resetAt,
  }
}

/**
 * Get rate limit status for an IP (without incrementing)
 */
export function getRateLimitStatus(ip: string): {
  count: number
  remaining: number
  resetAt: number
} {
  const entry = rateLimitStore.get(ip)
  const now = Date.now()
  
  if (!entry || now > entry.resetAt) {
    return {
      count: 0,
      remaining: MAX_SEARCHES_PER_HOUR,
      resetAt: now + RATE_LIMIT_WINDOW_MS,
    }
  }
  
  return {
    count: entry.count,
    remaining: MAX_SEARCHES_PER_HOUR - entry.count,
    resetAt: entry.resetAt,
  }
}

/**
 * Clean up expired entries (should be called periodically)
 */
export function cleanupExpiredEntries(): void {
  const now = Date.now()
  for (const [ip, entry] of rateLimitStore.entries()) {
    if (now > entry.resetAt) {
      rateLimitStore.delete(ip)
    }
  }
}

// Start cleanup interval
if (typeof setInterval !== 'undefined') {
  setInterval(cleanupExpiredEntries, CLEANUP_INTERVAL_MS)
}


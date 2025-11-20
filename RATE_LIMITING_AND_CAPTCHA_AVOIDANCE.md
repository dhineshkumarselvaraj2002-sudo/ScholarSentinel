# Rate Limiting and CAPTCHA Avoidance Guide

This document explains the rate limiting and CAPTCHA avoidance features implemented in the Diagram Checker web search functionality.

## Overview

To prevent Google from blocking automated requests with CAPTCHA, we've implemented:

1. **Rate Limiting**: Maximum 10 searches per hour per IP address
2. **Automatic Delays**: 35-second delays between searches
3. **Bing Fallback**: Automatic fallback to Bing Visual Search when Google CAPTCHA is detected
4. **Anti-Detection Measures**: Enhanced browser fingerprinting and human-like behavior

## Rate Limiting

### Configuration

The rate limiting system is configured in `lib/rate-limit.ts`:

- **Default Limit**: 10 searches per hour per IP
- **Window**: 1 hour (rolling window)
- **Storage**: In-memory (for production, consider Redis)

### Environment Variables

You can configure the rate limit via environment variable:

```bash
# .env.local
MAX_SEARCHES_PER_HOUR=10  # Default: 10
```

### How It Works

1. Each API request checks the client's IP address
2. The system tracks how many searches that IP has made in the last hour
3. If the limit is exceeded, the API returns a `429 Too Many Requests` status
4. The response includes headers indicating when the limit resets

### API Response Headers

When rate limited, the API returns:

```
HTTP/1.1 429 Too Many Requests
X-RateLimit-Limit: 10
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1734567890000
Retry-After: 3600
```

## Automatic Delays

### Client-Side Delays

The frontend (`app/diagram-checker/page.tsx`) automatically adds a **35-second delay** between searches:

```typescript
const DELAY_BETWEEN_SEARCHES_MS = 35000  // 35 seconds
```

This delay:
- Only applies after the first search
- Shows a toast notification to the user
- Prevents rapid-fire requests that trigger CAPTCHA

### Server-Side Delays

The API route also supports a `delay` parameter that can be passed from the client:

```typescript
body: JSON.stringify({
  imagePath: image.path,
  engine: 'google',
  headless: true,
  delay: 35000,  // Optional: server-side delay
})
```

## Bing Fallback

When Google CAPTCHA is detected, the system automatically tries Bing Visual Search as an alternative:

```typescript
const USE_BING_AS_FALLBACK = true  // Enable/disable fallback
```

### How It Works

1. If Google search returns a CAPTCHA error
2. The system automatically attempts Bing Visual Search
3. If Bing succeeds, results are used instead
4. If both fail, the error is reported to the user

## Anti-Detection Measures

The Playwright script (`scripts/playwright_web_search.py`) includes extensive anti-detection:

### Browser Arguments

- `--disable-blink-features=AutomationControlled` - Removes automation flags
- Multiple stealth flags to hide automation
- Realistic window size and viewport

### JavaScript Injection

The script injects JavaScript to:
- Remove `navigator.webdriver` property
- Override plugins, languages, and permissions
- Mock Chrome runtime object
- Override battery API

### Human-Like Behavior

- Random delays between actions (1-4 seconds)
- Mouse movements before clicks
- Random user agent rotation
- Realistic HTTP headers

### Resource Loading

**Important**: The script does NOT block resources (images, stylesheets) as this is a major detection flag. Google detects when resources are blocked.

## Testing with Visible Mode

To debug CAPTCHA issues, run the script in visible mode:

```bash
python scripts/playwright_web_search.py path/to/image.png --visible
```

Or from the API:

```typescript
body: JSON.stringify({
  imagePath: image.path,
  engine: 'google',
  headless: false,  // Run in visible mode
})
```

## Best Practices

### 1. Limit Search Frequency

- **Recommended**: 5-10 searches per hour per IP
- **Maximum**: 10 searches per hour (enforced by rate limiter)
- **Between searches**: Wait 30-60 seconds

### 2. Use Bing for High Volume

If you need to search many images:
- Use Bing Visual Search (less strict)
- Or implement proxy rotation
- Or distribute searches across multiple IPs

### 3. Monitor Rate Limits

Check the API response headers:

```typescript
const response = await fetch('/api/diagram/web-search', {...})
const remaining = response.headers.get('X-RateLimit-Remaining')
const resetAt = response.headers.get('X-RateLimit-Reset')

console.log(`Remaining searches: ${remaining}`)
console.log(`Resets at: ${new Date(parseInt(resetAt))}`)
```

### 4. Handle Rate Limit Errors

The frontend automatically:
- Stops searching when rate limited
- Shows error message to user
- Displays when the limit resets

### 5. Use Proxies/VPN for Production

For production use with high volume:
- Implement proxy rotation
- Use residential proxies (not datacenter)
- Rotate user agents per proxy
- Distribute requests across multiple IPs

## Troubleshooting

### CAPTCHA Still Appearing?

1. **Check IP Reputation**: Your IP may be flagged. Try:
   - Using a different network
   - Using a VPN
   - Waiting 24 hours

2. **Reduce Search Frequency**: 
   - Increase delays between searches
   - Reduce searches per hour

3. **Use Bing Instead**: 
   - Bing is less strict
   - Set `engine: 'bing'` in API calls

4. **Check Browser Detection**:
   - Run in visible mode (`--visible`)
   - Verify anti-detection JavaScript is working
   - Check browser console for errors

### Rate Limit Not Working?

1. **Check IP Detection**: 
   - Verify `getClientIP()` is working
   - Check if behind proxy/load balancer
   - Add logging to see detected IP

2. **Check Storage**:
   - Rate limiter uses in-memory storage
   - Resets on server restart
   - For production, use Redis

3. **Check Environment Variables**:
   - Verify `MAX_SEARCHES_PER_HOUR` is set
   - Default is 10 if not set

## Production Recommendations

### 1. Use Redis for Rate Limiting

Replace in-memory storage with Redis:

```typescript
// lib/rate-limit-redis.ts
import Redis from 'ioredis'

const redis = new Redis(process.env.REDIS_URL)

export async function checkRateLimit(ip: string) {
  const key = `rate_limit:${ip}`
  const count = await redis.incr(key)
  
  if (count === 1) {
    await redis.expire(key, 3600)  // 1 hour
  }
  
  // ... rest of logic
}
```

### 2. Implement Proxy Rotation

For high-volume searches:

```typescript
const proxies = [
  'http://proxy1:port',
  'http://proxy2:port',
  // ...
]

const proxy = proxies[Math.floor(Math.random() * proxies.length)]
```

### 3. Add Request Queuing

For better control:

```typescript
// Use BullMQ or similar
const queue = new Queue('web-search', {
  limiter: {
    max: 10,
    duration: 3600000,  // 1 hour
  }
})
```

## Summary

- ✅ **Rate Limiting**: 10 searches/hour per IP (configurable)
- ✅ **Automatic Delays**: 35 seconds between searches
- ✅ **Bing Fallback**: Automatic when Google CAPTCHA detected
- ✅ **Anti-Detection**: Enhanced browser fingerprinting
- ✅ **Error Handling**: Graceful CAPTCHA detection and reporting

These measures significantly reduce the chance of CAPTCHA while maintaining search functionality.


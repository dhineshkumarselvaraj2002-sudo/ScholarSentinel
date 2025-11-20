import { NextRequest, NextResponse } from 'next/server'
import { spawn } from 'child_process'
import path from 'path'
import { getClientIP, checkRateLimit } from '@/lib/rate-limit'

/**
 * API Route: /api/diagram/web-search
 * 
 * Uses Playwright to search for diagrams on the web (Google Images, Bing Visual Search).
 * Checks if diagrams were copy-pasted from websites.
 */

interface WebSearchResult {
  found: boolean
  similarImages: Array<{ url: string; thumbnail: string }>
  matchingPages: Array<{ url: string; title: string }>
  bestGuess?: string
  resultUrl: string
  count: number
  error?: string
}

/**
 * Run Playwright web search script
 */
async function runWebSearchScript(
  imagePath: string,
  engine: 'google' | 'bing' = 'google',
  headless: boolean = true,
  logLevel: string = 'INFO'
): Promise<WebSearchResult> {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(process.cwd(), 'scripts', 'playwright_web_search.py')
    const fs = require('fs')

    if (!fs.existsSync(scriptPath)) {
      reject(new Error(`Playwright script not found at: ${scriptPath}`))
      return
    }

    // Check if image exists
    if (!fs.existsSync(imagePath)) {
      reject(new Error(`Image file not found: ${imagePath}`))
      return
    }

    // Spawn Python process
    const args = [scriptPath, imagePath, '--engine', engine, '--log-level', logLevel]
    // Only add --visible if headless is false
    // The script defaults to headless mode, so we don't need to pass --headless
    if (!headless) {
      args.push('--visible')
    }

    const pythonProcess = spawn('python', args, {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''
    let jsonBuffer = ''  // Buffer to collect JSON
    let inJsonBlock = false  // Track if we're inside a JSON block
    let braceCount = 0  // Track brace/bracket depth

    pythonProcess.stdout.on('data', (data) => {
      const output = data.toString()
      stdout += output
      
      // Process character by character to properly handle multi-line JSON
      for (let i = 0; i < output.length; i++) {
        const char = output[i]
        
        // Detect start of JSON object
        if (char === '{' && !inJsonBlock) {
          inJsonBlock = true
          jsonBuffer = '{'
          braceCount = 1
        } else if (inJsonBlock) {
          jsonBuffer += char
          
          // Track brace/bracket depth
          if (char === '{' || char === '[') {
            braceCount++
          } else if (char === '}' || char === ']') {
            braceCount--
            
            // If we've closed all braces, we have complete JSON
            if (braceCount === 0) {
              // Try to parse to verify it's valid JSON
              try {
                JSON.parse(jsonBuffer)
                // Valid JSON - don't print as log, will be parsed later
                inJsonBlock = false
              } catch {
                // Not valid yet, continue collecting
              }
            }
          }
        }
      }
      
      // Also check for log lines (non-JSON content)
      // Only print lines that are definitely not part of JSON
      if (!inJsonBlock) {
        const lines = output.split('\n')
        for (const line of lines) {
          const trimmed = line.trim()
          // Skip empty lines and lines that look like JSON
          if (trimmed && 
              !trimmed.startsWith('{') && 
              !trimmed.startsWith('[') &&
              !trimmed.match(/^[\s]*"[^"]+":/) &&  // Not a JSON key
              !trimmed.match(/^[\s]*[}\]]/)) {     // Not a closing brace
            console.log(`[Playwright] ${trimmed}`)
          }
        }
      }
    })

    pythonProcess.stderr.on('data', (data) => {
      const output = data.toString()
      stderr += output
      // Forward stderr (logs) to console in real-time
      console.log(`[Playwright] ${output}`)
    })

    pythonProcess.on('close', (code) => {
      if (code !== 0) {
        reject(
          new Error(
            `Playwright script exited with code ${code}. Error: ${stderr || stdout}`
          )
        )
        return
      }

      try {
        // Try to parse from jsonBuffer first (character-by-character collection)
        let jsonStr = ''
        
        if (jsonBuffer && braceCount === 0) {
          // Use collected JSON buffer (complete JSON)
          jsonStr = jsonBuffer.trim()
        } else {
          // Fallback: try to extract JSON from stdout using regex
          // Look for complete JSON object/array (handles multi-line with proper matching)
          const jsonMatch = stdout.match(/(\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}|\[[^\[\]]*(?:\[[^\[\]]*\][^\[\]]*)*\])/)
          if (jsonMatch) {
            jsonStr = jsonMatch[1]
          } else {
            // Last resort: try to find JSON boundaries manually
            const firstBrace = stdout.indexOf('{')
            const lastBrace = stdout.lastIndexOf('}')
            if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
              jsonStr = stdout.substring(firstBrace, lastBrace + 1)
            } else {
              jsonStr = stdout.trim()
            }
          }
        }
        
        if (!jsonStr) {
          throw new Error('No JSON output found in script response')
        }
        
        // Clean up any potential issues
        jsonStr = jsonStr.trim()
        
        // Try to parse
        const result: WebSearchResult = JSON.parse(jsonStr)
        resolve(result)
      } catch (parseError: any) {
        console.error('[Playwright] Failed to parse JSON output:', parseError.message)
        console.error('[Playwright] Raw stdout length:', stdout.length)
        console.error('[Playwright] Raw stdout (last 2000 chars):', stdout.substring(Math.max(0, stdout.length - 2000)))
        console.error('[Playwright] JSON buffer length:', jsonBuffer.length)
        if (jsonBuffer) {
          console.error('[Playwright] JSON buffer (first 1000 chars):', jsonBuffer.substring(0, 1000))
        }
        reject(
          new Error(
            `Failed to parse script output: ${parseError.message}. Check server logs for details.`
          )
        )
      }
    })

    pythonProcess.on('error', (error) => {
      reject(
        new Error(
          `Failed to spawn Python process: ${error.message}. Make sure Python and Playwright are installed.`
        )
      )
    })
  })
}

export async function POST(request: NextRequest) {
  try {
    // Rate limiting check
    const clientIP = getClientIP(request)
    const rateLimit = checkRateLimit(clientIP)
    
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: rateLimit.error || 'Rate limit exceeded',
          rateLimit: {
            remaining: rateLimit.remaining,
            resetAt: new Date(rateLimit.resetAt).toISOString(),
          },
        },
        {
          status: 429, // Too Many Requests
          headers: {
            'X-RateLimit-Limit': '10',
            'X-RateLimit-Remaining': rateLimit.remaining.toString(),
            'X-RateLimit-Reset': rateLimit.resetAt.toString(),
            'Retry-After': Math.ceil((rateLimit.resetAt - Date.now()) / 1000).toString(),
          },
        }
      )
    }
    
    const body = await request.json()
    const { imagePath, engine = 'google', headless = true, logLevel = 'INFO', delay = 0 } = body

    if (!imagePath) {
      return NextResponse.json(
        { error: 'imagePath is required' },
        { status: 400 }
      )
    }
    
    // Add delay if specified (for spacing out searches)
    if (delay > 0) {
      console.log(`[API] Waiting ${delay}ms before search (rate limiting)...`)
      await new Promise(resolve => setTimeout(resolve, delay))
    }

    // Convert relative path to absolute
    let absoluteImagePath: string
    if (path.isAbsolute(imagePath)) {
      absoluteImagePath = imagePath
    } else {
      // Assume it's relative to public/ directory
      absoluteImagePath = path.join(process.cwd(), 'public', imagePath)
    }

    // Run web search
    console.log(`[API] Starting Playwright web search for: ${imagePath}`)
    console.log(`[API] Engine: ${engine}, Headless: ${headless}, Log Level: ${logLevel}`)
    
    const result = await runWebSearchScript(
      absoluteImagePath,
      engine as 'google' | 'bing',
      headless,
      logLevel as string
    )
    
    console.log(`[API] Playwright search completed. Found: ${result.found}, Count: ${result.count}`)

    return NextResponse.json({
      success: true,
      result,
      rateLimit: {
        remaining: rateLimit.remaining,
        resetAt: new Date(rateLimit.resetAt).toISOString(),
      },
    }, {
      headers: {
        'X-RateLimit-Limit': '10',
        'X-RateLimit-Remaining': rateLimit.remaining.toString(),
        'X-RateLimit-Reset': rateLimit.resetAt.toString(),
      },
    })
  } catch (error: any) {
    console.error('Error in web search API:', error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Internal server error',
        result: {
          found: false,
          error: error.message,
        },
      },
      { status: 500 }
    )
  }
}


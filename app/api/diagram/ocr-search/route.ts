import { NextRequest, NextResponse } from 'next/server'
import { spawn } from 'child_process'
import path from 'path'
import { getClientIP, checkRateLimit } from '@/lib/rate-limit'

/**
 * API Route: /api/diagram/ocr-search
 * 
 * Uses OCR to extract text from diagrams, then searches using free APIs.
 * NO browser automation or Playwright.
 */

interface OCRSearchResult {
  ocr_text: string
  keywords: string[]
  queries: string[]
  api_calls: Array<{
    api: string
    method: string
    url: string
    headers: Record<string, string>
    body: any
  }>
  results: Array<{
    url: string
    title: string
    reason: string
    confidence: number
  }>
  hash_match: any
  error?: string
}

/**
 * Run OCR-based search script
 */
async function runOCRSearchScript(
  imagePath: string,
  serperApiKey?: string,
  googleCseId?: string
): Promise<OCRSearchResult> {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(process.cwd(), 'scripts', 'ocr_diagram_search.py')
    const fs = require('fs')

    if (!fs.existsSync(scriptPath)) {
      reject(new Error(`OCR search script not found at: ${scriptPath}`))
      return
    }

    // Check if image exists
    if (!fs.existsSync(imagePath)) {
      reject(new Error(`Image file not found: ${imagePath}`))
      return
    }

    // Build command arguments
    const args = [scriptPath, imagePath, '--log-level', 'INFO']
    
    if (serperApiKey) {
      args.push('--serper-key', serperApiKey)
    }
    
    if (googleCseId) {
      args.push('--google-cse-id', googleCseId)
    }

    const pythonProcess = spawn('python', args, {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        SERPER_API_KEY: serperApiKey || process.env.SERPER_API_KEY || '',
        GOOGLE_CSE_ID: googleCseId || process.env.GOOGLE_CSE_ID || '',
        GOOGLE_API_KEY: process.env.GOOGLE_API_KEY || '',
      }
    })

    let stdout = ''
    let stderr = ''
    let jsonBuffer = ''
    let inJsonBlock = false
    let braceCount = 0

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
      if (!inJsonBlock) {
        const lines = output.split('\n')
        for (const line of lines) {
          const trimmed = line.trim()
          // Skip empty lines and lines that look like JSON
          if (trimmed && 
              !trimmed.startsWith('{') && 
              !trimmed.startsWith('[') &&
              !trimmed.match(/^[\s]*"[^"]+":/) &&
              !trimmed.match(/^[\s]*[}\]]/)) {
            console.log(`[OCR Search] ${trimmed}`)
          }
        }
      }
    })

    pythonProcess.stderr.on('data', (data) => {
      const output = data.toString()
      stderr += output
      // Forward stderr (logs) to console in real-time
      console.log(`[OCR Search] ${output}`)
    })

    pythonProcess.on('close', (code) => {
      if (code !== 0) {
        reject(
          new Error(
            `OCR search script exited with code ${code}. Error: ${stderr || stdout}`
          )
        )
        return
      }

      try {
        // Try to parse from jsonBuffer first
        let jsonStr = ''
        
        if (jsonBuffer && braceCount === 0) {
          jsonStr = jsonBuffer.trim()
        } else {
          // Fallback: try to extract JSON from stdout
          const jsonMatch = stdout.match(/(\{[\s\S]*\}|\[[\s\S]*\])/)
          if (jsonMatch) {
            jsonStr = jsonMatch[1]
          } else {
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
        
        const result: OCRSearchResult = JSON.parse(jsonStr)
        resolve(result)
      } catch (parseError: any) {
        console.error('[OCR Search] Failed to parse JSON output:', parseError.message)
        console.error('[OCR Search] Raw stdout length:', stdout.length)
        console.error('[OCR Search] Raw stdout (last 2000 chars):', stdout.substring(Math.max(0, stdout.length - 2000)))
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
          `Failed to spawn Python process: ${error.message}. Make sure Python and required libraries are installed.`
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
          status: 429,
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
    const { imagePath, serperApiKey, googleCseId } = body

    if (!imagePath) {
      return NextResponse.json(
        { error: 'imagePath is required' },
        { status: 400 }
      )
    }

    // Convert relative path to absolute
    let absoluteImagePath: string
    if (path.isAbsolute(imagePath)) {
      absoluteImagePath = imagePath
    } else {
      // Assume it's relative to public/ directory
      absoluteImagePath = path.join(process.cwd(), 'public', imagePath)
    }

    // Run OCR search
    console.log(`[API] Starting OCR-based search for: ${imagePath}`)
    
    const result = await runOCRSearchScript(
      absoluteImagePath,
      serperApiKey,
      googleCseId
    )
    
    console.log(`[API] OCR search completed. Found ${result.results.length} potential matches`)

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
    console.error('Error in OCR search API:', error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Internal server error',
        result: {
          ocr_text: 'no_ocr_text_found',
          keywords: [],
          queries: [],
          api_calls: [],
          results: [],
          hash_match: null,
          error: error.message,
        },
      },
      { status: 500 }
    )
  }
}


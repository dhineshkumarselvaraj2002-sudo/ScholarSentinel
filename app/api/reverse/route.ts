import { NextRequest, NextResponse } from 'next/server'
import { spawn } from 'child_process'
import path from 'path'

/**
 * API Route: /api/reverse
 * 
 * Triggers automated reverse image search using Selenium.
 */

interface ReverseSearchResponse {
  success: boolean
  results?: {
    google?: any
    bing?: any
  }
  error?: string
}

/**
 * Run Selenium reverse search script
 */
async function runReverseSearchScript(
  imagePath: string,
  engine: 'google' | 'bing' | 'both' = 'google',
  headless: boolean = true
): Promise<any> {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(process.cwd(), 'scripts', 'auto_reverse_search.py')
    const fs = require('fs')
    
    if (!fs.existsSync(scriptPath)) {
      reject(new Error(`Python script not found at: ${scriptPath}`))
      return
    }

    const args = [
      scriptPath,
      imagePath,
      '--engine',
      engine,
    ]
    
    if (headless) {
      args.push('--headless')
    }

    const pythonProcess = spawn('python', args, {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''

    pythonProcess.stdout.on('data', (data) => {
      stdout += data.toString()
    })

    pythonProcess.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    pythonProcess.on('close', (code) => {
      if (code !== 0) {
        reject(
          new Error(
            `Python script exited with code ${code}. Error: ${stderr || stdout}`
          )
        )
        return
      }

      try {
        const result = JSON.parse(stdout.trim())
        resolve(result)
      } catch (parseError: any) {
        reject(
          new Error(
            `Failed to parse Python script output: ${parseError.message}. Output: ${stdout}`
          )
        )
      }
    })

    pythonProcess.on('error', (error) => {
      reject(
        new Error(
          `Failed to spawn Python process: ${error.message}. Make sure Python and ChromeDriver are installed.`
        )
      )
    })
  })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { imagePath, engine = 'google', headless = true } = body

    if (!imagePath) {
      return NextResponse.json(
        { error: 'imagePath is required' },
        { status: 400 }
      )
    }

    // Validate image path (must be in public/diagrams for security)
    if (!imagePath.startsWith('diagrams/')) {
      return NextResponse.json(
        { error: 'Invalid image path. Must be in diagrams directory.' },
        { status: 400 }
      )
    }

    // Convert relative path to absolute
    const absolutePath = path.join(process.cwd(), 'public', imagePath)

    // Validate engine
    if (!['google', 'bing', 'both'].includes(engine)) {
      return NextResponse.json(
        { error: 'Invalid engine. Must be google, bing, or both.' },
        { status: 400 }
      )
    }

    // Run reverse search (this may take 10-30 seconds)
    const results = await runReverseSearchScript(
      absolutePath,
      engine as 'google' | 'bing' | 'both',
      headless
    )

    const response: ReverseSearchResponse = {
      success: true,
      results,
    }

    return NextResponse.json(response)
  } catch (error: any) {
    console.error('Error in reverse search API:', error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Internal server error',
      },
      { status: 500 }
    )
  }
}


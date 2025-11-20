import { NextRequest, NextResponse } from 'next/server'
import { spawn } from 'child_process'
import path from 'path'

/**
 * API Route: /api/hashing
 * 
 * Computes and stores image hashes (pHash, dHash, aHash) in SQLite database.
 */

interface HashResponse {
  success: boolean
  image_path: string
  hashes: {
    pHash: string
    dHash: string
    aHash: string
  }
  stored: boolean
  error?: string
}

interface CompareResponse {
  success: boolean
  image1: string
  image2: string
  similarity: number
  hashes1: any
  hashes2: any
  error?: string
}

/**
 * Run Python hashing script
 */
async function runHashingScript(
  imagePath: string,
  operation: 'compute' | 'compare' | 'find-similar',
  comparePath?: string
): Promise<any> {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(process.cwd(), 'scripts', 'image_hashing.py')
    const fs = require('fs')
    
    if (!fs.existsSync(scriptPath)) {
      reject(new Error(`Python script not found at: ${scriptPath}`))
      return
    }

    const args = [scriptPath, imagePath]
    
    if (operation === 'compare' && comparePath) {
      args.push('--compare', comparePath)
    } else if (operation === 'find-similar') {
      args.push('--find-similar')
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
          `Failed to spawn Python process: ${error.message}. Make sure Python is installed.`
        )
      )
    })
  })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { imagePath, operation = 'compute', comparePath } = body

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

    let result
    if (operation === 'compare' && comparePath) {
      const absoluteComparePath = path.join(process.cwd(), 'public', comparePath)
      result = await runHashingScript(absolutePath, 'compare', absoluteComparePath)
    } else if (operation === 'find-similar') {
      result = await runHashingScript(absolutePath, 'find-similar')
    } else {
      result = await runHashingScript(absolutePath, 'compute')
    }

    return NextResponse.json({
      success: true,
      ...result,
    })
  } catch (error: any) {
    console.error('Error in hashing API:', error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Internal server error',
      },
      { status: 500 }
    )
  }
}


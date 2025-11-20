import { NextRequest, NextResponse } from 'next/server'
import { spawn } from 'child_process'
import path from 'path'
import { readdir } from 'fs/promises'

/**
 * API Route: /api/compare
 * 
 * Compares diagrams using OpenCV (ORB, SSIM) and returns similarity scores.
 */

interface CompareResponse {
  success: boolean
  comparison?: {
    orbScore: number
    ssim: number
    matchPercentage: number
    likelyCopied: boolean
    reason: string
  }
  bestMatch?: {
    image: string
    score: number
    orbScore: number
    ssim: number
  }
  matches?: Array<{
    image: string
    score: number
    orbScore: number
    ssim: number
  }>
  error?: string
}

/**
 * Run OpenCV comparison script
 */
async function runComparisonScript(
  image1Path: string,
  image2Path?: string,
  referenceDir?: string,
  threshold: number = 0.35
): Promise<any> {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(process.cwd(), 'scripts', 'opencv_compare.py')
    const fs = require('fs')
    
    if (!fs.existsSync(scriptPath)) {
      reject(new Error(`Python script not found at: ${scriptPath}`))
      return
    }

    const args = [scriptPath, image1Path]
    
    if (referenceDir) {
      args.push('--reference-dir', referenceDir)
      args.push('--threshold', threshold.toString())
    } else if (image2Path) {
      args.push(image2Path)
    } else {
      reject(new Error('Either image2Path or referenceDir must be provided'))
      return
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
    const { image1Path, image2Path, referenceDir, threshold = 0.35 } = body

    if (!image1Path) {
      return NextResponse.json(
        { error: 'image1Path is required' },
        { status: 400 }
      )
    }

    // Validate paths (must be in public/diagrams for security)
    if (!image1Path.startsWith('diagrams/')) {
      return NextResponse.json(
        { error: 'Invalid image1Path. Must be in diagrams directory.' },
        { status: 400 }
      )
    }

    const absoluteImage1Path = path.join(process.cwd(), 'public', image1Path)

    let result: any

    if (referenceDir) {
      // Compare with reference directory
      const absoluteRefDir = path.join(process.cwd(), 'public', 'diagrams', 'reference')
      
      // Ensure reference directory exists
      const fs = require('fs')
      if (!fs.existsSync(absoluteRefDir)) {
        return NextResponse.json(
          { error: 'Reference directory does not exist' },
          { status: 400 }
        )
      }

      result = await runComparisonScript(
        absoluteImage1Path,
        undefined,
        absoluteRefDir,
        threshold
      )
    } else if (image2Path) {
      // Compare two specific images
      if (!image2Path.startsWith('diagrams/')) {
        return NextResponse.json(
          { error: 'Invalid image2Path. Must be in diagrams directory.' },
          { status: 400 }
        )
      }

      const absoluteImage2Path = path.join(process.cwd(), 'public', image2Path)
      result = await runComparisonScript(absoluteImage1Path, absoluteImage2Path)
    } else {
      return NextResponse.json(
        { error: 'Either image2Path or referenceDir must be provided' },
        { status: 400 }
      )
    }

    const response: CompareResponse = {
      success: true,
      ...result,
    }

    return NextResponse.json(response)
  } catch (error: any) {
    console.error('Error in comparison API:', error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Internal server error',
      },
      { status: 500 }
    )
  }
}


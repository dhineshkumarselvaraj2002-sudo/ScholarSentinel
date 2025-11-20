import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'
import { spawn } from 'child_process'

/**
 * API Route: /api/diagram/upload
 * 
 * Accepts a PDF upload, extracts diagrams/images, computes perceptual hashes,
 * and detects duplicates using a local Python script.
 * 
 * Returns:
 * {
 *   images: [{ filename, hash, path, page, width, height, type, is_duplicate }],
 *   duplicates: [{ hash, files: [...], count }]
 * }
 */

// Ensure uploads directory exists
const UPLOADS_DIR = path.join(process.cwd(), 'uploads')
const DIAGRAMS_DIR = path.join(process.cwd(), 'public', 'diagrams')

interface ExtractionResult {
  job_id: string
  images: Array<{
    filename: string
    hash: string
    path: string
    page: number
    width: number
    height: number
    type: string
    is_duplicate: boolean
  }>
  duplicates: Array<{
    hash: string
    files: string[]
    count: number
  }>
  total_images: number
  unique_images: number
  error?: string
}

/**
 * Run Python script to extract diagrams from PDF
 */
async function runExtractionScript(
  pdfPath: string,
  outputDir: string,
  jobId: string
): Promise<ExtractionResult> {
  return new Promise((resolve, reject) => {
    // Path to Python script
    const scriptPath = path.join(process.cwd(), 'scripts', 'extract_diagrams.py')
    
    // Check if script exists
    const fs = require('fs')
    if (!fs.existsSync(scriptPath)) {
      reject(new Error(`Python script not found at: ${scriptPath}`))
      return
    }

    // Spawn Python process
    const pythonProcess = spawn('python', [scriptPath, pdfPath, outputDir, jobId], {
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
        // Parse JSON output from Python script
        const result: ExtractionResult = JSON.parse(stdout.trim())
        
        // Convert absolute paths to relative paths for public access
        // The Python script outputs absolute paths, but we need relative paths
        // from public/diagrams/ for the frontend
        const updatedImages = result.images.map((img) => {
          // Extract relative path from public/diagrams/jobId/filename
          const relativePath = path.relative(
            path.join(process.cwd(), 'public'),
            img.path
          )
          return {
            ...img,
            path: relativePath.replace(/\\/g, '/'), // Normalize path separators
          }
        })

        resolve({
          ...result,
          images: updatedImages,
        })
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
          `Failed to spawn Python process: ${error.message}. Make sure Python is installed and the script exists.`
        )
      )
    })
  })
}

export async function POST(request: NextRequest) {
  try {
    // Parse multipart form data
    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      )
    }

    // Validate file type
    if (file.type !== 'application/pdf' && !file.name.endsWith('.pdf')) {
      return NextResponse.json(
        { error: 'Only PDF files are allowed' },
        { status: 400 }
      )
    }

    // Validate file size (50MB limit)
    const maxSize = 50 * 1024 * 1024 // 50MB
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: 'File size exceeds 50MB limit' },
        { status: 400 }
      )
    }

    // Generate unique job ID
    const jobId = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`

    // Ensure directories exist
    await mkdir(UPLOADS_DIR, { recursive: true })
    await mkdir(DIAGRAMS_DIR, { recursive: true })

    // Save uploaded PDF
    const timestamp = Date.now()
    const sanitizedFilename = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
    const pdfFilename = `${timestamp}_${sanitizedFilename}`
    const pdfPath = path.join(UPLOADS_DIR, pdfFilename)

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    await writeFile(pdfPath, buffer)

    // Run Python extraction script
    let extractionResult: ExtractionResult
    try {
      extractionResult = await runExtractionScript(
        pdfPath,
        DIAGRAMS_DIR,
        jobId
      )
    } catch (error: any) {
      console.error('Error running extraction script:', error)
      
      // Clean up uploaded PDF on error
      try {
        const fs = require('fs')
        if (fs.existsSync(pdfPath)) {
          await fs.promises.unlink(pdfPath)
        }
      } catch (cleanupError) {
        // Ignore cleanup errors
      }

      return NextResponse.json(
        {
          error: 'Failed to extract diagrams from PDF',
          details: error.message,
          hint: 'Make sure Python is installed and required packages are available. Check server logs for details.',
        },
        { status: 500 }
      )
    }

    // Return results
    return NextResponse.json({
      success: true,
      jobId: extractionResult.job_id,
      images: extractionResult.images.map((img) => ({
        filename: img.filename,
        hash: img.hash,
        path: img.path, // Relative path from public/
        page: img.page,
        width: img.width,
        height: img.height,
        type: img.type,
        is_duplicate: img.is_duplicate,
      })),
      duplicates: extractionResult.duplicates,
      total_images: extractionResult.total_images,
      unique_images: extractionResult.unique_images,
    })
  } catch (error: any) {
    console.error('Error in diagram upload API:', error)
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error.message,
      },
      { status: 500 }
    )
  }
}


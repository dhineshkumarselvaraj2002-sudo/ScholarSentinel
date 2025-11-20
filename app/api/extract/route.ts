import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'
import { spawn } from 'child_process'

/**
 * API Route: /api/extract
 * 
 * Triggers PDF diagram extraction using Python script.
 * Returns list of extracted diagram file paths.
 */

const UPLOADS_DIR = path.join(process.cwd(), 'uploads')
const DIAGRAMS_BASE_DIR = path.join(process.cwd(), 'public', 'diagrams')

interface ExtractionResponse {
  success: boolean
  pdf_path: string
  extracted_diagrams: string[]
  count: number
  error?: string
}

/**
 * Run Python extraction script
 */
async function runExtractionScript(pdfPath: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(process.cwd(), 'scripts', 'pdf_extractor.py')
    const fs = require('fs')
    
    if (!fs.existsSync(scriptPath)) {
      reject(new Error(`Python script not found at: ${scriptPath}`))
      return
    }

    // Spawn Python process
    const pythonProcess = spawn('python', [scriptPath, pdfPath, '--output-dir', DIAGRAMS_BASE_DIR], {
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
        // Parse output - script prints file paths
        const lines = stdout.trim().split('\n')
        const paths: string[] = []
        
        for (const line of lines) {
          if (line.trim().startsWith('- ')) {
            const filePath = line.trim().substring(2).trim()
            if (filePath) {
              // Convert absolute path to relative path from public/
              const relativePath = path.relative(
                path.join(process.cwd(), 'public'),
                filePath
              )
              paths.push(relativePath.replace(/\\/g, '/'))
            }
          }
        }
        
        resolve(paths)
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
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const pdfPath = formData.get('pdfPath') as string | null

    let targetPdfPath: string

    // If file is uploaded, save it first
    if (file) {
      // Validate file type
      if (file.type !== 'application/pdf' && !file.name.endsWith('.pdf')) {
        return NextResponse.json(
          { error: 'Only PDF files are allowed' },
          { status: 400 }
        )
      }

      // Save uploaded file
      await mkdir(UPLOADS_DIR, { recursive: true })
      const timestamp = Date.now()
      const sanitizedFilename = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
      const filename = `${timestamp}_${sanitizedFilename}`
      targetPdfPath = path.join(UPLOADS_DIR, filename)

      const bytes = await file.arrayBuffer()
      const buffer = Buffer.from(bytes)
      await writeFile(targetPdfPath, buffer)
    } else if (pdfPath) {
      // Use provided path (must be in uploads directory for security)
      if (!pdfPath.startsWith('uploads/')) {
        return NextResponse.json(
          { error: 'Invalid PDF path. Must be in uploads directory.' },
          { status: 400 }
        )
      }
      targetPdfPath = path.join(process.cwd(), pdfPath)
    } else {
      return NextResponse.json(
        { error: 'No file or PDF path provided' },
        { status: 400 }
      )
    }

    // Ensure diagrams directory exists
    await mkdir(DIAGRAMS_BASE_DIR, { recursive: true })

    // Run extraction
    const extractedPaths = await runExtractionScript(targetPdfPath)

    const response: ExtractionResponse = {
      success: true,
      pdf_path: targetPdfPath,
      extracted_diagrams: extractedPaths,
      count: extractedPaths.length,
    }

    return NextResponse.json(response)
  } catch (error: any) {
    console.error('Error in extraction API:', error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Internal server error',
        extracted_diagrams: [],
        count: 0,
      },
      { status: 500 }
    )
  }
}


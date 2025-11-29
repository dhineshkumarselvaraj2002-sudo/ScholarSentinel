import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'
import { addJob, PlagiarismJobData, updateJobStatus } from '../../../../queue/diagramQueue'
import { spawn } from 'child_process'

/**
 * API Route: /api/forensics/scan
 * 
 * Starts a plagiarism detection scan for an uploaded PDF.
 */

const UPLOADS_DIR = path.join(process.cwd(), 'uploads')

export async function POST(request: NextRequest) {
  try {
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

    // Generate unique job ID
    const jobId = `plagiarism_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`

    // Save uploaded PDF
    await mkdir(UPLOADS_DIR, { recursive: true })
    const timestamp = Date.now()
    const sanitizedFilename = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
    const filename = `${timestamp}_${sanitizedFilename}`
    const pdfPath = path.join(UPLOADS_DIR, filename)

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    await writeFile(pdfPath, buffer)

    // Execute directly (no queue system)
    console.log('Executing plagiarism check directly...')
    
    // Add job to status tracking
    const jobData: PlagiarismJobData = {
      type: 'plagiarism',
      pdfPath,
      jobId,
    }
    await addJob(jobData)
    updateJobStatus(jobId, { state: 'active', progress: 0 })
    
    // Run plagiarism engine directly
    const scriptPath = path.join(process.cwd(), 'scripts', 'plagiarism_engine.py')
    const pythonProcess = spawn('python', [scriptPath, pdfPath], {
      cwd: process.cwd(),
      stdio: 'pipe',
    })

    let output = ''
    let errorOutput = ''

    pythonProcess.stdout.on('data', (data) => {
      output += data.toString()
    })

    pythonProcess.stderr.on('data', (data) => {
      errorOutput += data.toString()
    })

    pythonProcess.on('close', (code) => {
      if (code === 0) {
        updateJobStatus(jobId, { 
          state: 'completed', 
          progress: 100,
          returnValue: { success: true, output }
        })
      } else {
        updateJobStatus(jobId, { 
          state: 'failed', 
          progress: 100,
          failedReason: errorOutput || 'Process exited with error'
        })
        console.error('Plagiarism engine error:', errorOutput)
      }
    })

    // Don't wait for completion, return immediately
    return NextResponse.json({
      success: true,
      jobId,
      message: 'Scan started successfully (direct execution mode)',
      mode: 'direct',
    })
  } catch (error: any) {
    console.error('Error in forensics scan API:', error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Internal server error',
      },
      { status: 500 }
    )
  }
}


import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import path from 'path'

/**
 * API Route: /api/forensics/report
 * 
 * Get the final plagiarism report for a completed job.
 */

const RESULTS_DIR = path.join(process.cwd(), 'data', 'results')

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const jobId = searchParams.get('jobId')

    if (!jobId) {
      return NextResponse.json(
        { error: 'jobId is required' },
        { status: 400 }
      )
    }

    // Read report from results directory
    const reportPath = path.join(RESULTS_DIR, `${jobId}.json`)

    try {
      const reportData = await readFile(reportPath, 'utf-8')
      const report = JSON.parse(reportData)

      return NextResponse.json({
        success: true,
        report: report.result || report.plagiarismReport || report,
      })
    } catch (fileError: any) {
      if (fileError.code === 'ENOENT') {
        return NextResponse.json(
          { error: 'Report not found. Job may still be processing.' },
          { status: 404 }
        )
      }
      throw fileError
    }
  } catch (error: any) {
    console.error('Error in forensics report API:', error)
    return NextResponse.json(
      {
        error: error.message || 'Internal server error',
      },
      { status: 500 }
    )
  }
}


import { NextRequest, NextResponse } from 'next/server'
import { getJobStatus } from '../../../../queue/diagramQueue'

/**
 * API Route: /api/forensics/status
 * 
 * Get the status of a forensics job.
 */

export const dynamic = 'force-dynamic'

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

    const status = await getJobStatus(jobId)

    if (!status) {
      return NextResponse.json(
        { 
          error: 'Job not found',
          mode: 'direct',
          message: 'Job may have completed or status was not tracked. Check results directory for output.',
        },
        { status: 404 }
      )
    }

    return NextResponse.json({
      ...status,
      mode: 'direct',
    })
  } catch (error: any) {
    console.error('Error in forensics status API:', error)
    return NextResponse.json(
      {
        error: error.message || 'Internal server error',
      },
      { status: 500 }
    )
  }
}


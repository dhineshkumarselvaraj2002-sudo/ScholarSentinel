import { NextRequest, NextResponse } from 'next/server'
import { getJobStatus, isRedisAvailable } from '../../../../queue/diagramQueue'

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

    // Check if Redis is available
    if (!isRedisAvailable()) {
      return NextResponse.json({
        error: 'Redis not available. Status tracking unavailable in direct execution mode.',
        mode: 'direct',
        warning: 'Job is running directly without queue. Check results directory for output.',
      }, { status: 503 })
    }

    const status = await getJobStatus(jobId)

    if (!status) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      )
    }

    return NextResponse.json(status)
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


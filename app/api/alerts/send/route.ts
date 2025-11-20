import { NextRequest, NextResponse } from 'next/server'
import { sendAlert } from '@/src/lib/alerts'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { type, severity, title, message, paperId, referenceId, diagramId, userId, metadata } = body

    if (!type || !title || !message) {
      return NextResponse.json(
        { error: 'Type, title, and message are required' },
        { status: 400 }
      )
    }

    const alert = await sendAlert({
      type,
      severity,
      title,
      message,
      paperId,
      referenceId,
      diagramId,
      userId,
      metadata,
    })

    return NextResponse.json({ success: true, alert })
  } catch (error: any) {
    console.error('Error sending alert:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to send alert' },
      { status: 500 }
    )
  }
}


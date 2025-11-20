import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/src/lib/prisma'

/**
 * Get CrossRef API key (for viewing in settings)
 * This endpoint should be protected in production
 */
export async function GET(request: NextRequest) {
  try {
    const settings = await prisma.setting.findUnique({
      where: { id: 'settings' },
    })

    if (!settings || !settings.crossrefApiKey) {
      return NextResponse.json(
        { error: 'CrossRef API key not configured' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      apiKey: settings.crossrefApiKey,
    })
  } catch (error: any) {
    console.error('Error fetching CrossRef API key:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch API key' },
      { status: 500 }
    )
  }
}


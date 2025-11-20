import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/src/lib/prisma'

/**
 * Get OpenAlex API key (for viewing in settings)
 * This endpoint should be protected in production
 */
export async function GET(request: NextRequest) {
  try {
    const settings = await prisma.setting.findUnique({
      where: { id: 'settings' },
    })

    if (!settings || !settings.openAlexApiKey) {
      return NextResponse.json(
        { error: 'OpenAlex API key not configured' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      apiKey: settings.openAlexApiKey,
    })
  } catch (error: any) {
    console.error('Error fetching OpenAlex API key:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch API key' },
      { status: 500 }
    )
  }
}


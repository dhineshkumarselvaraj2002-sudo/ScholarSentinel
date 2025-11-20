import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/src/lib/prisma'

/**
 * Get Gemini API key (for internal use by Python service)
 * This endpoint should be protected in production
 */
export async function GET(request: NextRequest) {
  try {
    const settings = await prisma.setting.findUnique({
      where: { id: 'settings' },
    })

    if (!settings || !settings.geminiApiKey) {
      return NextResponse.json(
        { error: 'Gemini API key not configured' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      apiKey: settings.geminiApiKey,
    })
  } catch (error: any) {
    console.error('Error fetching Gemini API key:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch API key' },
      { status: 500 }
    )
  }
}



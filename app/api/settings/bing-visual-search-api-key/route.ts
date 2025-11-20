import { NextResponse } from 'next/server'
import { prisma } from '@/src/lib/prisma'

export async function GET() {
  try {
    const settings = await prisma.setting.findUnique({
      where: { id: 'settings' },
    })

    if (!settings || !settings.bingVisualSearchApiKey) {
      return NextResponse.json({ apiKey: null })
    }

    return NextResponse.json({ apiKey: settings.bingVisualSearchApiKey })
  } catch (error: any) {
    console.error('Error fetching Bing Visual Search API key:', error)
    return NextResponse.json(
      { error: 'Failed to fetch API key' },
      { status: 500 }
    )
  }
}


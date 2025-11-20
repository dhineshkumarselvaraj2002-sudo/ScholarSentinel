import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/src/lib/prisma'

export async function GET() {
  try {
    // Verify prisma client is initialized
    if (!prisma || !prisma.setting) {
      console.error('Prisma client not initialized or Setting model not available')
      return NextResponse.json(
        { error: 'Database connection error. Please ensure Prisma client is generated.' },
        { status: 500 }
      )
    }

    // Get or create settings (single row with id="settings")
    let settings = await prisma.setting.findUnique({
      where: { id: 'settings' },
    })

    if (!settings) {
      // Create default settings if they don't exist
      settings = await prisma.setting.create({
        data: {
          id: 'settings',
          pdfServiceUrl: process.env.PDF_SERVICE_URL || 'http://localhost:8000',
        },
      })
    }

    // Don't return the actual API keys in the response for security
    // Only return whether they are set or not
    return NextResponse.json({
      success: true,
      settings: {
        hasGeminiApiKey: !!settings.geminiApiKey,
        hasOpenAlexApiKey: !!settings.openAlexApiKey,
        hasCrossrefApiKey: !!settings.crossrefApiKey,
        pdfServiceUrl: settings.pdfServiceUrl,
        hasSendGridApiKey: !!settings.sendGridApiKey,
        slackWebhookUrl: settings.slackWebhookUrl || '',
        discordWebhookUrl: settings.discordWebhookUrl || '',
        hasBingVisualSearchApiKey: !!settings.bingVisualSearchApiKey,
        bingVisualSearchEndpoint: settings.bingVisualSearchEndpoint || '',
      },
    })
  } catch (error: any) {
    console.error('Error fetching settings:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch settings' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    // Verify prisma client is initialized
    if (!prisma || !prisma.setting) {
      console.error('Prisma client not initialized or Setting model not available')
      return NextResponse.json(
        { error: 'Database connection error. Please ensure Prisma client is generated.' },
        { status: 500 }
      )
    }

    const body = await request.json()
    const { geminiApiKey, openAlexApiKey, crossrefApiKey, pdfServiceUrl, sendGridApiKey, slackWebhookUrl, discordWebhookUrl, bingVisualSearchApiKey, bingVisualSearchEndpoint } = body

    // Build update object - include fields that are explicitly provided (even if empty string)
    const updateData: any = {}
    if (geminiApiKey !== undefined) updateData.geminiApiKey = geminiApiKey || null
    if (openAlexApiKey !== undefined) updateData.openAlexApiKey = openAlexApiKey || null
    if (crossrefApiKey !== undefined) updateData.crossrefApiKey = crossrefApiKey || null
    if (pdfServiceUrl !== undefined) updateData.pdfServiceUrl = pdfServiceUrl
    if (sendGridApiKey !== undefined) updateData.sendGridApiKey = sendGridApiKey || null
    if (slackWebhookUrl !== undefined) updateData.slackWebhookUrl = slackWebhookUrl || null
    if (discordWebhookUrl !== undefined) updateData.discordWebhookUrl = discordWebhookUrl || null
    if (bingVisualSearchApiKey !== undefined) updateData.bingVisualSearchApiKey = bingVisualSearchApiKey || null
    if (bingVisualSearchEndpoint !== undefined) updateData.bingVisualSearchEndpoint = bingVisualSearchEndpoint || null

    // Update or create settings
    const settings = await prisma.setting.upsert({
      where: { id: 'settings' },
      update: updateData,
      create: {
        id: 'settings',
        geminiApiKey: geminiApiKey || null,
        openAlexApiKey: openAlexApiKey || null,
        crossrefApiKey: crossrefApiKey || null,
        pdfServiceUrl: pdfServiceUrl || 'http://localhost:8000',
        sendGridApiKey: sendGridApiKey || null,
        slackWebhookUrl: slackWebhookUrl || null,
        discordWebhookUrl: discordWebhookUrl || null,
        bingVisualSearchApiKey: bingVisualSearchApiKey || null,
        bingVisualSearchEndpoint: bingVisualSearchEndpoint || null,
      },
    })

    return NextResponse.json({
      success: true,
      message: 'Settings saved successfully',
      settings: {
        hasGeminiApiKey: !!settings.geminiApiKey,
        hasOpenAlexApiKey: !!settings.openAlexApiKey,
        hasCrossrefApiKey: !!settings.crossrefApiKey,
        pdfServiceUrl: settings.pdfServiceUrl,
        hasSendGridApiKey: !!settings.sendGridApiKey,
        slackWebhookUrl: settings.slackWebhookUrl || '',
        discordWebhookUrl: settings.discordWebhookUrl || '',
        hasBingVisualSearchApiKey: !!settings.bingVisualSearchApiKey,
        bingVisualSearchEndpoint: settings.bingVisualSearchEndpoint || '',
      },
    })
  } catch (error: any) {
    console.error('Error saving settings:', error)
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      meta: error.meta,
      prismaAvailable: !!prisma,
      settingAvailable: !!(prisma && prisma.setting),
    })
    return NextResponse.json(
      { 
        error: error.message || 'Failed to save settings',
        details: process.env.NODE_ENV === 'development' ? {
          code: error.code,
          meta: error.meta,
        } : undefined,
      },
      { status: 500 }
    )
  }
}



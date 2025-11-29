import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/src/lib/prisma'
import { extractTextFromPDF, validateContent } from '@/src/lib/api/pdf-service'
import path from 'path'
import fs from 'fs'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const paper = await prisma.paper.findUnique({
      where: { id: params.id },
      include: {
        references: {
          orderBy: { order: 'asc' },
        },
      },
    })

    if (!paper) {
      return NextResponse.json({ error: 'Paper not found' }, { status: 404 })
    }

    if (!paper.pdfPath) {
      return NextResponse.json(
        { error: 'PDF file not available for this paper' },
        { status: 400 }
      )
    }

    const pdfPath = path.join(process.cwd(), 'uploads', paper.pdfPath)
    if (!fs.existsSync(pdfPath)) {
      return NextResponse.json(
        { error: 'PDF file not found on server' },
        { status: 404 }
      )
    }

    // Get Gemini API key from settings
    let geminiApiKey: string | undefined
    try {
      const settings = await prisma.setting.findUnique({
        where: { id: 'settings' },
      })
      geminiApiKey = settings?.geminiApiKey || undefined
    } catch (error) {
      console.warn('Could not fetch Gemini API key from settings:', error)
    }

    // Extract text from PDF
    const textResult = await extractTextFromPDF(pdfPath, geminiApiKey)
    
    if (!textResult || !textResult.text) {
      return NextResponse.json(
        { error: 'Failed to extract text from PDF' },
        { status: 500 }
      )
    }

    // Prepare references for validation
    const referencesForValidation = paper.references.map(ref => ({
      order: ref.order,
      raw_text: ref.rawText,
      normalized_authors: ref.normalizedAuthors || undefined,
      normalized_title: ref.normalizedTitle || undefined,
      normalized_year: ref.normalizedYear || undefined,
      normalized_doi: ref.normalizedDoi || undefined,
      normalized_venue: ref.normalizedVenue || undefined,
    }))

    // Validate content
    const validationResults = await validateContent(
      textResult.text,
      referencesForValidation
    )

    return NextResponse.json({
      success: true,
      results: validationResults,
      textLength: textResult.text.length,
      pages: textResult.pages,
    })
  } catch (error: any) {
    console.error('Error checking content:', error)
    
    // Check if it's a connection error (PDF service not running)
    if (error.code === 'ECONNREFUSED' || error.message?.includes('ECONNREFUSED')) {
      return NextResponse.json(
        { error: 'PDF service is not available. Please ensure the Python service is running.' },
        { status: 503 }
      )
    }

    return NextResponse.json(
      { error: error.message || 'Failed to check content' },
      { status: 500 }
    )
  }
}


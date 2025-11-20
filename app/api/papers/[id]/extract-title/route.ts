import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/src/lib/prisma'
import { extractTextFromPDF } from '@/src/lib/api/pdf-service'
import path from 'path'
import fs from 'fs'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const paper = await prisma.paper.findUnique({
      where: { id: params.id },
    })

    if (!paper) {
      return NextResponse.json({ error: 'Paper not found' }, { status: 404 })
    }

    if (!paper.pdfPath) {
      return NextResponse.json(
        { error: 'PDF file not found for this paper' },
        { status: 404 }
      )
    }

    const pdfPath = path.join(process.cwd(), 'uploads', paper.pdfPath)
    if (!fs.existsSync(pdfPath)) {
      return NextResponse.json(
        { error: 'PDF file does not exist on disk' },
        { status: 404 }
      )
    }

    // Get Gemini API key from settings for better extraction
    let geminiApiKey: string | undefined
    try {
      const settings = await prisma.setting.findUnique({
        where: { id: 'settings' },
      })
      geminiApiKey = settings?.geminiApiKey || undefined
    } catch (error) {
      console.warn('Could not fetch Gemini API key from settings:', error)
    }

    // Extract text from PDF and get second page
    let secondPageText = ''
    let extractedTitle = ''

    try {
      // Extract full text from PDF
      const textResult = await extractTextFromPDF(pdfPath, geminiApiKey)
      const fullText = textResult.text
      const pageCount = textResult.pages

      if (pageCount >= 2) {
        // Estimate second page boundaries
        const lines = fullText.split('\n')
        const linesPerPage = Math.ceil(lines.length / pageCount)
        const secondPageStart = linesPerPage
        const secondPageEnd = Math.min(secondPageStart + linesPerPage * 1.5, lines.length) // Get a bit more to be safe
        secondPageText = lines.slice(secondPageStart, secondPageEnd).join('\n')
      } else {
        // If only one page, use the full text
        secondPageText = fullText
      }
    } catch (error) {
      console.error('Error extracting text from PDF:', error)
      return NextResponse.json(
        { error: 'Failed to extract text from PDF' },
        { status: 500 }
      )
    }

    // Extract title from second page text
    // The title is typically at the beginning of the second page
    // Look for the longest capitalized line(s) at the start

    // Fallback: Pattern-based extraction
    if (!extractedTitle && secondPageText) {
      // Look for lines that look like titles
      const lines = secondPageText.split('\n').map(l => l.trim()).filter(l => l.length > 0)
      
      // Find the longest line that looks like a title (starts with capital, reasonable length)
      const titleCandidates = lines
        .filter(line => {
          const length = line.length
          return length >= 20 && length <= 250 && /^[A-Z]/.test(line)
        })
        .sort((a, b) => b.length - a.length) // Sort by length, longest first

      if (titleCandidates.length > 0) {
        // Take the longest candidate, or combine first few if they seem related
        extractedTitle = titleCandidates[0]
        
        // If first candidate is short and second exists, might be multi-line title
        if (extractedTitle.length < 50 && titleCandidates.length > 1) {
          const combined = titleCandidates.slice(0, 3).join(' ').trim()
          if (combined.length <= 300) {
            extractedTitle = combined
          }
        }
      }
    }

    // Clean up the title
    if (extractedTitle) {
      // Remove extra whitespace
      extractedTitle = extractedTitle.replace(/\s+/g, ' ').trim()
      // Remove common prefixes/suffixes
      extractedTitle = extractedTitle.replace(/^(title|Title|TITLE|Paper Title|Title:)[:\s]+/i, '')
      extractedTitle = extractedTitle.replace(/[.!?]+$/, '')
      // Remove markdown code blocks if present
      extractedTitle = extractedTitle.replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '')
    }

    if (!extractedTitle) {
      return NextResponse.json(
        { error: 'Could not extract title from PDF second page' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      title: extractedTitle,
    })
  } catch (error: any) {
    console.error('Error extracting title from PDF:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to extract title from PDF' },
      { status: 500 }
    )
  }
}


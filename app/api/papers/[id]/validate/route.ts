import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/src/lib/prisma'
import { validatePaperMetadata, checkDuplicatePaper } from '@/src/lib/validation'
import { extractTextFromPDF } from '@/src/lib/api/pdf-service'
import { sendAlert } from '@/src/lib/alerts'
import { validateWithOpenAlex } from '@/src/lib/api/openalex'
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
        authors: {
          include: {
            author: true,
          },
        },
      },
    })

    if (!paper) {
      return NextResponse.json({ error: 'Paper not found' }, { status: 404 })
    }

    // Validate metadata
    const validation = await validatePaperMetadata({
      title: paper.title,
      authors: paper.authors,
      doi: paper.doi,
      year: paper.year,
      venue: paper.venue,
      pages: paper.pages,
      volume: paper.volume,
    })

    // Check for duplicates
    const duplicateCheck = await checkDuplicatePaper({
      title: paper.title,
      doi: paper.doi,
      authors: paper.authors,
    })

    // Extract and check PDF content if available
    let pdfCheck = { hasAbstract: false, hasConclusion: false, serviceUnavailable: false }
    let pdfAuthors: Array<{ name?: string; display_name?: string }> = []
    let pdfYear: number | null = null
    
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
    
    if (paper.pdfPath && fs.existsSync(path.join(process.cwd(), 'uploads', paper.pdfPath))) {
      try {
        const pdfText = await extractTextFromPDF(
          path.join(process.cwd(), 'uploads', paper.pdfPath),
          geminiApiKey
        )
        
        // Check for abstract
        pdfCheck.hasAbstract = /abstract/i.test(pdfText.text)
        
        // Check for conclusion
        pdfCheck.hasConclusion = /conclusion/i.test(pdfText.text) || /concluding/i.test(pdfText.text)
        
        // Extract authors from PDF metadata - use robust extraction if available
        if (pdfText.metadata?.authors && Array.isArray(pdfText.metadata.authors) && pdfText.metadata.authors.length > 0) {
          // Use robustly extracted authors from first page
          pdfAuthors = pdfText.metadata.authors.map((name: string) => ({ 
            name, 
            display_name: name 
          }))
        } else if (pdfText.metadata?.author) {
          // Fallback to author field
          const authorString = pdfText.metadata.author
          pdfAuthors = authorString
            .split(/[,;]/)
            .map((a: string) => a.trim())
            .filter(Boolean)
            .map((name: string) => ({ name, display_name: name }))
        }
        
        // Extract year from PDF metadata - use robust extraction if available
        if (pdfText.metadata?.year) {
          pdfYear = pdfText.metadata.year
        } else if (pdfText.metadata?.creationDate) {
          // Fallback to creation date
          const dateMatch = pdfText.metadata.creationDate.match(/(\d{4})/)
          if (dateMatch) {
            pdfYear = parseInt(dateMatch[1], 10)
          }
        } else if (pdfText.metadata?.modDate) {
          // Fallback to mod date
          const dateMatch = pdfText.metadata.modDate.match(/(\d{4})/)
          if (dateMatch) {
            pdfYear = parseInt(dateMatch[1], 10)
          }
        }
      } catch (error: any) {
        console.error('Error checking PDF content:', error)
        // Check if it's a connection error (PDF service not running)
        if (error.code === 'ECONNREFUSED' || error.message?.includes('ECONNREFUSED')) {
          pdfCheck.serviceUnavailable = true
        }
      }
    }

    // Validate with OpenAlex if we have title and (authors or year)
    let openAlexValidation: any = null
    const authorsForValidation = paper.authors?.map(pa => ({
      name: pa.author.name,
      display_name: pa.author.name,
    })) || pdfAuthors
    
    if (paper.title && (authorsForValidation.length > 0 || paper.year || pdfYear)) {
      try {
        openAlexValidation = await validateWithOpenAlex({
          title: paper.title,
          authors: authorsForValidation,
          year: paper.year || pdfYear,
        })
      } catch (error: any) {
        console.error('Error validating with OpenAlex:', error)
        // Don't fail validation if OpenAlex validation fails
      }
    }

    // Check if this is an uploaded paper that hasn't been processed yet
    const isUploadedPaper = paper.source === 'upload'
    const pdfExtractionFailed = (paper.metadata as any)?.pdfExtractionFailed === true
    const pdfServiceUnavailable = pdfCheck.serviceUnavailable || pdfExtractionFailed

    // Determine status
    let status = paper.status
    let needsReview = false
    let reviewReason = ''
    const validationNotes: string[] = []

    // For uploaded papers with PDF service unavailable, be more lenient
    if (isUploadedPaper && pdfServiceUnavailable && (!paper.authors || paper.authors.length === 0)) {
      // Don't reject - mark for review instead
      status = 'NEEDS_REVIEW'
      needsReview = true
      reviewReason = 'PDF processing service unavailable. Please start the Python service or add metadata manually.'
      validationNotes.push('PDF service unavailable - metadata extraction pending')
    } else if (!validation.isValid) {
      // Only reject if it's not an uploaded paper waiting for processing
      status = 'REJECTED'
      validationNotes.push(...validation.errors)
    } else if (duplicateCheck.isDuplicate && duplicateCheck.similarityScore && duplicateCheck.similarityScore > 0.9) {
      status = 'REJECTED'
      validationNotes.push(`Duplicate detected (similarity: ${duplicateCheck.similarityScore})`)
    } else {
      // Check OpenAlex validation results
      if (openAlexValidation) {
        if (!openAlexValidation.found) {
          validationNotes.push('No matching paper found in OpenAlex database')
          needsReview = true
        } else if (openAlexValidation.matchScore < 0.7) {
          validationNotes.push(`OpenAlex validation failed (match score: ${openAlexValidation.matchScore.toFixed(2)})`)
          if (openAlexValidation.differences.length > 0) {
            validationNotes.push(...openAlexValidation.differences)
          }
          needsReview = true
        } else if (!openAlexValidation.titleMatch || !openAlexValidation.yearMatch || !openAlexValidation.authorMatch) {
          // Good overall match but some fields don't match
          if (!openAlexValidation.titleMatch) {
            validationNotes.push('Title mismatch with OpenAlex')
          }
          if (!openAlexValidation.yearMatch) {
            validationNotes.push('Year mismatch with OpenAlex')
          }
          if (!openAlexValidation.authorMatch) {
            validationNotes.push('Author mismatch with OpenAlex')
          }
          needsReview = true
        } else if (openAlexValidation.warnings.length > 0) {
          validationNotes.push(...openAlexValidation.warnings)
        }
      }

      if (validation.warnings.length > 0 || duplicateCheck.isDuplicate) {
        status = 'NEEDS_REVIEW'
        needsReview = true
        validationNotes.push(...validation.warnings)
        if (duplicateCheck.isDuplicate) {
          reviewReason = `Possible duplicate (similarity: ${duplicateCheck.similarityScore})`
        }
      } else if (validation.isValid && pdfCheck.hasAbstract && pdfCheck.hasConclusion && !pdfServiceUnavailable && (!openAlexValidation || (openAlexValidation.found && openAlexValidation.matchScore >= 0.7 && openAlexValidation.titleMatch && openAlexValidation.yearMatch && openAlexValidation.authorMatch))) {
        status = 'VALIDATED'
      } else {
        status = 'NEEDS_REVIEW'
        needsReview = true
        if (pdfServiceUnavailable) {
          validationNotes.push('PDF processing service unavailable')
        } else {
          if (!pdfCheck.hasAbstract) validationNotes.push('Abstract not found in PDF')
          if (!pdfCheck.hasConclusion) validationNotes.push('Conclusion section not found in PDF')
        }
      }
    }

    // Update paper
    const updatedPaper = await prisma.paper.update({
      where: { id: params.id },
      data: {
        status,
        needsReview,
        reviewReason: reviewReason || validationNotes.join('; '),
        validationNotes: validationNotes.join('; '),
        validatedAt: status === 'VALIDATED' ? new Date() : null,
      },
    })

    // Create similarity report if duplicate found
    if (duplicateCheck.isDuplicate && duplicateCheck.similarPaperId) {
      await prisma.similarityReport.create({
        data: {
          paperId: params.id,
          comparedPaperId: duplicateCheck.similarPaperId,
          similarityType: 'title',
          similarityScore: duplicateCheck.similarityScore || 0,
          levenshteinDistance: null,
        },
      })
    }

    // Send alerts
    if (status === 'VALIDATED') {
      await sendAlert({
        type: 'PAPER_VALIDATED',
        severity: 'INFO',
        title: `Paper Validated: ${paper.title}`,
        message: `Paper "${paper.title}" has been validated successfully.`,
        paperId: params.id,
      })
    } else if (status === 'REJECTED') {
      await sendAlert({
        type: 'PAPER_REJECTED',
        severity: 'WARNING',
        title: `Paper Rejected: ${paper.title}`,
        message: `Paper "${paper.title}" was rejected. Reasons: ${validationNotes.join('; ')}`,
        paperId: params.id,
      })
    }

    return NextResponse.json({
      success: true,
      paper: updatedPaper,
      validation,
      duplicateCheck,
      pdfCheck,
      openAlexValidation,
    })
  } catch (error: any) {
    console.error('Error validating paper:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to validate paper' },
      { status: 500 }
    )
  }
}


import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/src/lib/prisma'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'
import fs from 'fs'
import { extractTextFromPDF, extractReferencesFromPDF, extractFiguresFromPDF, validateContent } from '@/src/lib/api/pdf-service'
import { checkDuplicatePaper } from '@/src/lib/validation'
import { validateWithOpenAlex } from '@/src/lib/api/openalex'
import { getCrossrefPaperByDOI } from '@/src/lib/api/crossref'
import { searchCrossrefPapers } from '@/src/lib/api/crossref'
import { extractTitle, calculateTitleSimilarity } from '@/src/lib/reference-extraction'

// Helper function to process a single file
async function processFile(
  file: File,
  geminiApiKey: string | undefined,
  uploadsDir: string
): Promise<{ success: boolean; paper?: any; error?: string; filename: string }> {
  try {
    // Validate file type
    if (file.type !== 'application/pdf' && !file.name.endsWith('.pdf')) {
      return {
        success: false,
        error: `Only PDF files are allowed. File: ${file.name}`,
        filename: file.name,
      }
    }

    // Validate file size (e.g., 50MB limit)
    const maxSize = 50 * 1024 * 1024 // 50MB
    if (file.size > maxSize) {
      return {
        success: false,
        error: `File size exceeds 50MB limit. File: ${file.name}`,
        filename: file.name,
      }
    }

    // Generate unique filename
    const timestamp = Date.now()
    const randomSuffix = Math.random().toString(36).substring(2, 9)
    const sanitizedFilename = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
    const filename = `${timestamp}_${randomSuffix}_${sanitizedFilename}`
    const filePath = path.join(uploadsDir, filename)

    // Save file
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    await writeFile(filePath, buffer)

    // Extract metadata from PDF
    // Use PDF filename as paper title (remove .pdf extension and replace underscores with spaces)
    let title = file.name.replace(/\.pdf$/i, '').replace(/_/g, ' ').trim()
    let abstract: string | null = null
    let extractedMetadata: any = {}
    let pdfExtractionFailed = false
    let extractedAuthors: Array<{ name?: string; display_name?: string }> = []
    let extractedYear: number | null = null

    try {
      const textResult = await extractTextFromPDF(filePath, geminiApiKey)
      extractedMetadata = textResult.metadata

      // Keep PDF filename as title - don't override with extracted metadata
      // The filename is the source of truth for the paper name

      // Extract authors from PDF metadata - use robust extraction if available
      if (textResult.metadata?.authors && Array.isArray(textResult.metadata.authors) && textResult.metadata.authors.length > 0) {
        // Use robustly extracted authors from first page
        extractedAuthors = textResult.metadata.authors.map((name: string) => ({ 
          name, 
          display_name: name 
        }))
      } else if (textResult.metadata?.author) {
        // Fallback to author field (might be a single string)
        const authorString = textResult.metadata.author
        extractedAuthors = authorString
          .split(/[,;]/)
          .map(a => a.trim())
          .filter(Boolean)
          .map(name => ({ name, display_name: name }))
      }

      // Extract year - use robust extraction if available
      if (textResult.metadata?.year) {
        extractedYear = textResult.metadata.year
      } else if (textResult.metadata?.creationDate) {
        // Fallback to creation date
        const dateMatch = textResult.metadata.creationDate.match(/(\d{4})/)
        if (dateMatch) {
          extractedYear = parseInt(dateMatch[1], 10)
        }
      } else if (textResult.metadata?.modDate) {
        // Fallback to mod date
        const dateMatch = textResult.metadata.modDate.match(/(\d{4})/)
        if (dateMatch) {
          extractedYear = parseInt(dateMatch[1], 10)
        }
      }

      // Try to extract abstract (usually between "Abstract" and "Introduction" or "1. Introduction")
      const abstractMatch = textResult.text.match(
        /abstract[:\s]*([\s\S]*?)(?:introduction|1\.|keywords|index terms)/i
      )
      if (abstractMatch && abstractMatch[1]) {
        abstract = abstractMatch[1].trim().substring(0, 2000) // Limit abstract length
      }
    } catch (error: any) {
      console.error(`Error extracting PDF metadata for ${file.name}:`, error)
      pdfExtractionFailed = true
      // Continue without extracted metadata - will need manual review
      if (error.code === 'ECONNREFUSED' || error.message?.includes('ECONNREFUSED')) {
        extractedMetadata.pdfServiceUnavailable = true
        extractedMetadata.pdfServiceError = 'PDF processing service is not available. Please start the Python service to extract metadata, references, and diagrams.'
      }
    }

    // Validate with OpenAlex if we have title, authors, or year
    let openAlexValidation: any = null
    if (title && (extractedAuthors.length > 0 || extractedYear)) {
      try {
        openAlexValidation = await validateWithOpenAlex({
          title,
          authors: extractedAuthors,
          year: extractedYear,
        })
        extractedMetadata.openAlexValidation = openAlexValidation
      } catch (error: any) {
        console.error(`Error validating with OpenAlex for ${file.name}:`, error)
        // Don't fail upload if OpenAlex validation fails
      }
    }

    // Check for duplicates
    const duplicateCheck = await checkDuplicatePaper({
      title,
      doi: null,
      authors: [],
    })

    if (duplicateCheck.isDuplicate && duplicateCheck.similarityScore && duplicateCheck.similarityScore > 0.9) {
      // Delete uploaded file if it's a duplicate
      try {
        await import('fs/promises').then((fs) => fs.unlink(filePath))
      } catch (e) {
        // Ignore deletion errors
      }
      return {
        success: false,
        error: `Duplicate paper detected (similarity: ${duplicateCheck.similarityScore})`,
        filename: file.name,
      }
    }

    // Determine status - consider OpenAlex validation results
    let needsReview = duplicateCheck.isDuplicate || pdfExtractionFailed
    let reviewReason = duplicateCheck.isDuplicate
      ? `Possible duplicate (similarity: ${duplicateCheck.similarityScore})`
      : pdfExtractionFailed
      ? 'PDF metadata extraction failed. Please process manually or start the PDF service.'
      : null

    // If OpenAlex validation found issues, mark for review
    if (openAlexValidation) {
      if (!openAlexValidation.found) {
        needsReview = true
        reviewReason = reviewReason 
          ? `${reviewReason}; No matching paper found in OpenAlex`
          : 'No matching paper found in OpenAlex database'
      } else if (openAlexValidation.matchScore < 0.7) {
        needsReview = true
        const issues = openAlexValidation.differences.join(', ')
        reviewReason = reviewReason
          ? `${reviewReason}; OpenAlex validation issues: ${issues}`
          : `OpenAlex validation issues: ${issues}`
      } else if (openAlexValidation.differences.length > 0) {
        // Good match but has some differences - add as warning
        extractedMetadata.openAlexWarnings = openAlexValidation.differences
      }
    }

    const status = needsReview ? 'NEEDS_REVIEW' : 'PENDING'

    // Create paper record
    const paper = await prisma.paper.create({
      data: {
        title,
        abstract,
        pdfPath: filename,
        status,
        needsReview,
        reviewReason,
        source: 'upload',
        metadata: {
          ...extractedMetadata,
          originalFilename: file.name,
          fileSize: file.size,
          uploadedAt: new Date().toISOString(),
          pdfExtractionFailed,
        },
      },
      include: {
        authors: {
          include: {
            author: true,
          },
        },
      },
    })

    // Create similarity report if duplicate found
    if (duplicateCheck.isDuplicate && duplicateCheck.similarPaperId) {
      await prisma.similarityReport.create({
        data: {
          paperId: paper.id,
          comparedPaperId: duplicateCheck.similarPaperId,
          similarityType: 'title',
          similarityScore: duplicateCheck.similarityScore || 0,
        },
      })
    }

    // Automatically extract and validate references
    let referencesExtracted = false
    let referencesValidated = false
    let referenceValidationPercentage = 0
    let contentCheckPercentage = 0
    let validationAnalysis: any = null

    try {
      if (paper.pdfPath && fs.existsSync(path.join(process.cwd(), 'uploads', paper.pdfPath))) {
        // Extract references from PDF
        const pdfPath = path.join(process.cwd(), 'uploads', paper.pdfPath)
        const referencesResult = await extractReferencesFromPDF(pdfPath, geminiApiKey)
        
        if (referencesResult.references && referencesResult.references.length > 0) {
          // Save references to database with AI extraction data
          for (const ref of referencesResult.references) {
            // Store AI extraction data if available
            const aiExtraction = (ref as any).ai_extraction || (ref as any).aiExtraction || null
            
            await prisma.reference.create({
              data: {
                paperId: paper.id,
                order: ref.order || 0,
                rawText: ref.raw_text || ref.rawText || '',
                normalizedTitle: ref.normalized_title || ref.normalizedTitle || null,
                normalizedAuthors: ref.normalized_authors || ref.normalizedAuthors || null,
                normalizedYear: ref.normalized_year || ref.normalizedYear || null,
                normalizedDoi: ref.normalized_doi || ref.normalizedDoi || null,
                normalizedVenue: ref.normalized_venue || ref.normalizedVenue || null,
                status: 'PENDING',
                // Store AI extraction data in verificationData for future use
                verificationData: aiExtraction ? {
                  aiExtraction: aiExtraction,
                } : null,
              },
            })
          }
          referencesExtracted = true

          // Automatically validate references
          const references = await prisma.reference.findMany({
            where: { paperId: paper.id },
          })

          let validCount = 0
          let invalidCount = 0
          let missingCount = 0

          for (const ref of references) {
            let status: 'VALID' | 'INVALID' | 'MISSING' = 'MISSING'
            let verificationData: any = null

            // Try to find reference using Crossref
            if (ref.normalizedDoi) {
              try {
                const crossrefPaper = await getCrossrefPaperByDOI(ref.normalizedDoi)
                if (crossrefPaper) {
                  status = 'VALID'
                  verificationData = {
                    source: 'crossref',
                    data: crossrefPaper,
                    matchScore: 1,
                  }
                }
              } catch (error) {
                console.error(`Error fetching Crossref paper by DOI for ref ${ref.id}:`, error)
              }
            }

            // If no DOI match, try title search
            if (status === 'MISSING' && ref.normalizedTitle) {
              try {
                const searchTitle = ref.normalizedTitle
                  .replace(/\u2018|\u2019/g, "'")
                  .replace(/\u201C|\u201D/g, '"')
                  .replace(/\u2013|\u2014/g, '-')
                  .replace(/\u2026/g, '...')
                  .replace(/[,\.;:]+$/, '')
                  .trim()

                const crossrefResults = await searchCrossrefPapers({
                  query: searchTitle,
                  rows: 3,
                })

                if (crossrefResults.length > 0) {
                  // Find best match
                  let bestMatch = crossrefResults[0]
                  let bestScore = 0

                  for (const result of crossrefResults) {
                    const apiTitle = result.title?.[0] || ''
                    const refTitle = ref.normalizedTitle || ''
                    const similarity = calculateTitleSimilarity(refTitle, apiTitle)

                    if (similarity > bestScore) {
                      bestScore = similarity
                      bestMatch = result
                    }
                  }

                  if (bestScore > 0.7) {
                    status = 'VALID'
                    verificationData = {
                      source: 'crossref_search',
                      data: bestMatch,
                      matchScore: bestScore,
                      titleSimilarity: bestScore,
                    }
                  } else if (bestScore > 0.5) {
                    status = 'INVALID'
                    verificationData = {
                      source: 'crossref_search',
                      data: bestMatch,
                      matchScore: bestScore,
                      titleSimilarity: bestScore,
                    }
                  }
                }
              } catch (error) {
                console.error(`Error searching Crossref for ref ${ref.id}:`, error)
              }
            }

            // Count statuses
            if (status === 'VALID') validCount++
            else if (status === 'INVALID') invalidCount++
            else missingCount++

            // Update reference with validation results
            await prisma.reference.update({
              where: { id: ref.id },
              data: {
                status,
                verificationData,
              },
            })
          }

          // Calculate reference validation percentage
          const totalReferences = references.length
          if (totalReferences > 0) {
            referenceValidationPercentage = (validCount / totalReferences) * 100
          }
          referencesValidated = true

          // Run content check
          try {
            const textResult = await extractTextFromPDF(pdfPath, geminiApiKey)
            if (textResult && textResult.text) {
              const referencesForValidation = references.map(ref => ({
                order: ref.order,
                raw_text: ref.rawText,
                normalized_authors: ref.normalizedAuthors || undefined,
                normalized_title: ref.normalizedTitle || undefined,
                normalized_year: ref.normalizedYear || undefined,
                normalized_doi: ref.normalizedDoi || undefined,
                normalized_venue: ref.normalizedVenue || undefined,
              }))

              const contentValidationResults = await validateContent(
                textResult.text,
                referencesForValidation
              )

              // Calculate content check percentage (references cited in text)
              if (contentValidationResults.reference_validation && contentValidationResults.reference_validation.length > 0) {
                const citedCount = contentValidationResults.reference_validation.filter(
                  (r: any) => r.content_check?.valid
                ).length
                contentCheckPercentage = (citedCount / contentValidationResults.reference_validation.length) * 100

                // Update references with content check results
                for (const refValidation of contentValidationResults.reference_validation) {
                  const ref = references.find(r => r.order === refValidation.order)
                  if (ref) {
                    const currentVerificationData = (ref.verificationData as any) || {}
                    await prisma.reference.update({
                      where: { id: ref.id },
                      data: {
                        verificationData: {
                          ...currentVerificationData,
                          contentCheck: refValidation.content_check,
                        },
                      },
                    })
                  }
                }
              }

              // Store content validation results in paper metadata
              validationAnalysis = {
                referenceValidation: {
                  percentage: referenceValidationPercentage,
                  valid: validCount,
                  invalid: invalidCount,
                  missing: missingCount,
                  total: totalReferences,
                },
                contentCheck: {
                  percentage: contentCheckPercentage,
                  ...contentValidationResults.figure_validation,
                },
                overallStatus: 'PENDING',
                reason: '',
              }

              // Determine overall status based on 75% threshold
              if (referenceValidationPercentage >= 75 && contentCheckPercentage >= 75) {
                validationAnalysis.overallStatus = 'VALID'
                validationAnalysis.reason = `Both reference validation (${referenceValidationPercentage.toFixed(1)}%) and content check (${contentCheckPercentage.toFixed(1)}%) meet the 75% threshold.`
              } else {
                validationAnalysis.overallStatus = 'INVALID'
                const reasons = []
                if (referenceValidationPercentage < 75) {
                  reasons.push(`Reference validation is ${referenceValidationPercentage.toFixed(1)}% (below 75% threshold)`)
                }
                if (contentCheckPercentage < 75) {
                  reasons.push(`Content check is ${contentCheckPercentage.toFixed(1)}% (below 75% threshold)`)
                }
                validationAnalysis.reason = reasons.join('; ')
              }
            }
          } catch (error) {
            console.error(`Error running content check for ${file.name}:`, error)
            validationAnalysis = {
              referenceValidation: {
                percentage: referenceValidationPercentage,
                valid: validCount,
                invalid: invalidCount,
                missing: missingCount,
                total: totalReferences,
              },
              contentCheck: {
                percentage: 0,
                error: 'Content check failed',
              },
              overallStatus: 'PENDING',
              reason: 'Content check could not be completed',
            }
          }
        }
      }
    } catch (error) {
      console.error(`Error extracting/validating references for ${file.name}:`, error)
      // Don't fail the upload if reference extraction/validation fails
    }

    // Automatically extract diagrams/figures
    let diagramsExtracted = false
    try {
      if (paper.pdfPath && fs.existsSync(path.join(process.cwd(), 'uploads', paper.pdfPath))) {
        const pdfPath = path.join(process.cwd(), 'uploads', paper.pdfPath)
        const figuresResult = await extractFiguresFromPDF(pdfPath)
        
        if (figuresResult.figures && figuresResult.figures.length > 0) {
          // Delete existing diagrams to avoid duplicates
          await prisma.diagram.deleteMany({
            where: { paperId: paper.id },
          })

          // Save diagrams to database
          for (const figure of figuresResult.figures) {
            await prisma.diagram.create({
              data: {
                paperId: paper.id,
                pageNumber: figure.page || 1,
                imagePath: figure.path || '',
                perceptualHash: figure.hash || '',
                width: figure.width || 0,
                height: figure.height || 0,
                type: figure.type || 'unknown',
              },
            })
          }
          diagramsExtracted = true
        }
      }
    } catch (error) {
      console.error(`Error extracting diagrams for ${file.name}:`, error)
      // Don't fail the upload if diagram extraction fails
    }

    // Update paper with validation results and status
    if (validationAnalysis) {
      const finalStatus = validationAnalysis.overallStatus === 'VALID' ? 'VALIDATED' : 
                         (needsReview ? 'NEEDS_REVIEW' : 'PENDING')
      
      await prisma.paper.update({
        where: { id: paper.id },
        data: {
          status: finalStatus,
          metadata: {
            ...(paper.metadata as any || {}),
            validationAnalysis,
            contentValidation: validationAnalysis.contentCheck,
          },
        },
      })
    }

    // Fetch updated paper with validation results
    const updatedPaper = await prisma.paper.findUnique({
      where: { id: paper.id },
      include: {
        authors: {
          include: {
            author: true,
          },
        },
      },
    })

    return {
      success: true,
      paper: updatedPaper,
      filename: file.name,
      referencesExtracted,
      referencesValidated,
      diagramsExtracted,
      validationAnalysis,
    }
  } catch (error: any) {
    console.error(`Error processing file ${file.name}:`, error)
    return {
      success: false,
      error: error.message || 'Failed to process file',
      filename: file.name,
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    
    // Get all files (support both single 'file' and multiple 'files[]')
    const files: File[] = []
    const fileField = formData.get('file') as File | null
    const filesField = formData.getAll('files[]') as File[]
    
    if (fileField) {
      files.push(fileField)
    }
    if (filesField && filesField.length > 0) {
      files.push(...filesField)
    }

    if (files.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 })
    }

    // Create uploads directory if it doesn't exist
    const uploadsDir = path.join(process.cwd(), 'uploads')
    await mkdir(uploadsDir, { recursive: true })

    // Get Gemini API key from settings (once for all files)
    let geminiApiKey: string | undefined
    try {
      const settings = await prisma.setting.findUnique({
        where: { id: 'settings' },
      })
      geminiApiKey = settings?.geminiApiKey || undefined
    } catch (error) {
      console.warn('Could not fetch Gemini API key from settings:', error)
    }

    // Process all files
    const results = await Promise.all(
      files.map(file => processFile(file, geminiApiKey, uploadsDir))
    )

    // Separate successful and failed uploads
    const successful = results.filter(r => r.success)
    const failed = results.filter(r => !r.success)

    return NextResponse.json({
      success: true,
      total: files.length,
      successful: successful.length,
      failed: failed.length,
      papers: successful.map(r => r.paper),
      errors: failed.map(r => ({ filename: r.filename, error: r.error })),
    })
  } catch (error: any) {
    console.error('Error uploading file:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to upload file' },
      { status: 500 }
    )
  }
}


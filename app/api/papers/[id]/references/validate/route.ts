import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/src/lib/prisma'
import { extractReferencesFromPDF, extractTextFromPDF, validateContent } from '@/src/lib/api/pdf-service'
import { getCrossrefPaperByDOI } from '@/src/lib/api/crossref'
import { searchCrossrefPapers } from '@/src/lib/api/crossref'
import { sendAlert } from '@/src/lib/alerts'
import { extractTitle, calculateTitleSimilarity } from '@/src/lib/reference-extraction'
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

    // Use existing references from database (don't extract from PDF again)
    let extractedReferences: any[] = []
    const existingRefs = await prisma.reference.findMany({
      where: { paperId: params.id },
    })

    if (existingRefs.length > 0) {
      // Use existing extracted data from database
      extractedReferences = existingRefs.map(ref => ({
        order: ref.order,
        raw_text: ref.rawText,
        normalized_title: ref.normalizedTitle,
        normalized_authors: ref.normalizedAuthors,
        normalized_year: ref.normalizedYear,
        normalized_doi: ref.normalizedDoi,
        normalized_venue: ref.normalizedVenue,
        ai_extraction: ref.verificationData ? (ref.verificationData as any).aiExtraction : null
      }))
    } else {
      // Only extract from PDF if no references exist in database
      if (paper.pdfPath && fs.existsSync(path.join(process.cwd(), 'uploads', paper.pdfPath))) {
        try {
          const result = await extractReferencesFromPDF(
            path.join(process.cwd(), 'uploads', paper.pdfPath),
            geminiApiKey
          )
          extractedReferences = result.references

          // Save extracted references to database with AI extraction data
          if (extractedReferences.length > 0) {
            for (const ref of extractedReferences) {
              // Store AI extraction data if available
              const aiExtraction = (ref as any).ai_extraction || (ref as any).aiExtraction || null

              await prisma.reference.create({
                data: {
                  paperId: params.id,
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
                  } : undefined,
                },
              })
            }
          }
        } catch (error) {
          console.error('Error extracting references:', error)
        }
      }
    }

    // --- CONTENT VALIDATION START ---
    let contentValidationResults: any = null
    if (paper.pdfPath && fs.existsSync(path.join(process.cwd(), 'uploads', paper.pdfPath))) {
      try {
        console.log('Extracting text for content validation...')
        const textResult = await extractTextFromPDF(
          path.join(process.cwd(), 'uploads', paper.pdfPath),
          geminiApiKey
        )

        if (textResult && textResult.text) {
          console.log('Validating content against text...')
          contentValidationResults = await validateContent(textResult.text, extractedReferences)
          console.log('Content validation complete.')
        }
      } catch (error) {
        console.error('Error during content validation:', error)
      }
    }
    // --- CONTENT VALIDATION END ---

    // Verify each reference
    const verificationResults = []
    let validCount = 0
    let invalidCount = 0
    let missingCount = 0

    for (const ref of extractedReferences) {
      let status: 'VALID' | 'INVALID' | 'MISSING' = 'MISSING'
      let verificationData: any = null

      // Get content check result for this reference
      const contentCheck = contentValidationResults?.reference_validation?.find(
        (r: any) => r.order === ref.order
      )?.content_check

      // Log PDF extracted data
      console.log(`\n[Reference #${ref.order}] PDF Extracted Data:`)
      console.log('  - Raw Text:', ref.raw_text?.substring(0, 500) || 'N/A')
      console.log('  - Normalized Title:', ref.normalized_title || 'N/A')
      console.log('  - Normalized Authors:', ref.normalized_authors || 'N/A')
      console.log('  - Normalized Year:', ref.normalized_year || 'N/A')
      console.log('  - Normalized DOI:', ref.normalized_doi || 'N/A')
      console.log('  - Normalized Venue:', ref.normalized_venue || 'N/A')
      if (contentCheck) {
        console.log(`  - Content Check: ${contentCheck.valid ? 'VALID' : 'INVALID'} (${contentCheck.reason})`)
      }

      // Try to verify using DOI first
      if (ref.normalized_doi) {
        console.log(`  [Reference #${ref.order}] Attempting DOI validation: ${ref.normalized_doi}`)
        try {
          // Try CrossRef first
          console.log(`  [Reference #${ref.order}] Checking CrossRef...`)
          const crossrefPaper = await getCrossrefPaperByDOI(ref.normalized_doi)
          if (crossrefPaper) {
            console.log(`  [Reference #${ref.order}] ✅ Found in CrossRef:`, crossrefPaper.title?.[0] || 'N/A')
            status = 'VALID'
            verificationData = {
              source: 'crossref',
              data: crossrefPaper,
              aiExtraction: ref.ai_extraction || null,  // Store AI extraction data
              contentCheck: contentCheck || null
            }
            validCount++
          } else {
            console.log(`  [Reference #${ref.order}] ❌ Not found in CrossRef`)
            status = 'MISSING'
            missingCount++
          }
        } catch (error: any) {
          console.error(`  [Reference #${ref.order}] ❌ Error validating DOI:`, error.message)
          status = 'INVALID'
          invalidCount++
        }
      } else {
        // No DOI, try to validate using title, authors, and year via Crossref search
        // Use the title extracted by Python service (from pdfplumber robust extraction)
        if (ref.normalized_title || ref.raw_text) {
          // Prefer normalized_title from Python service (extracted using robust methods)
          let titleToSearch = ref.normalized_title
          let extractedTitle = ref.normalized_title

          console.log(`  [Reference #${ref.order}] Using extracted title for API search`)
          console.log(`  [Reference #${ref.order}] Extracted Title: "${extractedTitle || 'N/A'}"`)

          try {
            // If normalized_title is missing, extract from raw text using utility function
            if (!titleToSearch && ref.raw_text) {
              console.log(`  [Reference #${ref.order}] Extracting title from raw text...`)

              const result = extractTitle(ref.raw_text)
              titleToSearch = result.title
              extractedTitle = result.title

              console.log(`  [Reference #${ref.order}] ${result.confidence.toUpperCase()} confidence: "${titleToSearch}"`)
            } else if (titleToSearch) {
              extractedTitle = titleToSearch
              console.log(`  [Reference #${ref.order}] Using normalized title:`, titleToSearch)
            }

            // Clean title before searching - remove curly quotes and problematic characters
            let searchQuery = titleToSearch || ref.raw_text.substring(0, 100)
            // Comprehensive cleaning using Unicode escapes for reliability
            searchQuery = searchQuery
              .replace(/\u2018|\u2019/g, "'")  // Left/Right single quotation mark
              .replace(/\u201C|\u201D/g, '"')   // Left/Right double quotation mark
              .replace(/\u2013|\u2014/g, '-')   // En-dash and Em-dash
              .replace(/\u2026/g, '...')        // Ellipsis
              .replace(/[,\.;:]+$/, '')         // Remove trailing punctuation
              .replace(/^["'"]+/, '')           // Remove leading quotes
              .replace(/["'"]+$/, '')           // Remove trailing quotes
              .replace(/\s+/g, ' ')             // Normalize spaces
              .trim()

            console.log(`  [Reference #${ref.order}] 🔍 Searching Crossref with title:`, searchQuery)

            // Search Crossref by title
            const searchResults = await searchCrossrefPapers({
              query: searchQuery,
              rows: 5,
            })

            console.log(`  [Reference #${ref.order}] Crossref returned ${searchResults.length} results`)

            if (searchResults.length > 0) {
              // Find best match by comparing title, authors, and year
              let bestMatch: any = searchResults[0] // Default to first result
              let bestScore = 0

              console.log(`  [Reference #${ref.order}] Comparing with ${searchResults.length} Crossref results:`)

              for (let i = 0; i < searchResults.length; i++) {
                const paper = searchResults[i]
                let score = 0
                let matches = 0
                const matchDetails: string[] = []

                const paperTitle = paper.title?.[0] || ''
                const paperYear = paper.published?.['date-parts']?.[0]?.[0]
                console.log(`    Result ${i + 1}: "${paperTitle}" (${paperYear || 'N/A'})`)

                // Compare title - use extracted title from PDF
                const refTitle = extractedTitle || ref.normalized_title || titleToSearch
                if (refTitle && paperTitle) {
                  console.log(`      PDF Title: "${refTitle}"`)
                  console.log(`      API Title: "${paperTitle}"`)

                  // Calculate similarity using utility function
                  const titleSimilarity = calculateTitleSimilarity(
                    refTitle,
                    paperTitle
                  )

                  console.log(`      Title similarity: ${(titleSimilarity * 100).toFixed(1)}%`)

                  if (titleSimilarity > 0.6) {
                    score += 0.4
                    matches++
                    matchDetails.push(`Title match (${(titleSimilarity * 100).toFixed(0)}% similarity, +0.4)`)
                  } else if (titleSimilarity > 0.3) {
                    score += 0.2
                    matchDetails.push(`Title partial match (${(titleSimilarity * 100).toFixed(0)}% similarity, +0.2)`)
                  } else {
                    matchDetails.push(`Title mismatch (${(titleSimilarity * 100).toFixed(0)}% similarity)`)
                  }
                } else {
                  matchDetails.push(`Title missing: PDF=${!!refTitle}, API=${!!paperTitle}`)
                }

                // Compare year
                if (ref.normalized_year && paperYear) {
                  if (ref.normalized_year === paperYear) {
                    score += 0.3
                    matches++
                    matchDetails.push(`Year match: ${ref.normalized_year} (+0.3)`)
                  } else {
                    matchDetails.push(`Year mismatch: PDF=${ref.normalized_year}, API=${paperYear}`)
                  }
                } else if (ref.normalized_year) {
                  matchDetails.push(`Year missing in API (PDF has ${ref.normalized_year})`)
                } else if (paperYear) {
                  matchDetails.push(`Year missing in PDF (API has ${paperYear})`)
                }

                // Compare authors - Crossref format
                if (ref.normalized_authors && paper.author && paper.author.length > 0) {
                  const refAuthors = ref.normalized_authors.toLowerCase()
                  const apiAuthors = paper.author.map((a: any) =>
                    `${a.given || ''} ${a.family}`.trim().toLowerCase()
                  )

                  console.log(`      PDF Authors: "${ref.normalized_authors}"`)
                  console.log(`      API Authors: "${apiAuthors.join(', ')}"`)

                  // Extract first author from PDF (usually before comma or "et al")
                  const pdfFirstAuthor = refAuthors.split(/[,;]|et\s+al/)[0]?.trim() || refAuthors
                  const pdfFirstAuthorParts = pdfFirstAuthor.split(/\s+/).filter((p: string) => p.length > 1)

                  // Check if any API author matches
                  let authorMatchCount = 0
                  let bestAuthorMatch = 0

                  for (const apiAuthor of apiAuthors) {
                    const apiAuthorParts = apiAuthor.split(/\s+/).filter((p: string) => p.length > 1)

                    // Check if first name or last name matches
                    const firstNameMatch = pdfFirstAuthorParts.some((p: string) =>
                      apiAuthorParts.some((ap: string) => ap === p || ap.startsWith(p) || p.startsWith(ap))
                    )
                    const lastNameMatch = pdfFirstAuthorParts.some((p: string) =>
                      apiAuthorParts.some((ap: string) => ap === p || ap.includes(p) || p.includes(ap))
                    )

                    // Check if full name is contained
                    const fullMatch = pdfFirstAuthor.includes(apiAuthor.split(' ')[0]) ||
                      apiAuthor.includes(pdfFirstAuthorParts[0] || '')

                    if (firstNameMatch || lastNameMatch || fullMatch) {
                      authorMatchCount++
                      bestAuthorMatch = Math.max(bestAuthorMatch, 0.8)
                    }
                  }

                  // Also check reverse (API author in PDF text)
                  const hasReverseMatch = apiAuthors.some(apiAuthor => {
                    const apiFirst = apiAuthor.split(' ')[0]
                    return refAuthors.includes(apiFirst) || pdfFirstAuthorParts.includes(apiFirst)
                  })

                  if (hasReverseMatch) {
                    bestAuthorMatch = Math.max(bestAuthorMatch, 0.7)
                  }

                  console.log(`      Author match score: ${(bestAuthorMatch * 100).toFixed(0)}% (${authorMatchCount} matches)`)

                  if (bestAuthorMatch > 0.6) {
                    score += 0.3
                    matches++
                    matchDetails.push(`Author match (${authorMatchCount} author(s), +0.3)`)
                  } else if (bestAuthorMatch > 0.3) {
                    score += 0.15
                    matchDetails.push(`Author partial match (${authorMatchCount} author(s), +0.15)`)
                  } else {
                    matchDetails.push(`Author mismatch: PDF="${ref.normalized_authors}" vs API="${apiAuthors.join(', ')}"`)
                  }
                } else if (ref.normalized_authors) {
                  matchDetails.push(`Authors missing in API (PDF has: ${ref.normalized_authors})`)
                } else if (paper.author && paper.author.length > 0) {
                  matchDetails.push(`Authors missing in PDF (API has: ${paper.author.map((a: any) => `${a.given || ''} ${a.family}`.trim()).join(', ')})`)
                }

                console.log(`      Score: ${score.toFixed(2)} - ${matchDetails.join('; ')}`)

                if (score > bestScore) {
                  bestScore = score
                  bestMatch = paper
                }
              }

              console.log(`  [Reference #${ref.order}] Best match score: ${bestScore.toFixed(2)}`)

              // If we found a good match, mark as VALID
              // Lower threshold to 0.4 for better matching, or 0.3 if title similarity is high
              const bestMatchTitle = bestMatch?.title?.[0] || ''
              const titleSimilarity = bestMatch ? calculateTitleSimilarity(
                extractedTitle || ref.normalized_title || titleToSearch || '',
                bestMatchTitle
              ) : 0
              if (bestMatch && (bestScore > 0.4 || (bestScore > 0.3 && titleSimilarity > 0.6))) {
                console.log(`  [Reference #${ref.order}] ✅ VALID - Matched with: "${bestMatchTitle}" (score: ${bestScore.toFixed(2)}, title similarity: ${(titleSimilarity * 100).toFixed(1)}%)`)
                status = 'VALID'
                verificationData = {
                  source: 'crossref_search',
                  data: bestMatch,
                  matchScore: bestScore,
                  titleSimilarity,
                  aiExtraction: ref.ai_extraction || null,  // Store AI extraction data
                  contentCheck: contentCheck || null
                }
                validCount++
              } else {
                // Found results but no good match - still store the data for viewing
                console.log(`  [Reference #${ref.order}] ❌ MISSING - No good match found (best score: ${bestScore.toFixed(2)} < 0.4, title similarity: ${(titleSimilarity * 100).toFixed(1)}%)`)
                status = 'MISSING'
                // Store partial data for viewing even if not a good match
                // Always store bestMatch if it exists (should always exist if searchResults.length > 0)
                if (bestMatch) {
                  verificationData = {
                    source: 'crossref_search',
                    data: bestMatch,
                    matchScore: bestScore,
                    titleSimilarity,
                    aiExtraction: ref.ai_extraction || null,
                    contentCheck: contentCheck || null
                  }
                } else {
                  // Fallback: use first result if bestMatch is somehow null
                  verificationData = {
                    source: 'crossref_search',
                    data: searchResults[0],
                    matchScore: bestScore,
                    titleSimilarity: 0,
                    aiExtraction: ref.ai_extraction || null,
                    contentCheck: contentCheck || null
                  }
                }
                missingCount++
              }
            } else {
              // No results found in Crossref - try searching with authors if available
              console.log(`  [Reference #${ref.order}] ❌ No results with title search, trying author search...`)
              
              let authorSearchResults: any[] = []
              if (ref.normalized_authors) {
                try {
                  // Extract first author name for search
                  const firstAuthor = ref.normalized_authors.split(/[,;]|et\s+al/i)[0]?.trim()
                  if (firstAuthor && firstAuthor.length > 3) {
                    // Try searching with author name
                    authorSearchResults = await searchCrossrefPapers({
                      query: firstAuthor,
                      rows: 5,
                    })
                    console.log(`  [Reference #${ref.order}] Author search returned ${authorSearchResults.length} results`)
                    
                    // Filter results by year if available
                    if (ref.normalized_year && authorSearchResults.length > 0) {
                      authorSearchResults = authorSearchResults.filter((result: any) => {
                        const resultYear = result.published?.['date-parts']?.[0]?.[0]
                        return !resultYear || Math.abs(resultYear - ref.normalized_year) <= 1
                      })
                      console.log(`  [Reference #${ref.order}] Filtered to ${authorSearchResults.length} results matching year ${ref.normalized_year}`)
                    }
                  }
                } catch (error) {
                  console.error(`  [Reference #${ref.order}] Error in author search:`, error)
                }
              }
              
              if (authorSearchResults.length > 0) {
                // Use first result from author search
                const bestMatch = authorSearchResults[0]
                const matchTitle = bestMatch.title?.[0] || ''
                const titleSimilarity = matchTitle ? calculateTitleSimilarity(
                  extractedTitle || ref.normalized_title || titleToSearch || '',
                  matchTitle
                ) : 0
                
                console.log(`  [Reference #${ref.order}] Using author search result: "${matchTitle}" (title similarity: ${(titleSimilarity * 100).toFixed(1)}%)`)
                status = 'MISSING' // Still mark as MISSING since title didn't match well
                verificationData = {
                  source: 'crossref_search',
                  data: bestMatch,
                  matchScore: titleSimilarity,
                  titleSimilarity,
                  aiExtraction: ref.ai_extraction || null,
                  contentCheck: contentCheck || null
                }
              } else {
                // No results found in Crossref at all
                console.log(`  [Reference #${ref.order}] ❌ MISSING - No results found in Crossref`)
                status = 'MISSING'
                // Still store AI extraction data even if no API match
                verificationData = {
                  aiExtraction: ref.ai_extraction || null,
                  contentCheck: contentCheck || null
                }
              }
              missingCount++
            }
          } catch (error: any) {
            // If search fails, mark as MISSING (not INVALID, since it might be valid but not in database)
            console.error(`  [Reference #${ref.order}] ❌ Error searching Crossref:`, error.message)
            status = 'MISSING'
            missingCount++
          }
        } else {
          // No title or raw text to search with
          console.log(`  [Reference #${ref.order}] ❌ MISSING - No title or raw text available for search`)
          status = 'MISSING'
          // Still store AI extraction data if available
          verificationData = {
            aiExtraction: ref.ai_extraction || null,
            contentCheck: contentCheck || null
          }
          missingCount++
        }
      }

      // --- CONTENT CHECK OVERRIDE ---
      // If content check is invalid (not cited in text), we might want to flag it even if it exists in CrossRef.
      // Or if content check is valid but CrossRef is missing, we might want to consider it "VALID" but "Unverified External".
      // For now, let's just store the data and let the UI decide how to display it.
      // But if the user wants "valid and invalid reference with reason", we should probably use the content check result.

      // If content check says INVALID (not cited), mark status as INVALID?
      if (contentCheck && !contentCheck.valid) {
        // status = 'INVALID' // Optional: Enforce content check as strict requirement?
        // For now, we'll keep the CrossRef status but the UI will show the warning.
      }
      // -----------------------------

      console.log(`  [Reference #${ref.order}] Final Status: ${status}\n`)

      // Create or update reference in DB
      const existingRef = await prisma.reference.findUnique({
        where: {
          paperId_order: {
            paperId: params.id,
            order: ref.order,
          },
        },
      })

      const reference = existingRef
        ? await prisma.reference.update({
          where: { id: existingRef.id },
          data: {
            rawText: ref.raw_text,
            normalizedTitle: ref.normalized_title,
            normalizedAuthors: ref.normalized_authors,
            normalizedYear: ref.normalized_year,
            normalizedDoi: ref.normalized_doi,
            normalizedVenue: ref.normalized_venue,
            status,
            verificationData: verificationData || undefined,
          },
        })
        : await prisma.reference.create({
          data: {
            paperId: params.id,
            order: ref.order,
            rawText: ref.raw_text,
            normalizedTitle: ref.normalized_title,
            normalizedAuthors: ref.normalized_authors,
            normalizedYear: ref.normalized_year,
            normalizedDoi: ref.normalized_doi,
            normalizedVenue: ref.normalized_venue,
            status,
            verificationData: verificationData || undefined,
          },
        })

      verificationResults.push(reference)

      // Send alert for invalid references
      if (status === 'INVALID') {
        await sendAlert({
          type: 'INVALID_REFERENCE',
          severity: 'WARNING',
          title: `Invalid Reference in Paper: ${paper.title}`,
          message: `Reference #${ref.order} could not be verified: ${ref.raw_text.substring(0, 100)}...`,
          paperId: params.id,
          referenceId: reference.id,
        })
      }
    }

    console.log(`  Missing: ${missingCount}\n`)

    // Save content validation results to Paper metadata
    if (contentValidationResults) {
      try {
        const currentMetadata = (paper.metadata as any) || {}
        await prisma.paper.update({
          where: { id: params.id },
          data: {
            metadata: {
              ...currentMetadata,
              contentValidation: contentValidationResults
            }
          }
        })
      } catch (error) {
        console.error('Error updating paper metadata:', error)
      }
    }

    return NextResponse.json({
      success: true,
      total: extractedReferences.length,
      validCount,
      invalidCount,
      missingCount,
      references: verificationResults,
      contentValidation: contentValidationResults
    })
  } catch (error: any) {
    console.error('Error validating references:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to validate references' },
      { status: 500 }
    )
  }
}


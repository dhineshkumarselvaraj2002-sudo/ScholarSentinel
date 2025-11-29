import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/src/lib/prisma'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string; refId: string } }
) {
  try {
    // Get reference from database
    const reference = await prisma.reference.findUnique({
      where: { id: params.refId },
      include: {
        paper: true,
      },
    })

    if (!reference) {
      return NextResponse.json({ error: 'Reference not found' }, { status: 404 })
    }

    // PDF Extracted Data (from database)
    const pdfExtracted = {
      rawText: reference.rawText,
      normalizedTitle: reference.normalizedTitle,
      normalizedAuthors: reference.normalizedAuthors,
      normalizedYear: reference.normalizedYear,
      normalizedDoi: reference.normalizedDoi,
      normalizedVenue: reference.normalizedVenue,
      status: reference.status,
    }

    // Get stored validation data from database
    const verificationData = reference.verificationData && typeof reference.verificationData === 'object' 
      ? reference.verificationData as any 
      : null

    // AI Extracted Data (from database only - no PDF re-extraction)
    let aiExtracted: any = null
    
    // Get AI data from stored verificationData in database
    if (verificationData?.aiExtraction) {
      aiExtracted = verificationData.aiExtraction
    }
    
    // If not in verificationData, check if it's stored elsewhere in the reference
    // All data should come from DB - no PDF re-extraction

    // API Fetched Data (from database only - no API calls, all data from DB cache)
    let apiFetched: any = null

    // Use stored API data from database (all data comes from DB - no fresh API calls)
    if (verificationData?.data && verificationData?.source) {
      // Use stored validation data from database
      const storedData = verificationData.data
      
      if (verificationData.source === 'crossref_search' || verificationData.source === 'crossref') {
        // Handle Crossref data from database
        // Crossref title can be an array or a string
        const apiTitle = Array.isArray(storedData.title) 
          ? (storedData.title[0] || storedData.title.join(' '))
          : (storedData.title || '')
        
        // Crossref authors can be in different formats
        let apiAuthors: any[] = []
        if (storedData.author && Array.isArray(storedData.author)) {
          apiAuthors = storedData.author.map((a: any) => ({
            given: a.given || '',
            family: a.family || '',
            name: `${a.given || ''} ${a.family || ''}`.trim() || a.name || '',
          }))
        } else if (storedData.author) {
          // Handle single author object
          apiAuthors = [{
            given: storedData.author.given || '',
            family: storedData.author.family || '',
            name: `${storedData.author.given || ''} ${storedData.author.family || ''}`.trim(),
          }]
        }
        
        // Extract year from published date
        let apiYear: number | null = null
        if (storedData.published?.['date-parts']?.[0]?.[0]) {
          apiYear = storedData.published['date-parts'][0][0]
        } else if (storedData.year) {
          apiYear = typeof storedData.year === 'number' ? storedData.year : parseInt(storedData.year)
        } else if (storedData.published?.date_parts?.[0]?.[0]) {
          apiYear = storedData.published.date_parts[0][0]
        }
        
        apiFetched = {
          source: 'crossref',
          data: {
            title: apiTitle,
            authors: apiAuthors,
            doi: storedData.DOI || storedData.doi || '',
            published: storedData.published,
            year: apiYear,
            journal: Array.isArray(storedData['container-title']) 
              ? (storedData['container-title'][0] || storedData['container-title'].join(', '))
              : (storedData['container-title'] || storedData.journal || ''),
            url: storedData.URL || storedData.url || '',
            abstract: storedData.abstract || '',
          },
          matchScore: verificationData.matchScore || 0,
          titleSimilarity: verificationData.titleSimilarity || 0,
          contentCheck: verificationData.contentCheck || null,
        }
      } else if (verificationData.source === 'openalex' || verificationData.source === 'openalex_search') {
        apiFetched = {
          source: 'openalex',
          data: {
            id: storedData.id,
            title: storedData.title || storedData.display_name,
            display_name: storedData.display_name,
            abstract: storedData.abstract,
            doi: storedData.doi,
            publication_date: storedData.publication_date,
            publication_year: storedData.publication_year,
            authors: storedData.authorships?.map((a: any) => ({
              name: a.author?.display_name || a.author,
              orcid: a.author?.orcid,
              institutions: a.institutions?.map((i: any) => i.display_name || i) || [],
            })) || [],
            venue: storedData.primary_location?.source?.display_name || storedData.venue,
            url: storedData.primary_location?.landing_page_url || storedData.url,
            pdf_url: storedData.primary_location?.pdf_url || storedData.pdf_url,
            citation_count: storedData.cited_by_count || storedData.citation_count || 0,
            topics: storedData.concepts?.map((c: any) => c.display_name || c) || [],
          },
          matchScore: verificationData.matchScore || 0,
          titleSimilarity: verificationData.titleSimilarity,
          contentCheck: verificationData.contentCheck || null,
        }
      } else {
        // For other sources, still include contentCheck if available
        apiFetched = {
          source: verificationData.source || 'unknown',
          data: storedData,
          matchScore: verificationData.matchScore || 0,
          titleSimilarity: verificationData.titleSimilarity,
          contentCheck: verificationData.contentCheck || null,
        }
      }
    }
    
    // No fallback API calls - all data must come from database

    return NextResponse.json({
      success: true,
      reference: {
        id: reference.id,
        order: reference.order,
      },
      pdfExtracted,
      aiExtracted,
      apiFetched,
    })
  } catch (error: any) {
    console.error('Error getting reference details:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to get reference details' },
      { status: 500 }
    )
  }
}

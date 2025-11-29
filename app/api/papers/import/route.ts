import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/src/lib/prisma'
import { searchOpenAlexPapers, convertOpenAlexToPaper } from '@/src/lib/api/openalex'
import { searchCrossrefPapers, convertCrossrefToPaper } from '@/src/lib/api/crossref'
import { searchSemanticScholarPapers, convertSemanticScholarToPaper } from '@/src/lib/api/semantic-scholar'
import { checkDuplicatePaper } from '@/src/lib/validation'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { source, query, filters } = body

    let papers: any[] = []

    // Fetch papers from selected source
    switch (source) {
      case 'openalex':
        const openAlexResults = await searchOpenAlexPapers({
          search: query,
          filter: filters?.openalex,
          per_page: 50,
        })
        papers = openAlexResults.map(convertOpenAlexToPaper)
        break

      case 'crossref':
        const crossrefResults = await searchCrossrefPapers({
          query,
          filter: filters?.crossref,
          rows: 50,
        })
        papers = crossrefResults.map(convertCrossrefToPaper)
        break

      case 'semantic':
        const semanticResults = await searchSemanticScholarPapers({
          query,
          year: filters?.year,
          fieldsOfStudy: filters?.fieldsOfStudy,
          limit: 50,
        })
        papers = semanticResults.map(convertSemanticScholarToPaper)
        break

      default:
        return NextResponse.json({ error: 'Invalid source' }, { status: 400 })
    }

    // Process and store papers
    const importedPapers = []
    const skippedPapers = []

    for (const paperData of papers) {
      try {
        // Check for duplicates
        const duplicateCheck = await checkDuplicatePaper({
          title: paperData.title,
          doi: paperData.doi,
          authors: paperData.authors,
        })

        if (duplicateCheck.isDuplicate) {
          skippedPapers.push({
            title: paperData.title,
            reason: 'Duplicate detected',
            similarPaperId: duplicateCheck.similarPaperId,
          })
          continue
        }

        // Create or find authors
        const authorConnections = []
        for (let i = 0; i < paperData.authors.length; i++) {
          const authorData = paperData.authors[i]
          let author = await prisma.author.findFirst({
            where: {
              name: authorData.name,
              ...(authorData.orcid ? { orcid: authorData.orcid } : {}),
            },
          })

          if (!author) {
            author = await prisma.author.create({
              data: {
                name: authorData.name,
                orcid: authorData.orcid,
                affiliation: authorData.affiliation,
              },
            })
          }

          authorConnections.push({
            authorId: author.id,
            order: i,
            isCorresponding: i === 0, // First author as corresponding (can be improved)
          })
        }

        // Create paper
        const paper = await prisma.paper.create({
          data: {
            title: paperData.title,
            abstract: paperData.abstract,
            doi: paperData.doi,
            url: paperData.url,
            pdfUrl: paperData.pdfUrl,
            year: paperData.year,
            venue: paperData.venue,
            volume: paperData.volume,
            pages: paperData.pages,
            citationCount: paperData.citationCount,
            topics: paperData.topics,
            status: 'PENDING',
            source: paperData.source,
            sourceId: paperData.sourceId,
            metadata: paperData.metadata,
            authors: {
              create: authorConnections,
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

        importedPapers.push(paper)
      } catch (error: any) {
        console.error(`Error importing paper ${paperData.title}:`, error)
        skippedPapers.push({
          title: paperData.title,
          reason: error.message || 'Unknown error',
        })
      }
    }

    return NextResponse.json({
      success: true,
      imported: importedPapers.length,
      skippedCount: skippedPapers.length,
      papers: importedPapers,
      skipped: skippedPapers,
    })
  } catch (error: any) {
    console.error('Error importing papers:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to import papers' },
      { status: 500 }
    )
  }
}


import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/src/lib/prisma'
import { extractFiguresFromPDF } from '@/src/lib/api/pdf-service'
import { sendAlert } from '@/src/lib/alerts'
import { checkImagePlagiarism } from '@/src/lib/api/bing-visual-search'
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

    // Extract figures from PDF if available
    let extractedFigures: any[] = []
    if (paper.pdfPath && fs.existsSync(path.join(process.cwd(), 'uploads', paper.pdfPath))) {
      try {
        const result = await extractFiguresFromPDF(
          path.join(process.cwd(), 'uploads', paper.pdfPath)
        )
        extractedFigures = result.figures
      } catch (error) {
        console.error('Error extracting figures:', error)
        return NextResponse.json(
          { error: 'Failed to extract figures from PDF' },
          { status: 500 }
        )
      }
    } else {
      return NextResponse.json(
        { error: 'PDF not found for this paper' },
        { status: 404 }
      )
    }

    // Delete existing diagrams for this paper to avoid duplicates
    await prisma.diagram.deleteMany({
      where: { paperId: params.id },
    })

    // Get Bing Visual Search API credentials from settings
    const settings = await prisma.setting.findUnique({
      where: { id: 'settings' },
    })

    const bingApiKey = settings?.bingVisualSearchApiKey
    const bingEndpoint = settings?.bingVisualSearchEndpoint

    // Compare perceptual hashes with existing diagrams
    const suspiciousDiagrams = []
    const processedFigures = []

    for (const figure of extractedFigures) {
      let isSuspicious = false
      let similarityScore: number | null = null
      let matchedDiagramId: string | null = null
      let reverseSearchData: any = null

      // First, check against existing diagrams using perceptual hash
      if (figure.perceptual_hash) {
        // Find similar diagrams using hash comparison
        // Using Hamming distance on hash strings
        const existingDiagrams = await prisma.diagram.findMany({
          where: {
            perceptualHash: { not: null },
            paperId: { not: params.id }, // Don't compare with same paper
          },
        })

        for (const existingDiagram of existingDiagrams) {
          if (existingDiagram.perceptualHash) {
            // Calculate Hamming distance
            const distance = hammingDistance(figure.perceptual_hash, existingDiagram.perceptualHash)
            const similarity = 1 - distance / 64 // pHash is typically 64 characters

            if (similarity > 0.85) {
              // High similarity threshold
              isSuspicious = true
              similarityScore = similarity
              matchedDiagramId = existingDiagram.id
              break
            }
          }
        }
      }

      // Second, use Bing Visual Search API to check for copied images from the web
      if (bingApiKey && bingEndpoint && figure.image_path) {
        try {
          const fullImagePath = path.join(process.cwd(), 'uploads', figure.image_path)
          
          if (fs.existsSync(fullImagePath)) {
            const plagiarismCheck = await checkImagePlagiarism(
              fullImagePath,
              bingApiKey,
              bingEndpoint
            )

            reverseSearchData = {
              isSuspicious: plagiarismCheck.isSuspicious,
              similarityScore: plagiarismCheck.similarityScore,
              matchedSources: plagiarismCheck.matchedSources,
              checkedAt: new Date().toISOString(),
            }

            // If Bing Visual Search finds similar images, mark as suspicious
            if (plagiarismCheck.isSuspicious && plagiarismCheck.matchedSources.length > 0) {
              isSuspicious = true
              // Use the higher similarity score
              if (!similarityScore || plagiarismCheck.similarityScore > similarityScore) {
                similarityScore = plagiarismCheck.similarityScore
              }
            }
          }
        } catch (error) {
          console.error(`Error checking image plagiarism for figure ${figure.order}:`, error)
          // Continue processing even if Bing Visual Search fails
        }
      }

      // Create diagram in DB (we deleted existing ones above)
      const diagram = await prisma.diagram.create({
        data: {
          paperId: params.id,
          order: figure.order,
          pageNumber: figure.page_number,
          imagePath: figure.image_path,
          perceptualHash: figure.perceptual_hash,
          width: figure.width,
          height: figure.height,
          caption: figure.caption,
          isSuspicious,
          similarityScore,
          matchedDiagramId,
          reverseSearchData,
        },
      })

      processedFigures.push(diagram)

      if (isSuspicious) {
        suspiciousDiagrams.push(diagram)

        // Determine the reason for suspicion
        let reason = ''
        if (reverseSearchData?.matchedSources?.length > 0) {
          reason = `Found ${reverseSearchData.matchedSources.length} similar image(s) on the web using Bing Visual Search.`
        } else if (matchedDiagramId) {
          reason = `Appears similar to an existing diagram in the database (similarity: ${(similarityScore! * 100).toFixed(1)}%).`
        }

        // Send alert for suspicious diagram
        await sendAlert({
          type: 'SUSPICIOUS_DIAGRAM',
          severity: 'WARNING',
          title: `Suspicious Diagram Detected in Paper: ${paper.title}`,
          message: `Diagram #${figure.order} on page ${figure.page_number} may be copied from another source. ${reason}`,
          paperId: params.id,
          diagramId: diagram.id,
        })
      }
    }

    return NextResponse.json({
      success: true,
      total: extractedFigures.length,
      suspicious: suspiciousDiagrams.length,
      figures: processedFigures,
    })
  } catch (error: any) {
    console.error('Error validating diagrams:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to validate diagrams' },
      { status: 500 }
    )
  }
}

function hammingDistance(str1: string, str2: string): number {
  if (str1.length !== str2.length) {
    return Math.max(str1.length, str2.length)
  }
  let distance = 0
  for (let i = 0; i < str1.length; i++) {
    if (str1[i] !== str2[i]) {
      distance++
    }
  }
  return distance
}


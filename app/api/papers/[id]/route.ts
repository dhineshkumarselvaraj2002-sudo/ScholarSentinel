import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/src/lib/prisma'
import fs from 'fs'
import path from 'path'

export async function GET(
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
          orderBy: { order: 'asc' },
        },
        references: {
          orderBy: { order: 'asc' },
        },
        diagrams: {
          orderBy: { order: 'asc' },
        },
        similarities: {
          include: {
            paper: {
              select: {
                id: true,
                title: true,
                doi: true,
              },
            },
          },
          orderBy: { similarityScore: 'desc' },
        },
        _count: {
          select: {
            references: true,
            diagrams: true,
            similarities: true,
          },
        },
      },
    })

    if (!paper) {
      return NextResponse.json({ error: 'Paper not found' }, { status: 404 })
    }

    return NextResponse.json(paper)
  } catch (error: any) {
    console.error('Error fetching paper:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch paper' },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json()
    const { title, abstract, year, venue, doi } = body

    // Check if paper exists
    const existingPaper = await prisma.paper.findUnique({
      where: { id: params.id },
    })

    if (!existingPaper) {
      return NextResponse.json({ error: 'Paper not found' }, { status: 404 })
    }

    // Update paper with provided fields
    const updateData: any = {}
    if (title !== undefined) updateData.title = title
    if (abstract !== undefined) updateData.abstract = abstract
    if (year !== undefined) updateData.year = year
    if (venue !== undefined) updateData.venue = venue
    if (doi !== undefined) updateData.doi = doi

    const updatedPaper = await prisma.paper.update({
      where: { id: params.id },
      data: updateData,
      include: {
        authors: {
          include: {
            author: true,
          },
          orderBy: { order: 'asc' },
        },
      },
    })

    return NextResponse.json({
      success: true,
      paper: updatedPaper,
    })
  } catch (error: any) {
    console.error('Error updating paper:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to update paper' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Check if paper exists
    const existingPaper = await prisma.paper.findUnique({
      where: { id: params.id },
    })

    if (!existingPaper) {
      return NextResponse.json({ error: 'Paper not found' }, { status: 404 })
    }

    // Delete the PDF file if it exists
    if (existingPaper.pdfPath) {
      try {
        const pdfPath = path.join(process.cwd(), 'uploads', existingPaper.pdfPath)
        if (fs.existsSync(pdfPath)) {
          fs.unlinkSync(pdfPath)
        }
      } catch (fileError) {
        console.error('Error deleting PDF file:', fileError)
        // Continue with paper deletion even if file deletion fails
      }
    }

    // Delete the paper (cascading deletes will handle references, diagrams, etc.)
    await prisma.paper.delete({
      where: { id: params.id },
    })

    return NextResponse.json({
      success: true,
      message: 'Paper deleted successfully',
    })
  } catch (error: any) {
    console.error('Error deleting paper:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to delete paper' },
      { status: 500 }
    )
  }
}


import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/src/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const status = searchParams.get('status')
    const year = searchParams.get('year')
    const venue = searchParams.get('venue')
    const search = searchParams.get('search')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const skip = (page - 1) * limit

    const where: any = {}

    if (status) {
      where.status = status
    }

    if (year) {
      where.year = parseInt(year)
    }

    if (venue) {
      where.venue = {
        contains: venue,
        mode: 'insensitive',
      }
    }

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { abstract: { contains: search, mode: 'insensitive' } },
      ]
    }

    const [papers, total] = await Promise.all([
      prisma.paper.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          authors: {
            include: {
              author: true,
            },
            orderBy: { order: 'asc' },
          },
          _count: {
            select: {
              references: true,
              diagrams: true,
            },
          },
        },
      }),
      prisma.paper.count({ where }),
    ])

    return NextResponse.json({
      papers,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error: any) {
    console.error('Error fetching papers:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch papers' },
      { status: 500 }
    )
  }
}


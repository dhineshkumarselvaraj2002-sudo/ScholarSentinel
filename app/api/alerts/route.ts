import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/src/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const type = searchParams.get('type')
    const severity = searchParams.get('severity')
    const isRead = searchParams.get('isRead')
    const userId = searchParams.get('userId')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')
    const skip = (page - 1) * limit

    const where: any = {}

    if (type) {
      where.type = type
    }

    if (severity) {
      where.severity = severity
    }

    if (isRead !== null) {
      where.isRead = isRead === 'true'
    }

    if (userId) {
      where.userId = userId
    }

    const [alerts, total] = await Promise.all([
      prisma.alert.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          paper: {
            select: {
              id: true,
              title: true,
              doi: true,
            },
          },
        },
      }),
      prisma.alert.count({ where }),
    ])

    return NextResponse.json({
      alerts,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error: any) {
    console.error('Error fetching alerts:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch alerts' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { alertId, isRead } = body

    if (alertId && typeof isRead === 'boolean') {
      // Mark alert as read/unread
      const alert = await prisma.alert.update({
        where: { id: alertId },
        data: { isRead },
      })
      return NextResponse.json(alert)
    }

    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  } catch (error: any) {
    console.error('Error updating alert:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to update alert' },
      { status: 500 }
    )
  }
}


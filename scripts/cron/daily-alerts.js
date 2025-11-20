/**
 * Cron job: Send daily summary alerts
 * Run daily
 */

const { PrismaClient } = require('@prisma/client')
const axios = require('axios')
const prisma = new PrismaClient()

async function sendDailyAlerts() {
  console.log('Starting daily alerts job...')
  
  try {
    // Get statistics for the last 24 hours
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)

    const [newPapers, validatedPapers, rejectedPapers, invalidRefs, suspiciousDiagrams] = await Promise.all([
      prisma.paper.count({
        where: {
          createdAt: {
            gte: yesterday,
          },
        },
      }),
      prisma.paper.count({
        where: {
          status: 'VALIDATED',
          validatedAt: {
            gte: yesterday,
          },
        },
      }),
      prisma.paper.count({
        where: {
          status: 'REJECTED',
          updatedAt: {
            gte: yesterday,
          },
        },
      }),
      prisma.reference.count({
        where: {
          status: 'INVALID',
          updatedAt: {
            gte: yesterday,
          },
        },
      }),
      prisma.diagram.count({
        where: {
          isSuspicious: true,
          updatedAt: {
            gte: yesterday,
          },
        },
      }),
    ])

    const summary = {
      newPapers,
      validatedPapers,
      rejectedPapers,
      invalidRefs,
      suspiciousDiagrams,
    }

    // Send summary alert
    await axios.post(
      `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/alerts/send`,
      {
        type: 'DAILY_SUMMARY',
        severity: 'INFO',
        title: 'Daily Summary - Scholar Sentinel',
        message: `
Daily Summary (Last 24 hours):
- New Papers: ${newPapers}
- Validated: ${validatedPapers}
- Rejected: ${rejectedPapers}
- Invalid References: ${invalidRefs}
- Suspicious Diagrams: ${suspiciousDiagrams}
        `.trim(),
        metadata: summary,
      }
    )

    console.log('Daily alerts sent:', summary)
  } catch (error) {
    console.error('Error in daily-alerts job:', error)
  } finally {
    await prisma.$disconnect()
  }
}

// Run if called directly
if (require.main === module) {
  sendDailyAlerts()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error)
      process.exit(1)
    })
}

module.exports = { sendDailyAlerts }


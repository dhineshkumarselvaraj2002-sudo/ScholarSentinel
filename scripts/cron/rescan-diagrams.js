/**
 * Cron job: Re-scan diagrams for suspicious matches
 * Run nightly
 */

const { PrismaClient } = require('@prisma/client')
const axios = require('axios')
const prisma = new PrismaClient()

async function rescanDiagrams() {
  console.log('Starting diagram rescan job...')
  
  try {
    // Get papers with diagrams that haven't been checked recently
    const papersWithDiagrams = await prisma.paper.findMany({
      where: {
        diagrams: {
          some: {},
        },
        status: {
          in: ['VALIDATED', 'NEEDS_REVIEW'],
        },
      },
      include: {
        diagrams: true,
      },
      take: 20, // Process 20 at a time
    })

    console.log(`Found ${papersWithDiagrams.length} papers with diagrams`)

    for (const paper of papersWithDiagrams) {
      try {
        // Re-validate diagrams
        const response = await axios.post(
          `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/papers/${paper.id}/diagrams/validate`
        )
        console.log(`Rescanned diagrams for paper: ${paper.title} - Found ${response.data.suspicious} suspicious`)
      } catch (error) {
        console.error(`Error rescanning diagrams for paper ${paper.id}:`, error.message)
      }
    }

    console.log('Diagram rescan job completed')
  } catch (error) {
    console.error('Error in rescan-diagrams job:', error)
  } finally {
    await prisma.$disconnect()
  }
}

// Run if called directly
if (require.main === module) {
  rescanDiagrams()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error)
      process.exit(1)
    })
}

module.exports = { rescanDiagrams }


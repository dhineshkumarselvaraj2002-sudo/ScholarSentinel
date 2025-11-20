/**
 * Cron job: Revalidate pending papers
 * Run every 15 minutes
 */

const { PrismaClient } = require('@prisma/client')
const axios = require('axios')
const prisma = new PrismaClient()

async function validatePendingPapers() {
  console.log('Starting validation job...')
  
  try {
    // Get pending papers
    const pendingPapers = await prisma.paper.findMany({
      where: {
        status: 'PENDING',
      },
      take: 10, // Process 10 at a time
    })

    console.log(`Found ${pendingPapers.length} pending papers`)

    for (const paper of pendingPapers) {
      try {
        // Call validation API
        const response = await axios.post(
          `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/papers/${paper.id}/validate`
        )
        console.log(`Validated paper: ${paper.title} - Status: ${response.data.paper.status}`)
      } catch (error) {
        console.error(`Error validating paper ${paper.id}:`, error.message)
      }
    }

    console.log('Validation job completed')
  } catch (error) {
    console.error('Error in validate-pending job:', error)
  } finally {
    await prisma.$disconnect()
  }
}

// Run if called directly
if (require.main === module) {
  validatePendingPapers()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error)
      process.exit(1)
    })
}

module.exports = { validatePendingPapers }


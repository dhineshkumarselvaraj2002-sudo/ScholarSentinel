/**
 * Cron job: Fetch new papers from journal RSS feeds and APIs
 * Run every 1 hour
 */

const { PrismaClient } = require('@prisma/client')
const axios = require('axios')
const prisma = new PrismaClient()

// Example RSS feed URLs (replace with actual journal feeds)
const RSS_FEEDS = [
  // Add your journal RSS feed URLs here
  // 'https://example.com/journal/rss',
]

async function fetchFromRSSFeed(feedUrl) {
  try {
    // This is a simplified example - you may want to use a proper RSS parser
    const response = await axios.get(feedUrl)
    // Parse RSS and extract paper metadata
    // Implementation depends on RSS format
    return []
  } catch (error) {
    console.error(`Error fetching RSS feed ${feedUrl}:`, error.message)
    return []
  }
}

async function fetchNewPapers() {
  console.log('Starting paper fetch job...')
  
  try {
    // Fetch from RSS feeds
    for (const feedUrl of RSS_FEEDS) {
      const papers = await fetchFromRSSFeed(feedUrl)
      // Process and store papers
      for (const paperData of papers) {
        try {
          await prisma.paper.create({
            data: paperData,
          })
          console.log(`Imported paper: ${paperData.title}`)
        } catch (error) {
          console.error(`Error importing paper:`, error.message)
        }
      }
    }

    // You can also add scheduled API queries here
    // For example, fetch recent papers from OpenAlex with specific filters
    
    console.log('Paper fetch job completed')
  } catch (error) {
    console.error('Error in fetch-papers job:', error)
  } finally {
    await prisma.$disconnect()
  }
}

// Run if called directly
if (require.main === module) {
  fetchNewPapers()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error)
      process.exit(1)
    })
}

module.exports = { fetchNewPapers }


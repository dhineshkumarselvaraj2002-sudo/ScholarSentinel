import axios from 'axios'

const OPENALEX_BASE_URL = 'https://api.openalex.org'

export interface OpenAlexPaper {
  id: string
  title: string
  display_name: string
  abstract?: string
  doi?: string
  publication_date?: string
  publication_year?: number
  authorships?: Array<{
    author: {
      display_name: string
      orcid?: string
    }
    institutions?: Array<{
      display_name: string
    }>
  }>
  primary_location?: {
    source?: {
      display_name?: string
    }
    pdf_url?: string
    landing_page_url?: string
  }
  concepts?: Array<{
    display_name: string
  }>
  cited_by_count?: number
  biblio?: {
    volume?: string
    issue?: string
    first_page?: string
    last_page?: string
  }
}

export interface OpenAlexSearchParams {
  search?: string
  filter?: string
  per_page?: number
  page?: number
  sort?: string
}

/**
 * Clean title string for API search - remove problematic characters
 * OpenAlex API is sensitive to special Unicode characters
 */
function cleanTitleForSearch(title: string): string {
  if (!title) return ''
  
  return title
    // Replace curly quotes with regular quotes (using Unicode escapes for reliability)
    .replace(/\u2018|\u2019/g, "'")  // Left/Right single quotation mark ('')
    .replace(/\u201C|\u201D/g, '"')   // Left/Right double quotation mark ("")
    // Replace en-dash and em-dash with regular hyphen
    .replace(/\u2013|\u2014/g, '-')   // En-dash (–) and Em-dash (—)
    // Remove other problematic Unicode punctuation
    .replace(/\u2026/g, '...')        // Ellipsis (…)
    .replace(/\u201A/g, "'")          // Single low-9 quotation mark
    .replace(/\u201E/g, '"')          // Double low-9 quotation mark
    // Remove trailing commas, periods, and other punctuation that might cause issues
    .replace(/[,\.;:]+$/, '')
    // Remove leading/trailing quotes if they exist
    .replace(/^["'"]+/, '')
    .replace(/["'"]+$/, '')
    // Normalize multiple spaces
    .replace(/\s+/g, ' ')
    // Trim whitespace
    .trim()
}

// Rate limiting: track last request time
let lastRequestTime = 0
const MIN_REQUEST_INTERVAL = 200 // Minimum 200ms between requests to avoid rate limiting

// Helper function to delay requests
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function searchOpenAlexPapers(params: OpenAlexSearchParams): Promise<OpenAlexPaper[]> {
  // Rate limiting: ensure minimum time between requests
  const now = Date.now()
  const timeSinceLastRequest = now - lastRequestTime
  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    await delay(MIN_REQUEST_INTERVAL - timeSinceLastRequest)
  }
  lastRequestTime = Date.now()

  const maxRetries = 3
  let retryCount = 0
  
  while (retryCount < maxRetries) {
    try {
      const queryParams = new URLSearchParams()
      
      if (params.search) {
        // Clean the search query to remove problematic characters
        const cleanedSearch = cleanTitleForSearch(params.search)
        
        // If search is too long, truncate it (OpenAlex has limits)
        const maxSearchLength = 200
        const truncatedSearch = cleanedSearch.length > maxSearchLength 
          ? cleanedSearch.substring(0, maxSearchLength).trim()
          : cleanedSearch
        
        // Use search parameter with proper encoding
        // OpenAlex search parameter works better than filter for title searches
        queryParams.append('search', truncatedSearch)
      }
      
      if (params.filter) {
        queryParams.append('filter', params.filter)
      }
      
      queryParams.append('per_page', String(params.per_page || 25))
      queryParams.append('page', String(params.page || 1))
      
      if (params.sort) {
        queryParams.append('sort', params.sort)
      }

      const response = await axios.get(`${OPENALEX_BASE_URL}/works?${queryParams.toString()}`, {
        timeout: 15000, // 15 second timeout
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'ScholarSentinel/1.0',
        },
        validateStatus: (status) => status < 500, // Don't throw on 4xx errors
      })
      
      // Handle 500 errors with retry
      if (response.status >= 500) {
        retryCount++
        if (retryCount < maxRetries) {
          const backoffDelay = Math.min(1000 * Math.pow(2, retryCount), 5000) // Exponential backoff, max 5s
          console.warn(`OpenAlex API returned ${response.status} error. Retrying in ${backoffDelay}ms... (attempt ${retryCount + 1}/${maxRetries})`)
          await delay(backoffDelay)
          continue
        } else {
          console.warn(`OpenAlex API returned ${response.status} error after ${maxRetries} attempts.`)
          return []
        }
      }
      
      // Handle 4xx errors (client errors)
      if (response.status >= 400 && response.status < 500) {
        console.warn(`OpenAlex API returned ${response.status} error. Request may be invalid.`)
        return []
      }
      
      return response.data?.results || []
    } catch (error: any) {
      // Handle network errors and 500 errors with retry
      if (error.response?.status === 500 || error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') {
        retryCount++
        if (retryCount < maxRetries) {
          const backoffDelay = Math.min(1000 * Math.pow(2, retryCount), 5000) // Exponential backoff
          console.warn(`OpenAlex API error (${error.response?.status || error.code}). Retrying in ${backoffDelay}ms... (attempt ${retryCount + 1}/${maxRetries})`)
          await delay(backoffDelay)
          continue
        } else {
          console.warn(`OpenAlex API error after ${maxRetries} attempts: ${error.message || error}`)
          return []
        }
      }
      
      // For other errors, log and return empty
      console.error('Error fetching from OpenAlex:', error.message || error)
      return []
    }
  }
  
  return []
}

export async function getOpenAlexPaperByDOI(doi: string): Promise<OpenAlexPaper | null> {
  try {
    // OpenAlex uses DOI in format: https://doi.org/10.1234/example
    const cleanDOI = doi.startsWith('http') ? doi : `https://doi.org/${doi}`
    const encodedDOI = encodeURIComponent(cleanDOI)
    
    const response = await axios.get(`${OPENALEX_BASE_URL}/works/${encodedDOI}`)
    return response.data || null
  } catch (error) {
    console.error('Error fetching paper from OpenAlex:', error)
    return null
  }
}

export function convertOpenAlexToPaper(openAlexPaper: OpenAlexPaper) {
  return {
    title: openAlexPaper.title || openAlexPaper.display_name,
    abstract: openAlexPaper.abstract,
    doi: openAlexPaper.doi,
    url: openAlexPaper.primary_location?.landing_page_url,
    pdfUrl: openAlexPaper.primary_location?.pdf_url,
    year: openAlexPaper.publication_year,
    venue: openAlexPaper.primary_location?.source?.display_name,
    volume: openAlexPaper.biblio?.volume,
    pages: openAlexPaper.biblio?.first_page && openAlexPaper.biblio?.last_page
      ? `${openAlexPaper.biblio.first_page}-${openAlexPaper.biblio.last_page}`
      : openAlexPaper.biblio?.first_page,
    citationCount: openAlexPaper.cited_by_count || 0,
    topics: openAlexPaper.concepts?.map(c => c.display_name) || [],
    source: 'openalex',
    sourceId: openAlexPaper.id,
    metadata: openAlexPaper,
    authors: openAlexPaper.authorships?.map(a => ({
      name: a.author.display_name,
      orcid: a.author.orcid,
      affiliation: a.institutions?.[0]?.display_name,
    })) || [],
  }
}

/**
 * Compare PDF extracted data with OpenAlex API data
 * Returns validation result with match scores
 */
export interface OpenAlexValidationResult {
  found: boolean
  matchScore: number // 0-1, where 1 is perfect match
  titleMatch: boolean
  authorMatch: boolean
  yearMatch: boolean
  openAlexPaper?: OpenAlexPaper
  differences: string[]
  warnings: string[]
}

export async function validateWithOpenAlex(data: {
  title: string
  authors?: Array<{ name?: string; display_name?: string }>
  year?: number | null
}): Promise<OpenAlexValidationResult> {
  const result: OpenAlexValidationResult = {
    found: false,
    matchScore: 0,
    titleMatch: false,
    authorMatch: false,
    yearMatch: false,
    differences: [],
    warnings: [],
  }

  try {
    // Clean title before searching
    const cleanedTitle = cleanTitleForSearch(data.title)
    
    // Search OpenAlex by title
    const searchResults = await searchOpenAlexPapers({
      search: cleanedTitle,
      per_page: 5, // Get top 5 results
    })

    if (searchResults.length === 0) {
      result.warnings.push('No matching papers found in OpenAlex')
      return result
    }

    // Find best match
    let bestMatch: OpenAlexPaper | null = null
    let bestScore = 0

    for (const paper of searchResults) {
      let score = 0
      let matches = 0
      let totalChecks = 0

      // Compare title (case-insensitive, normalized)
      totalChecks++
      const title1 = normalizeString(data.title)
      const title2 = normalizeString(paper.title || paper.display_name)
      const titleSimilarity = calculateStringSimilarity(title1, title2)
      if (titleSimilarity > 0.8) {
        score += 0.4
        matches++
      }

      // Compare year
      if (data.year && paper.publication_year) {
        totalChecks++
        if (data.year === paper.publication_year) {
          score += 0.3
          matches++
        } else {
          // Year mismatch - significant penalty
          score -= 0.2
        }
      } else if (data.year || paper.publication_year) {
        totalChecks++
        // One has year, other doesn't - minor penalty
        score -= 0.05
      }

      // Compare authors
      if (data.authors && data.authors.length > 0 && paper.authorships && paper.authorships.length > 0) {
        totalChecks++
        const pdfAuthorNames = data.authors.map(a => 
          normalizeString(a.name || a.display_name || '')
        ).filter(Boolean)
        const openAlexAuthorNames = paper.authorships.map(a => 
          normalizeString(a.author.display_name)
        )

        // Check if at least one author matches
        const authorMatches = pdfAuthorNames.some(pdfAuthor => 
          openAlexAuthorNames.some(oaAuthor => 
            calculateStringSimilarity(pdfAuthor, oaAuthor) > 0.7
          )
        )

        if (authorMatches) {
          score += 0.3
          matches++
        } else {
          // Author mismatch - significant penalty
          score -= 0.15
        }
      } else if (data.authors && data.authors.length > 0) {
        totalChecks++
        result.warnings.push('OpenAlex paper has no author information')
      }

      // Normalize score to 0-1 range
      score = Math.max(0, Math.min(1, score))

      if (score > bestScore) {
        bestScore = score
        bestMatch = paper
      }
    }

    if (bestMatch && bestScore > 0.5) {
      result.found = true
      result.matchScore = bestScore
      result.openAlexPaper = bestMatch

      // Check individual matches
      const title1 = normalizeString(data.title)
      const title2 = normalizeString(bestMatch.title || bestMatch.display_name)
      result.titleMatch = calculateStringSimilarity(title1, title2) > 0.8

      if (data.year && bestMatch.publication_year) {
        result.yearMatch = data.year === bestMatch.publication_year
      } else {
        result.yearMatch = false
        if (data.year) {
          result.differences.push(`Year mismatch: PDF has ${data.year}, OpenAlex has ${bestMatch.publication_year || 'unknown'}`)
        }
      }

      if (data.authors && data.authors.length > 0 && bestMatch.authorships && bestMatch.authorships.length > 0) {
        const pdfAuthorNames = data.authors.map(a => 
          normalizeString(a.name || a.display_name || '')
        ).filter(Boolean)
        const openAlexAuthorNames = bestMatch.authorships.map(a => 
          normalizeString(a.author.display_name)
        )

        result.authorMatch = pdfAuthorNames.some(pdfAuthor => 
          openAlexAuthorNames.some(oaAuthor => 
            calculateStringSimilarity(pdfAuthor, oaAuthor) > 0.7
          )
        )

        if (!result.authorMatch) {
          result.differences.push(`Author mismatch: PDF authors don't match OpenAlex authors`)
        }
      } else {
        result.authorMatch = false
        if (data.authors && data.authors.length > 0) {
          result.warnings.push('Could not compare authors - OpenAlex has no author information')
        }
      }

      // Add differences
      if (!result.titleMatch) {
        result.differences.push(`Title mismatch: "${data.title}" vs "${bestMatch.title || bestMatch.display_name}"`)
      }
    } else {
      result.warnings.push(`Best match score (${bestScore.toFixed(2)}) is below threshold (0.5)`)
    }
  } catch (error: any) {
    console.error('Error validating with OpenAlex:', error)
    result.warnings.push(`OpenAlex validation failed: ${error.message}`)
  }

  return result
}

/**
 * Normalize string for comparison (lowercase, remove extra spaces, remove special chars)
 */
function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^\w\s]/g, '') // Remove special characters
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim()
}

/**
 * Calculate string similarity using Levenshtein distance
 */
function calculateStringSimilarity(str1: string, str2: string): number {
  const maxLen = Math.max(str1.length, str2.length)
  if (maxLen === 0) return 1.0

  const distance = levenshteinDistance(str1, str2)
  return 1 - distance / maxLen
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(str1: string, str2: string): number {
  const len1 = str1.length
  const len2 = str2.length
  const matrix: number[][] = []

  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i]
  }

  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j
  }

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1, // deletion
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j - 1] + 1 // substitution
        )
      }
    }
  }

  return matrix[len1][len2]
}


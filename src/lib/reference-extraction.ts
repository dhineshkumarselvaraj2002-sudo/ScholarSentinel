/**
 * Optimized Reference Extraction Utilities
 * For parsing academic references with robust regex patterns
 */

interface ExtractedReference {
  title: string | null
  authors: string | null
  year: string | null
  doi: string | null
  venue: string | null
  confidence: 'high' | 'medium' | 'low'
}

/**
 * Comprehensive regex patterns for different reference formats
 */
export const REFERENCE_PATTERNS = {
  // Title patterns (in order of priority)
  title: {
    // 1. Title in double quotes (most common) - updated to handle longer titles
    quoted: /"([^"]{10,300})"/,
    
    // 2. Title in single quotes - updated to handle longer titles
    singleQuoted: /'([^']{10,300})'/,
    
    // 3. Title after comma and before comma/period (IEEE/APA style)
    betweenCommas: /,\s*([A-Z][^,."]{10,250}?)(?:,|\.|"|in\s|IEEE|Proc)/i,
    
    // 4. Title after period and before period (sentence case)
    betweenPeriods: /\.\s+([A-Z][^.]{10,250}?)\.\s/,
    
    // 5. Title after authors and before year
    beforeYear: /(?:,|\.)?\s*([A-Z][^,."]{10,200}?)\s*,?\s*(?:19|20)\d{2}/,
    
    // 6. Title in italics markers (markdown style)
    italics: /\*([^*]{10,250})\*/,
    
    // 7. Capitalized phrase after "et al." or author names
    afterAuthors: /et\s+al\.\s*,?\s*["']?([A-Z][^,."]{10,200}?)["']?\s*,/i
  },
  // Author patterns
  authors: {
    // 1. Standard format: "A. Author, B. Author"
    standard: /^([A-Z]\.\s*[A-Z][a-z]+(?:\s*,\s*[A-Z]\.\s*[A-Z][a-z]+)*(?:\s+et\s+al\.)?)/,
    
    // 2. Full names: "John Smith, Jane Doe"
    fullNames: /^([A-Z][a-z]+\s+[A-Z][a-z]+(?:\s*,\s*[A-Z][a-z]+\s+[A-Z][a-z]+)*)/,
    
    // 3. Last name, First initial: "Smith, J., Doe, J."
    lastFirst: /^([A-Z][a-z]+,\s*[A-Z]\.(?:\s*,\s*[A-Z][a-z]+,\s*[A-Z]\.)*)/,
    
    // 4. With "and": "A. Smith and B. Jones"
    withAnd: /^([A-Z]\.\s*[A-Z][a-z]+(?:\s+and\s+[A-Z]\.\s*[A-Z][a-z]+)+)/,
    
    // 5. Extract from raw text (before title or year)
    beforeTitle: /^\[?\d*\]?\s*([A-Z][a-z]+(?:\s+[A-Z]\.)?\s*(?:et\s+al\.|,\s*[A-Z])[^"]*?)(?:["']|,\s*[A-Z]{2})/
  },
  // Year patterns
  year: {
    // 1. Year in parentheses (APA style)
    inParens: /\((\d{4})\)/,
    
    // 2. Year after comma
    afterComma: /,\s*(\d{4})\b/,
    
    // 3. Any 4-digit year (19xx or 20xx)
    anywhere: /\b((?:19|20)\d{2})\b/,
    
    // 4. Year with period
    withPeriod: /\b(\d{4})\./
  },
  // DOI patterns
  doi: {
    // 1. Standard DOI format
    standard: /\b(10\.\d{4,}\/[^\s,)"]+)/i,
    
    // 2. DOI with doi: prefix
    withPrefix: /doi:\s*(10\.\d{4,}\/[^\s,)"]+)/i,
    
    // 3. DOI URL
    url: /doi\.org\/(10\.\d{4,}\/[^\s,)"]+)/i
  },
  // Venue patterns
  venue: {
    // 1. Journal with volume/issue
    journal: /,\s*([A-Z][^,]{5,100}?),\s*vol\./i,
    
    // 2. Conference proceedings
    conference: /in\s+Proc\.\s+([^,]{10,100}?)(?:,|\()/i,
    
    // 3. After "in" keyword
    afterIn: /\bin\s+([A-Z][^,]{10,100}?)(?:,|\.|\()/
  }
}

/**
 * Extract title from reference text using multiple methods
 */
export function extractTitle(rawText: string): { title: string | null; confidence: 'high' | 'medium' | 'low' } {
  if (!rawText) return { title: null, confidence: 'low' }

  // Method 1: Title in quotes - handle curly quotes and longer titles (up to 300 chars)
  // Try curly double quotes first (common in PDFs)
  let match = rawText.match(/[""]([^""]{10,300})[""]/)
  if (match) {
    let title = match[1].trim()
    // Remove author names that might be at the start (before comma)
    title = title.replace(/^[A-Z][a-z]+\s+[A-Z]\.?\s+[A-Z][a-z]+(?:\s*,\s*[A-Z][a-z]+\s+[A-Z]\.?\s+[A-Z][a-z]+)*(?:\s+and\s+[A-Z][a-z]+\s+[A-Z]\.?\s+[A-Z][a-z]+)?,\s*/, '')
    // Also remove "et al.," pattern
    title = title.replace(/^[A-Z][a-z]+\s+et\s+al\.\s*,\s*/i, '')
    return { title: title.trim(), confidence: 'high' }
  }
  
  // Try curly single quotes
  match = rawText.match(/['']([^'']{10,300})['']/)
  if (match) {
    let title = match[1].trim()
    title = title.replace(/^[A-Z][a-z]+\s+[A-Z]\.?\s+[A-Z][a-z]+(?:\s*,\s*[A-Z][a-z]+\s+[A-Z]\.?\s+[A-Z][a-z]+)*(?:\s+and\s+[A-Z][a-z]+\s+[A-Z]\.?\s+[A-Z][a-z]+)?,\s*/, '')
    title = title.replace(/^[A-Z][a-z]+\s+et\s+al\.\s*,\s*/i, '')
    return { title: title.trim(), confidence: 'high' }
  }

  // Try standard double quotes (greedy to get full title)
  match = rawText.match(/"([^"]{10,300})"/)
  if (match) {
    let title = match[1].trim()
    title = title.replace(/^[A-Z][a-z]+\s+[A-Z]\.?\s+[A-Z][a-z]+(?:\s*,\s*[A-Z][a-z]+\s+[A-Z]\.?\s+[A-Z][a-z]+)*(?:\s+and\s+[A-Z][a-z]+\s+[A-Z]\.?\s+[A-Z][a-z]+)?,\s*/, '')
    title = title.replace(/^[A-Z][a-z]+\s+et\s+al\.\s*,\s*/i, '')
    return { title: title.trim(), confidence: 'high' }
  }

  // Try standard single quotes
  match = rawText.match(/'([^']{10,300})'/)
  if (match) {
    let title = match[1].trim()
    title = title.replace(/^[A-Z][a-z]+\s+[A-Z]\.?\s+[A-Z][a-z]+(?:\s*,\s*[A-Z][a-z]+\s+[A-Z]\.?\s+[A-Z][a-z]+)*(?:\s+and\s+[A-Z][a-z]+\s+[A-Z]\.?\s+[A-Z][a-z]+)?,\s*/, '')
    title = title.replace(/^[A-Z][a-z]+\s+et\s+al\.\s*,\s*/i, '')
    return { title: title.trim(), confidence: 'high' }
  }

  // Method 3: Title before year (MEDIUM confidence)
  match = rawText.match(REFERENCE_PATTERNS.title.beforeYear)
  if (match && match[1].length >= 15) {
    return { title: match[1].trim(), confidence: 'medium' }
  }

  // Method 4: Title between commas
  match = rawText.match(REFERENCE_PATTERNS.title.betweenCommas)
  if (match && match[1].length >= 15) {
    return { title: match[1].trim(), confidence: 'medium' }
  }

  // Method 5: Title after "et al."
  match = rawText.match(REFERENCE_PATTERNS.title.afterAuthors)
  if (match) return { title: match[1].trim(), confidence: 'medium' }

  // Method 6: Title in italics
  match = rawText.match(REFERENCE_PATTERNS.title.italics)
  if (match) return { title: match[1].trim(), confidence: 'medium' }

  // Method 7: Title between periods
  match = rawText.match(REFERENCE_PATTERNS.title.betweenPeriods)
  if (match && match[1].length >= 15) {
    return { title: match[1].trim(), confidence: 'low' }
  }

  // Fallback: Use first substantial phrase (LOW confidence)
  const firstPart = rawText
    .replace(/^\[\d+\]\s*/, '') // Remove reference number
    .split(/[.,;]/)
    .find(part => part.trim().length > 15 && part.trim().length < 200)
  
  if (firstPart) {
    return { title: firstPart.trim(), confidence: 'low' }
  }

  // Last resort: First 100 characters
  return { 
    title: rawText.substring(0, 100).trim(), 
    confidence: 'low' 
  }
}

/**
 * Extract authors from reference text
 */
export function extractAuthors(rawText: string): { authors: string | null; confidence: 'high' | 'medium' | 'low' } {
  if (!rawText) return { authors: null, confidence: 'low' }

  // Remove reference number if present
  const cleanText = rawText.replace(/^\[\d+\]\s*/, '')

  // Method 1: Standard format (A. Author)
  let match = cleanText.match(REFERENCE_PATTERNS.authors.standard)
  if (match) return { authors: match[1].trim(), confidence: 'high' }

  // Method 2: Full names
  match = cleanText.match(REFERENCE_PATTERNS.authors.fullNames)
  if (match) return { authors: match[1].trim(), confidence: 'high' }

  // Method 3: Last name, First initial
  match = cleanText.match(REFERENCE_PATTERNS.authors.lastFirst)
  if (match) return { authors: match[1].trim(), confidence: 'high' }

  // Method 4: With "and"
  match = cleanText.match(REFERENCE_PATTERNS.authors.withAnd)
  if (match) return { authors: match[1].trim(), confidence: 'high' }

  // Method 5: Extract before title (LOW confidence)
  match = cleanText.match(REFERENCE_PATTERNS.authors.beforeTitle)
  if (match) return { authors: match[1].trim(), confidence: 'medium' }

  // Fallback: First capitalized name before comma
  match = cleanText.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/)
  if (match) return { authors: match[1].trim(), confidence: 'low' }

  return { authors: null, confidence: 'low' }
}

/**
 * Extract year from reference text
 */
export function extractYear(rawText: string): { year: string | null; confidence: 'high' | 'medium' | 'low' } {
  if (!rawText) return { year: null, confidence: 'low' }

  // Method 1: Year in parentheses (APA style) - HIGH confidence
  let match = rawText.match(REFERENCE_PATTERNS.year.inParens)
  if (match) return { year: match[1], confidence: 'high' }

  // Method 2: Year after comma - MEDIUM confidence
  match = rawText.match(REFERENCE_PATTERNS.year.afterComma)
  if (match) return { year: match[1], confidence: 'medium' }

  // Method 3: Year with period
  match = rawText.match(REFERENCE_PATTERNS.year.withPeriod)
  if (match) return { year: match[1], confidence: 'medium' }

  // Method 4: Any 4-digit year - LOW confidence
  match = rawText.match(REFERENCE_PATTERNS.year.anywhere)
  if (match) return { year: match[1], confidence: 'low' }

  return { year: null, confidence: 'low' }
}

/**
 * Extract DOI from reference text
 */
export function extractDOI(rawText: string): string | null {
  if (!rawText) return null

  // Method 1: DOI with prefix
  let match = rawText.match(REFERENCE_PATTERNS.doi.withPrefix)
  if (match) return match[1]

  // Method 2: DOI URL
  match = rawText.match(REFERENCE_PATTERNS.doi.url)
  if (match) return match[1]

  // Method 3: Standard DOI format
  match = rawText.match(REFERENCE_PATTERNS.doi.standard)
  if (match) return match[1]

  return null
}

/**
 * Extract venue (journal/conference) from reference text
 */
export function extractVenue(rawText: string): string | null {
  if (!rawText) return null

  // Method 1: Conference proceedings
  let match = rawText.match(REFERENCE_PATTERNS.venue.conference)
  if (match) return match[1].trim()

  // Method 2: Journal with volume
  match = rawText.match(REFERENCE_PATTERNS.venue.journal)
  if (match) return match[1].trim()

  // Method 3: After "in" keyword
  match = rawText.match(REFERENCE_PATTERNS.venue.afterIn)
  if (match) return match[1].trim()

  return null
}

/**
 * Extract all metadata from reference text
 */
export function extractAllMetadata(rawText: string): ExtractedReference {
  const titleResult = extractTitle(rawText)
  const authorsResult = extractAuthors(rawText)
  const yearResult = extractYear(rawText)
  const doi = extractDOI(rawText)
  const venue = extractVenue(rawText)

  // Overall confidence is the lowest of all components
  const confidences = [titleResult.confidence, authorsResult.confidence, yearResult.confidence]
  const overallConfidence = confidences.includes('low') ? 'low' 
    : confidences.includes('medium') ? 'medium' 
    : 'high'

  return {
    title: titleResult.title,
    authors: authorsResult.authors,
    year: yearResult.year,
    doi,
    venue,
    confidence: overallConfidence
  }
}

/**
 * Calculate similarity between two titles (0-1 scale)
 */
export function calculateTitleSimilarity(title1: string, title2: string): number {
  if (!title1 || !title2) return 0

  // Normalize both titles
  const normalize = (text: string) => 
    text.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .trim()

  const t1 = normalize(title1)
  const t2 = normalize(title2)

  // Method 1: Exact match
  if (t1 === t2) return 1.0

  // Method 2: One contains the other
  const shorter = t1.length < t2.length ? t1 : t2
  const longer = t1.length >= t2.length ? t1 : t2
  
  if (longer.includes(shorter)) {
    return shorter.length / longer.length
  }

  // Method 3: Word overlap
  const words1 = t1.split(/\s+/).filter(w => w.length > 2)
  const words2 = t2.split(/\s+/).filter(w => w.length > 2)
  const commonWords = words1.filter(w => words2.includes(w))
  
  if (words1.length > 0 && words2.length > 0) {
    const wordOverlap = (commonWords.length * 2) / (words1.length + words2.length)
    
    // Method 4: Check if first N characters match
    const minLength = Math.min(t1.length, t2.length, 30)
    if (minLength >= 10) {
      const prefixMatch = t1.substring(0, minLength) === t2.substring(0, minLength)
      if (prefixMatch) {
        return Math.max(wordOverlap, 0.7)
      }
    }
    
    return wordOverlap
  }

  return 0
}

/**
 * Improved title extraction for use in API routes
 */
export function improvedTitleExtraction(ref: any): string {
  // First, try normalized_title from Python service
  if (ref.normalized_title) {
    return ref.normalized_title
  }

  // If not available, extract from raw_text
  if (ref.raw_text) {
    const result = extractTitle(ref.raw_text)
    return result.title || ref.raw_text.substring(0, 100)
  }

  return ''
}


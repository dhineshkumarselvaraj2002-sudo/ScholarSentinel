import { prisma } from './prisma'

export interface ValidationResult {
  isValid: boolean
  errors: string[]
  warnings: string[]
}

export async function validatePaperMetadata(data: {
  title?: string | null
  authors?: any[]
  doi?: string | null
  year?: number | null
  venue?: string | null
  pages?: string | null
  volume?: string | null
}): Promise<ValidationResult> {
  const errors: string[] = []
  const warnings: string[] = []

  // Required fields
  if (!data.title || data.title.trim().length === 0) {
    errors.push('Title is required')
  } else if (data.title.length < 10) {
    warnings.push('Title seems too short')
  }

  if (!data.authors || data.authors.length === 0) {
    errors.push('At least one author is required')
  }

  if (!data.year) {
    warnings.push('Publication year is missing')
  } else if (data.year < 1900 || data.year > new Date().getFullYear() + 1) {
    errors.push(`Invalid publication year: ${data.year}`)
  }

  // Optional but recommended
  if (!data.venue) {
    warnings.push('Venue (journal/conference) is missing')
  }

  if (!data.doi) {
    warnings.push('DOI is missing - this helps with verification')
  } else {
    // Basic DOI format check
    const doiPattern = /^10\.\d{4,}\/.+/
    if (!doiPattern.test(data.doi)) {
      errors.push('DOI format appears invalid')
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  }
}

export async function checkDuplicatePaper(data: {
  title: string
  doi?: string | null
  authors?: any[]
}): Promise<{ isDuplicate: boolean; similarPaperId?: string; similarityScore?: number }> {
  // Check by DOI first (exact match)
  if (data.doi) {
    const existingByDOI = await prisma.paper.findUnique({
      where: { doi: data.doi },
    })
    if (existingByDOI) {
      return {
        isDuplicate: true,
        similarPaperId: existingByDOI.id,
        similarityScore: 1.0,
      }
    }
  }

  // Fuzzy title matching using pg_trgm
  // Note: This requires the pg_trgm extension to be enabled
  const similarPapers = await prisma.$queryRaw<Array<{ id: string; similarity: number }>>`
    SELECT id, similarity(title, ${data.title}) as similarity
    FROM "Paper"
    WHERE similarity(title, ${data.title}) > 0.7
    ORDER BY similarity DESC
    LIMIT 1
  `.catch(() => {
    // If pg_trgm is not available, fall back to simple substring match
    return []
  })

  if (similarPapers.length > 0 && similarPapers[0].similarity > 0.8) {
    return {
      isDuplicate: true,
      similarPaperId: similarPapers[0].id,
      similarityScore: similarPapers[0].similarity,
    }
  }

  return { isDuplicate: false }
}

export function calculateLevenshteinDistance(str1: string, str2: string): number {
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

export function calculateSimilarity(str1: string, str2: string): number {
  const maxLen = Math.max(str1.length, str2.length)
  if (maxLen === 0) return 1.0

  const distance = calculateLevenshteinDistance(str1.toLowerCase(), str2.toLowerCase())
  return 1 - distance / maxLen
}


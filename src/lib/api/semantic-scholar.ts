import axios from 'axios'

const SEMANTIC_SCHOLAR_BASE_URL = 'https://api.semanticscholar.org/graph/v1'

export interface SemanticScholarPaper {
  paperId: string
  title: string
  abstract?: string
  year?: number
  venue?: string
  journal?: {
    name: string
  }
  authors?: Array<{
    authorId: string
    name: string
  }>
  citationCount?: number
  referenceCount?: number
  openAccessPdf?: {
    url: string
  }
  externalIds?: {
    DOI?: string
  }
  url?: string
  fieldsOfStudy?: string[]
}

export interface SemanticScholarSearchParams {
  query?: string
  year?: string
  fieldsOfStudy?: string[]
  limit?: number
  offset?: number
}

export async function searchSemanticScholarPapers(params: SemanticScholarSearchParams): Promise<SemanticScholarPaper[]> {
  try {
    const queryParams = new URLSearchParams()
    
    if (params.query) {
      queryParams.append('query', params.query)
    }
    if (params.year) {
      queryParams.append('year', params.year)
    }
    if (params.fieldsOfStudy && params.fieldsOfStudy.length > 0) {
      queryParams.append('fieldsOfStudy', params.fieldsOfStudy.join(','))
    }
    queryParams.append('limit', String(params.limit || 25))
    queryParams.append('offset', String(params.offset || 0))

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (process.env.SEMANTIC_SCHOLAR_API_KEY) {
      headers['x-api-key'] = process.env.SEMANTIC_SCHOLAR_API_KEY
    }

    const response = await axios.get(`${SEMANTIC_SCHOLAR_BASE_URL}/paper/search?${queryParams.toString()}`, { headers })
    return response.data.data || []
  } catch (error) {
    console.error('Error fetching from Semantic Scholar:', error)
    throw error
  }
}

export async function getSemanticScholarPaperByDOI(doi: string): Promise<SemanticScholarPaper | null> {
  try {
    const cleanDOI = doi.replace(/^https?:\/\/doi\.org\//, '').replace(/^doi:/, '')
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (process.env.SEMANTIC_SCHOLAR_API_KEY) {
      headers['x-api-key'] = process.env.SEMANTIC_SCHOLAR_API_KEY
    }

    const response = await axios.get(
      `${SEMANTIC_SCHOLAR_BASE_URL}/paper/DOI:${encodeURIComponent(cleanDOI)}`,
      { headers }
    )
    return response.data || null
  } catch (error) {
    console.error('Error fetching paper from Semantic Scholar:', error)
    return null
  }
}

export function convertSemanticScholarToPaper(semanticPaper: SemanticScholarPaper) {
  return {
    title: semanticPaper.title,
    abstract: semanticPaper.abstract,
    doi: semanticPaper.externalIds?.DOI,
    url: semanticPaper.url,
    pdfUrl: semanticPaper.openAccessPdf?.url,
    year: semanticPaper.year,
    venue: semanticPaper.venue || semanticPaper.journal?.name,
    citationCount: semanticPaper.citationCount || 0,
    topics: semanticPaper.fieldsOfStudy || [],
    source: 'semantic',
    sourceId: semanticPaper.paperId,
    metadata: semanticPaper,
    authors: semanticPaper.authors?.map(a => ({
      name: a.name,
      authorId: a.authorId,
    })) || [],
  }
}


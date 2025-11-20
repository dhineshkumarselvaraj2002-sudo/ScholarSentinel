import axios from 'axios'

const CROSSREF_BASE_URL = 'https://api.crossref.org'

export interface CrossrefPaper {
  DOI: string
  title: string[]
  abstract?: string
  author?: Array<{
    given?: string
    family: string
    ORCID?: string
    affiliation?: Array<{
      name: string
    }>
  }>
  published?: {
    'date-parts': number[][]
  }
  'container-title'?: string[]
  volume?: string
  issue?: string
  page?: string
  'is-referenced-by-count'?: number
  subject?: string[]
  URL?: string
  link?: Array<{
    URL: string
    'content-type': string
  }>
}

export interface CrossrefSearchParams {
  query?: string
  filter?: string
  rows?: number
  offset?: number
  sort?: string
}

export async function searchCrossrefPapers(params: CrossrefSearchParams): Promise<CrossrefPaper[]> {
  try {
    const queryParams = new URLSearchParams()
    
    if (params.query) {
      queryParams.append('query', params.query)
    }
    if (params.filter) {
      queryParams.append('filter', params.filter)
    }
    queryParams.append('rows', String(params.rows || 25))
    queryParams.append('offset', String(params.offset || 0))
    if (params.sort) {
      queryParams.append('sort', params.sort)
    }

    const headers: Record<string, string> = {}
    if (process.env.CROSSREF_API_KEY) {
      headers['Crossref-Plus-API-Token'] = process.env.CROSSREF_API_KEY
    }

    const response = await axios.get(`${CROSSREF_BASE_URL}/works?${queryParams.toString()}`, { headers })
    return response.data.message?.items || []
  } catch (error) {
    console.error('Error fetching from CrossRef:', error)
    throw error
  }
}

export async function getCrossrefPaperByDOI(doi: string): Promise<CrossrefPaper | null> {
  try {
    const cleanDOI = doi.replace(/^https?:\/\/doi\.org\//, '').replace(/^doi:/, '')
    const encodedDOI = encodeURIComponent(cleanDOI)
    
    const headers: Record<string, string> = {}
    if (process.env.CROSSREF_API_KEY) {
      headers['Crossref-Plus-API-Token'] = process.env.CROSSREF_API_KEY
    }

    const response = await axios.get(`${CROSSREF_BASE_URL}/works/${encodedDOI}`, { headers })
    return response.data.message || null
  } catch (error) {
    console.error('Error fetching paper from CrossRef:', error)
    return null
  }
}

export function convertCrossrefToPaper(crossrefPaper: CrossrefPaper) {
  const year = crossrefPaper.published?.['date-parts']?.[0]?.[0]
  
  return {
    title: crossrefPaper.title?.[0] || '',
    abstract: crossrefPaper.abstract,
    doi: crossrefPaper.DOI,
    url: crossrefPaper.URL,
    pdfUrl: crossrefPaper.link?.find(l => l['content-type'] === 'application/pdf')?.URL,
    year,
    venue: crossrefPaper['container-title']?.[0],
    volume: crossrefPaper.volume,
    pages: crossrefPaper.page,
    citationCount: crossrefPaper['is-referenced-by-count'] || 0,
    topics: crossrefPaper.subject || [],
    source: 'crossref',
    sourceId: crossrefPaper.DOI,
    metadata: crossrefPaper,
    authors: crossrefPaper.author?.map(a => ({
      name: `${a.given || ''} ${a.family}`.trim(),
      orcid: a.ORCID,
      affiliation: a.affiliation?.[0]?.name,
    })) || [],
  }
}


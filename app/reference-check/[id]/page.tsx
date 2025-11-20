'use client'

import { useQuery } from '@tanstack/react-query'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/src/components/ui/card'
import { Button } from '@/src/components/ui/button'
import { Badge } from '@/src/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/src/components/ui/dialog'
import axios from 'axios'
import { useState } from 'react'
import { ArrowLeft, Eye, Loader2, CheckCircle2, XCircle, AlertCircle } from 'lucide-react'
import { useToast } from '@/src/hooks/use-toast'
import { ReferenceStatusBadge } from '@/src/components/ReferenceStatusBadge'

interface Reference {
  id: string
  order: number
  rawText: string
  normalizedTitle: string | null
  normalizedAuthors: string | null
  normalizedYear: number | null
  normalizedDoi: string | null
  normalizedVenue: string | null
  status: string
}

interface ReferenceDetails {
  pdfExtracted: {
    rawText: string
    normalizedTitle: string | null
    normalizedAuthors: string | null
    normalizedYear: number | null
    normalizedDoi: string | null
    normalizedVenue: string | null
  }
  aiExtracted: any
  apiFetched: {
    source: string
    data: any
    matchScore?: number
    titleSimilarity?: number
  } | null
}

export default function ReferenceCheckDetailPage() {
  const params = useParams()
  const router = useRouter()
  const paperId = params.id as string
  const [selectedRefId, setSelectedRefId] = useState<string | null>(null)
  const [referenceDetails, setReferenceDetails] = useState<ReferenceDetails | null>(null)
  const [loadingDetails, setLoadingDetails] = useState(false)
  const { toast } = useToast()

  const { data: paper, isLoading } = useQuery({
    queryKey: ['paper', paperId],
    queryFn: async () => {
      const response = await axios.get(`/api/papers/${paperId}`)
      return response.data
    },
    staleTime: 5 * 60 * 1000, // 5 minutes - data from DB is fresh
    gcTime: 10 * 60 * 1000, // 10 minutes - keep in cache (React Query v5)
    refetchOnMount: false, // Use cached data if available
  })

  const references: Reference[] = paper?.references || []

  const handleViewDetails = async (refId: string) => {
    setSelectedRefId(refId)
    setLoadingDetails(true)
    setReferenceDetails(null)

    try {
      const response = await axios.get(`/api/papers/${paperId}/references/${refId}/details`)
      setReferenceDetails(response.data)
    } catch (error: any) {
      console.error('Error fetching reference details:', error)
      toast({
        title: 'Error',
        description: error.response?.data?.error || 'Failed to load reference details',
        variant: 'destructive',
      })
    } finally {
      setLoadingDetails(false)
    }
  }

  const compareValues = (aiValue: any, apiValue: any, field: string): { match: boolean; ai: string; api: string } => {
    const aiStr = aiValue ? String(aiValue).trim() : ''
    const apiStr = apiValue ? String(apiValue).trim() : ''
    
    if (field === 'authors') {
      // For authors, compare arrays
      const aiAuthors = Array.isArray(aiValue) ? aiValue.map((a: any) => a.name || a).join(', ') : aiStr
      const apiAuthors = Array.isArray(apiValue) 
        ? apiValue.map((a: any) => a.name || `${a.given || ''} ${a.family || ''}`.trim() || a.display_name || a).join(', ')
        : apiStr
      return {
        match: aiAuthors.toLowerCase() === apiAuthors.toLowerCase(),
        ai: aiAuthors || 'N/A',
        api: apiAuthors || 'N/A',
      }
    }
    
    return {
      match: aiStr.toLowerCase() === apiStr.toLowerCase(),
      ai: aiStr || 'N/A',
      api: apiStr || 'N/A',
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  if (!paper) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Paper not found</p>
        <Button onClick={() => router.push('/reference-check')} className="mt-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Reference Check
        </Button>
      </div>
    )
  }

  const authorNames = paper.authors?.map((pa: any) => pa.author.name).join(', ') || ''

  return (
    <div>
      <div className="mb-6">
        <Button
          variant="ghost"
          onClick={() => router.push('/reference-check')}
          className="mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Reference Check
        </Button>
        
        <h1 className="text-3xl font-bold mb-2">{paper.title}</h1>
        {authorNames && (
          <p className="text-muted-foreground mb-4">{authorNames}</p>
        )}
        <div className="flex gap-2 flex-wrap">
          {paper.year && <Badge variant="outline">{paper.year}</Badge>}
          {paper.venue && <Badge variant="outline">{paper.venue}</Badge>}
          <Badge variant="secondary">{references.length} references</Badge>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>References</CardTitle>
          <CardDescription>
            Click "View" to see AI extracted details vs API fetched details comparison
          </CardDescription>
        </CardHeader>
        <CardContent>
          {references.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No references found for this paper.
            </div>
          ) : (
            <div className="space-y-4">
              {references.map((ref) => (
                <Card key={ref.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge variant="outline">#{ref.order}</Badge>
                          {ref.status && (
                            <ReferenceStatusBadge status={ref.status as any} />
                          )}
                        </div>
                        <h3 className="font-semibold mb-2">
                          {ref.normalizedTitle || ref.rawText.substring(0, 100) + '...'}
                        </h3>
                        {ref.normalizedAuthors && (
                          <p className="text-sm text-muted-foreground mb-1">
                            <strong>Authors:</strong> {ref.normalizedAuthors}
                          </p>
                        )}
                        <div className="flex gap-2 flex-wrap mt-2">
                          {ref.normalizedYear && (
                            <Badge variant="outline">{ref.normalizedYear}</Badge>
                          )}
                          {ref.normalizedVenue && (
                            <Badge variant="outline">{ref.normalizedVenue}</Badge>
                          )}
                          {ref.normalizedDoi && (
                            <Badge variant="outline" className="font-mono text-xs">
                              DOI: {ref.normalizedDoi}
                            </Badge>
                          )}
                        </div>
                      </div>
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className="ml-4"
                            onClick={() => handleViewDetails(ref.id)}
                          >
                            <Eye className="h-4 w-4 mr-2" />
                            View Details
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                          <DialogHeader>
                            <DialogTitle>Reference Details Comparison</DialogTitle>
                            <DialogDescription>
                              Compare AI extracted data with API fetched data
                            </DialogDescription>
                          </DialogHeader>
                          
                          {loadingDetails ? (
                            <div className="flex items-center justify-center py-12">
                              <Loader2 className="h-6 w-6 animate-spin" />
                            </div>
                          ) : referenceDetails ? (
                            <div className="space-y-6 mt-4">
                              {/* Title Comparison */}
                              <div className="border rounded-lg p-4">
                                <h3 className="font-semibold mb-3 flex items-center gap-2">
                                  Title
                                  {referenceDetails.aiExtracted?.title && referenceDetails.apiFetched?.data?.title && (
                                    compareValues(referenceDetails.aiExtracted.title, referenceDetails.apiFetched.data.title, 'title').match ? (
                                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                                    ) : (
                                      <XCircle className="h-4 w-4 text-red-500" />
                                    )
                                  )}
                                </h3>
                                <div className="grid grid-cols-2 gap-4">
                                  <div>
                                    <p className="text-sm font-medium text-muted-foreground mb-1">AI Extracted</p>
                                    <p className="text-sm">{referenceDetails.aiExtracted?.title || referenceDetails.pdfExtracted.normalizedTitle || 'N/A'}</p>
                                  </div>
                                  <div>
                                    <p className="text-sm font-medium text-muted-foreground mb-1">API Fetched ({referenceDetails.apiFetched?.source || 'N/A'})</p>
                                    <p className="text-sm">{referenceDetails.apiFetched?.data?.title || 'N/A'}</p>
                                  </div>
                                </div>
                              </div>

                              {/* Authors Comparison */}
                              <div className="border rounded-lg p-4">
                                <h3 className="font-semibold mb-3 flex items-center gap-2">
                                  Authors
                                  {referenceDetails.aiExtracted?.authors && referenceDetails.apiFetched?.data?.authors && (
                                    compareValues(referenceDetails.aiExtracted.authors, referenceDetails.apiFetched.data.authors, 'authors').match ? (
                                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                                    ) : (
                                      <AlertCircle className="h-4 w-4 text-yellow-500" />
                                    )
                                  )}
                                </h3>
                                <div className="grid grid-cols-2 gap-4">
                                  <div>
                                    <p className="text-sm font-medium text-muted-foreground mb-1">AI Extracted</p>
                                    <p className="text-sm">
                                      {Array.isArray(referenceDetails.aiExtracted?.authors)
                                        ? referenceDetails.aiExtracted.authors.map((a: any) => a.name || a).join(', ')
                                        : referenceDetails.aiExtracted?.authors || referenceDetails.pdfExtracted.normalizedAuthors || 'N/A'}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-sm font-medium text-muted-foreground mb-1">API Fetched</p>
                                    <p className="text-sm">
                                      {Array.isArray(referenceDetails.apiFetched?.data?.authors)
                                        ? referenceDetails.apiFetched.data.authors.map((a: any) => 
                                            a.name || `${a.given || ''} ${a.family || ''}`.trim() || a.display_name || a
                                          ).join(', ')
                                        : referenceDetails.apiFetched?.data?.authors || 'N/A'}
                                    </p>
                                  </div>
                                </div>
                              </div>

                              {/* Year Comparison */}
                              <div className="border rounded-lg p-4">
                                <h3 className="font-semibold mb-3 flex items-center gap-2">
                                  Year
                                  {referenceDetails.aiExtracted?.year && referenceDetails.apiFetched?.data?.year && (
                                    compareValues(referenceDetails.aiExtracted.year, referenceDetails.apiFetched.data.year, 'year').match ? (
                                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                                    ) : (
                                      <XCircle className="h-4 w-4 text-red-500" />
                                    )
                                  )}
                                </h3>
                                <div className="grid grid-cols-2 gap-4">
                                  <div>
                                    <p className="text-sm font-medium text-muted-foreground mb-1">AI Extracted</p>
                                    <p className="text-sm">{referenceDetails.aiExtracted?.year || referenceDetails.pdfExtracted.normalizedYear || 'N/A'}</p>
                                  </div>
                                  <div>
                                    <p className="text-sm font-medium text-muted-foreground mb-1">API Fetched</p>
                                    <p className="text-sm">{referenceDetails.apiFetched?.data?.year || referenceDetails.apiFetched?.data?.publication_year || 'N/A'}</p>
                                  </div>
                                </div>
                              </div>

                              {/* DOI Comparison */}
                              {(referenceDetails.aiExtracted?.doi || referenceDetails.apiFetched?.data?.doi) && (
                                <div className="border rounded-lg p-4">
                                  <h3 className="font-semibold mb-3">DOI</h3>
                                  <div className="grid grid-cols-2 gap-4">
                                    <div>
                                      <p className="text-sm font-medium text-muted-foreground mb-1">AI Extracted</p>
                                      <p className="text-sm">{referenceDetails.aiExtracted?.doi || referenceDetails.pdfExtracted.normalizedDoi || 'N/A'}</p>
                                    </div>
                                    <div>
                                      <p className="text-sm font-medium text-muted-foreground mb-1">API Fetched</p>
                                      <p className="text-sm">{referenceDetails.apiFetched?.data?.doi || 'N/A'}</p>
                                    </div>
                                  </div>
                                </div>
                              )}

                              {/* Match Score */}
                              {referenceDetails.apiFetched?.matchScore !== undefined && (
                                <div className="border rounded-lg p-4 bg-muted/50">
                                  <h3 className="font-semibold mb-2">Match Score</h3>
                                  <div className="flex items-center gap-2">
                                    <div className="flex-1 bg-background rounded-full h-2">
                                      <div
                                        className="bg-primary h-2 rounded-full"
                                        style={{ width: `${(referenceDetails.apiFetched.matchScore || 0) * 100}%` }}
                                      />
                                    </div>
                                    <span className="text-sm font-medium">
                                      {(referenceDetails.apiFetched.matchScore * 100).toFixed(0)}%
                                    </span>
                                  </div>
                                </div>
                              )}

                              {/* Raw Text */}
                              <div className="border rounded-lg p-4">
                                <h3 className="font-semibold mb-2">Raw Reference Text</h3>
                                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                                  {referenceDetails.pdfExtracted.rawText}
                                </p>
                              </div>
                            </div>
                          ) : (
                            <div className="text-center py-8 text-muted-foreground">
                              No details available
                            </div>
                          )}
                        </DialogContent>
                      </Dialog>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}


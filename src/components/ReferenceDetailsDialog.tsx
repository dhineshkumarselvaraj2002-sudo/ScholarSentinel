'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/src/components/ui/dialog'
import { Button } from '@/src/components/ui/button'
import { Badge } from '@/src/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/src/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/src/components/ui/tabs'
import axios from 'axios'
import { Loader2, ExternalLink, FileText, Brain, Database } from 'lucide-react'

interface ReferenceDetailsDialogProps {
  referenceId: string
  paperId: string
  children: React.ReactNode
}

export function ReferenceDetailsDialog({
  referenceId,
  paperId,
  children,
}: ReferenceDetailsDialogProps) {
  const [open, setOpen] = useState(false)

  const { data, isLoading, error } = useQuery({
    queryKey: ['reference-details', paperId, referenceId],
    queryFn: async () => {
      const response = await axios.get(`/api/papers/${paperId}/references/${referenceId}/details`)
      return response.data
    },
    enabled: open, // Only fetch when dialog is open
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Reference Details</DialogTitle>
          <DialogDescription>
            View AI-extracted data and API-fetched data for this reference
          </DialogDescription>
        </DialogHeader>

        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">Loading details...</span>
          </div>
        )}

        {error && (
          <div className="text-center py-8 text-destructive">
            Failed to load reference details. Please try again.
          </div>
        )}

        {data && (
          <Tabs defaultValue="ai" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="ai" className="flex items-center gap-2">
                <Brain className="h-4 w-4" />
                AI Extracted
              </TabsTrigger>
              <TabsTrigger value="api" className="flex items-center gap-2">
                <Database className="h-4 w-4" />
                API Fetched
              </TabsTrigger>
            </TabsList>

            {/* AI Extracted Tab */}
            <TabsContent value="ai" className="space-y-4">
              {data.aiExtracted ? (
                <Card>
                  <CardHeader>
                    <CardTitle>AI Extracted Data (Gemini)</CardTitle>
                    <CardDescription>
                      Information extracted using Gemini AI from the PDF reference text (stored during validation)
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="text-sm font-medium mb-1">Title</div>
                        <div className="text-sm text-muted-foreground bg-muted p-2 rounded">
                          {data.aiExtracted.title || (
                            <span className="italic text-muted-foreground">Not extracted</span>
                          )}
                        </div>
                      </div>

                      <div>
                        <div className="text-sm font-medium mb-1">Year</div>
                        <div className="text-sm text-muted-foreground bg-muted p-2 rounded">
                          {data.aiExtracted.year || (
                            <span className="italic text-muted-foreground">Not extracted</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {data.aiExtracted.authors && data.aiExtracted.authors.length > 0 && (
                      <div>
                        <div className="text-sm font-medium mb-2">Authors</div>
                        <div className="space-y-1 bg-muted p-3 rounded">
                          {data.aiExtracted.authors.map((author: string, idx: number) => (
                            <div key={idx} className="text-sm text-muted-foreground">
                              • {author}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardContent className="py-8 text-center text-muted-foreground">
                    <Brain className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No AI extraction data available</p>
                    <p className="text-xs mt-2">
                      AI extraction requires GEMINI_API_KEY to be configured and references to be validated
                    </p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* API Fetched Tab */}
            <TabsContent value="api" className="space-y-4">
              {data.apiFetched ? (
                <Card>
                  <CardHeader>
                    <CardTitle>API Fetched Data</CardTitle>
                    <CardDescription>
                      Data retrieved from {data.apiFetched.source === 'openalex' ? 'OpenAlex' : 'CrossRef'} using the AI-extracted title (stored during validation)
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between mb-4">
                      <Badge variant="outline">
                        Source: {data.apiFetched.source === 'openalex' ? 'OpenAlex' : 'CrossRef'}
                      </Badge>
                      <div className="flex gap-2">
                        {data.apiFetched.matchScore !== undefined && (
                          <Badge variant="secondary">
                            Match: {(data.apiFetched.matchScore * 100).toFixed(0)}%
                          </Badge>
                        )}
                        {data.apiFetched.titleSimilarity !== undefined && (
                          <Badge variant="secondary">
                            Title Similarity: {(data.apiFetched.titleSimilarity * 100).toFixed(0)}%
                          </Badge>
                        )}
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <div className="text-sm font-medium mb-1">Title (from API)</div>
                        <div className="text-sm text-muted-foreground bg-muted p-2 rounded">
                          {data.apiFetched.data.title || data.apiFetched.data.display_name}
                        </div>
                      </div>

                      {data.apiFetched.data.abstract && (
                        <div>
                          <div className="text-sm font-medium mb-1">Abstract</div>
                          <div className="text-sm text-muted-foreground bg-muted p-3 rounded-md">
                            {data.apiFetched.data.abstract}
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-4">
                        {(data.apiFetched.data.publication_year || data.apiFetched.data.year) && (
                          <div>
                            <div className="text-sm font-medium mb-1">Year (from API)</div>
                            <div className="text-sm text-muted-foreground bg-muted p-2 rounded">
                              {data.apiFetched.data.publication_year || data.apiFetched.data.year}
                            </div>
                          </div>
                        )}

                        {data.apiFetched.data.doi && (
                          <div>
                            <div className="text-sm font-medium mb-1">DOI</div>
                            <div className="text-sm text-muted-foreground">
                              <a
                                href={`https://doi.org/${data.apiFetched.data.doi}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary hover:underline font-mono"
                              >
                                {data.apiFetched.data.doi}
                              </a>
                            </div>
                          </div>
                        )}

                        {data.apiFetched.data.venue && (
                          <div>
                            <div className="text-sm font-medium mb-1">Venue</div>
                            <div className="text-sm text-muted-foreground">
                              {data.apiFetched.data.venue}
                            </div>
                          </div>
                        )}

                        {data.apiFetched.data.citation_count !== undefined && (
                          <div>
                            <div className="text-sm font-medium mb-1">Citations</div>
                            <div className="text-sm text-muted-foreground">
                              {data.apiFetched.data.citation_count}
                            </div>
                          </div>
                        )}
                      </div>

                      {data.apiFetched.data.authors && data.apiFetched.data.authors.length > 0 && (
                        <div>
                          <div className="text-sm font-medium mb-2">Authors (from API)</div>
                          <div className="space-y-1 bg-muted p-3 rounded">
                            {data.apiFetched.data.authors.map((author: any, idx: number) => (
                              <div key={idx} className="text-sm text-muted-foreground">
                                • {author.name || author.display_name || `${author.given || ''} ${author.family || ''}`.trim()}
                                {author.orcid && (
                                  <a
                                    href={`https://orcid.org/${author.orcid}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="ml-2 text-primary hover:underline text-xs"
                                  >
                                    ORCID
                                  </a>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {data.apiFetched.data.url && (
                        <div className="flex gap-2 pt-4">
                          <Button
                            variant="outline"
                            size="sm"
                            asChild
                          >
                            <a
                              href={data.apiFetched.data.url}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <ExternalLink className="h-4 w-4 mr-2" />
                              View Paper
                            </a>
                          </Button>
                          {data.apiFetched.data.pdf_url && (
                            <Button
                              variant="outline"
                              size="sm"
                              asChild
                            >
                              <a
                                href={data.apiFetched.data.pdf_url}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                <FileText className="h-4 w-4 mr-2" />
                                PDF
                              </a>
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardContent className="py-8 text-center text-muted-foreground">
                    <Database className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No API data available</p>
                    <p className="text-xs mt-2">
                      Could not find matching paper in OpenAlex or CrossRef databases
                    </p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  )
}


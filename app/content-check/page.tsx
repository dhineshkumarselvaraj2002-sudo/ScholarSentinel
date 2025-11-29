'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/src/components/ui/card'
import { Button } from '@/src/components/ui/button'
import { Badge } from '@/src/components/ui/badge'
import { Input } from '@/src/components/ui/input'
import { CheckCircle2, XCircle, AlertCircle, FileText, Image, Loader2, Upload, FileCheck } from 'lucide-react'
import { useToast } from '@/src/hooks/use-toast'
import axios from 'axios'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'

interface Paper {
  id: string
  title: string
  authors: Array<{
    author: {
      name: string
    }
  }>
  _count: {
    references: number
    diagrams: number
  }
}

export default function ContentCheckPage() {
  const [selectedPaperId, setSelectedPaperId] = useState<string | null>(null)
  const [checkingPaperId, setCheckingPaperId] = useState<string | null>(null)
  const [contentCheckResults, setContentCheckResults] = useState<any>(null)
  const { toast } = useToast()

  // Fetch papers
  const { data: papersData, isLoading } = useQuery({
    queryKey: ['papers'],
    queryFn: async () => {
      const response = await axios.get('/api/papers?limit=100')
      return response.data
    },
    staleTime: 5 * 60 * 1000,
  })

  const papers: Paper[] = papersData?.papers || []

  const handleContentCheck = async (paperId: string) => {
    if (checkingPaperId === paperId) return
    
    setCheckingPaperId(paperId)
    setContentCheckResults(null)
    
    try {
      const response = await axios.post(`/api/papers/${paperId}/content-check`)
      
      if (response.data.success) {
        setContentCheckResults({
          paperId,
          ...response.data.results,
          textLength: response.data.textLength,
          pages: response.data.pages,
        })
        toast({
          title: 'Content Check Complete',
          description: 'References and figures have been validated against the text content.',
          variant: 'default',
        })
      }
    } catch (error: any) {
      console.error('Content check error:', error)
      toast({
        title: 'Content Check Failed',
        description: error.response?.data?.error || 'Failed to check content',
        variant: 'destructive',
      })
    } finally {
      setCheckingPaperId(null)
    }
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Content Check</h1>
        <p className="text-muted-foreground">
          Validate if references and figures are cited in the text content of papers
        </p>
      </div>

      {/* Paper Selection */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileCheck className="h-5 w-5" />
            Select Paper for Content Check
          </CardTitle>
          <CardDescription>
            Choose a paper to check if its references and figures are cited in the text
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="text-center py-8">
              <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Loading papers...</p>
            </div>
          ) : papers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No papers available. Upload a PDF from the dashboard first.
            </div>
          ) : (
            <>
              <select
                value={selectedPaperId || ''}
                onChange={(e) => {
                  setSelectedPaperId(e.target.value || null)
                  setContentCheckResults(null)
                }}
                className="w-full px-3 py-2 border rounded-md bg-background"
              >
                <option value="">-- Select a paper --</option>
                {papers.map((paper) => (
                  <option key={paper.id} value={paper.id}>
                    {paper.title} ({paper._count.references} references)
                  </option>
                ))}
              </select>

              {selectedPaperId && (
                <Button
                  onClick={() => handleContentCheck(selectedPaperId)}
                  disabled={checkingPaperId === selectedPaperId}
                  className="w-full"
                >
                  {checkingPaperId === selectedPaperId ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Checking Content...
                    </>
                  ) : (
                    <>
                      <FileCheck className="h-4 w-4 mr-2" />
                      Run Content Check
                    </>
                  )}
                </Button>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Results Display */}
      {contentCheckResults && contentCheckResults.paperId === selectedPaperId && (
        <div className="space-y-6">
          {/* Summary */}
          <Card>
            <CardHeader>
              <CardTitle>Content Check Results</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="p-3 bg-muted rounded-lg">
                  <div className="text-sm text-muted-foreground">Text Length</div>
                  <div className="text-lg font-semibold">
                    {contentCheckResults.textLength?.toLocaleString() || 'N/A'} chars
                  </div>
                </div>
                <div className="p-3 bg-muted rounded-lg">
                  <div className="text-sm text-muted-foreground">Pages</div>
                  <div className="text-lg font-semibold">
                    {contentCheckResults.pages || 'N/A'}
                  </div>
                </div>
                <div className="p-3 bg-muted rounded-lg">
                  <div className="text-sm text-muted-foreground">References Checked</div>
                  <div className="text-lg font-semibold">
                    {contentCheckResults.reference_validation?.length || 0}
                  </div>
                </div>
                <div className="p-3 bg-muted rounded-lg">
                  <div className="text-sm text-muted-foreground">Valid References</div>
                  <div className="text-lg font-semibold text-green-600">
                    {contentCheckResults.reference_validation?.filter((r: any) => r.content_check?.valid).length || 0}
                  </div>
                </div>
              </div>

              {/* Reference Validation Results */}
              {contentCheckResults.reference_validation && (
                <div className="space-y-2 mb-6">
                  <h3 className="font-semibold text-lg flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Reference Citation Validation
                  </h3>
                  <div className="max-h-96 overflow-y-auto border rounded-md">
                    <div className="divide-y">
                      {contentCheckResults.reference_validation.map((ref: any) => (
                        <div
                          key={ref.order}
                          className="p-3 flex items-start justify-between hover:bg-muted/50"
                        >
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-medium">Reference [{ref.order}]</span>
                              {ref.content_check?.valid ? (
                                <Badge variant="default" className="bg-green-600">
                                  <CheckCircle2 className="h-3 w-3 mr-1" />
                                  Cited
                                </Badge>
                              ) : (
                                <Badge variant="destructive">
                                  <XCircle className="h-3 w-3 mr-1" />
                                  Not Cited
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {ref.content_check?.reason || 'No reason provided'}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Figure Validation Results */}
              {contentCheckResults.figure_validation && (
                <div className="space-y-2">
                  <h3 className="font-semibold text-lg flex items-center gap-2">
                    <Image className="h-4 w-4" />
                    Figure Callout Validation
                  </h3>
                  {contentCheckResults.figure_validation.validation &&
                  Object.keys(contentCheckResults.figure_validation.validation).length > 0 ? (
                    <div className="border rounded-md p-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {Object.entries(contentCheckResults.figure_validation.validation).map(
                          ([figNum, validation]: [string, any]) => (
                            <div
                              key={figNum}
                              className="p-3 border rounded-lg flex items-start justify-between"
                            >
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="font-medium">Figure {figNum}</span>
                                  {validation.valid ? (
                                    <Badge variant="default" className="bg-green-600">
                                      <CheckCircle2 className="h-3 w-3 mr-1" />
                                      Valid
                                    </Badge>
                                  ) : (
                                    <Badge variant="destructive">
                                      <AlertCircle className="h-3 w-3 mr-1" />
                                      Invalid
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  Found {validation.count} time(s)
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">
                                  {validation.reason}
                                </p>
                              </div>
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="border rounded-md p-4 text-center text-muted-foreground">
                      No figure callouts found in the text
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}




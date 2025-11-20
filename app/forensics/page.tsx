'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/src/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/src/components/ui/card'
import { Badge } from '@/src/components/ui/badge'
import { useToast } from '@/src/hooks/use-toast'
import { Upload, Search, Loader2, CheckCircle2, AlertTriangle, XCircle, BarChart3 } from 'lucide-react'
import Image from 'next/image'

interface DiagramReport {
  diagram: string
  index: number
  localSimilarity?: any
  reverseImageSearch?: any
  hashMatches?: any
  decision: 'original' | 'partially plagiarized' | 'heavily plagiarized'
  confidence: number
  indicators: string[]
  error?: string
}

interface PlagiarismReport {
  jobId: string
  pdfPath: string
  totalDiagrams: number
  diagrams: DiagramReport[]
  summary: {
    total: number
    original: number
    partiallyPlagiarized: number
    heavilyPlagiarized: number
    averageConfidence: number
    riskLevel: 'low' | 'medium' | 'high'
  }
  timestamp: number
}

export default function ForensicsPage() {
  const [uploading, setUploading] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [jobId, setJobId] = useState<string | null>(null)
  const [report, setReport] = useState<PlagiarismReport | null>(null)
  const [progress, setProgress] = useState(0)
  const { toast } = useToast()

  // Poll for job status
  useEffect(() => {
    if (!jobId || !processing) return

    const interval = setInterval(async () => {
      try {
        const response = await fetch(`/api/forensics/status?jobId=${jobId}`)
        const data = await response.json()

        if (data.state === 'completed') {
          setProcessing(false)
          setProgress(100)
          
          // Fetch final report
          const reportResponse = await fetch(`/api/forensics/report?jobId=${jobId}`)
          const reportData = await reportResponse.json()
          setReport(reportData.report)
          
          toast({
            title: 'Analysis Complete',
            description: `Analyzed ${reportData.report.totalDiagrams} diagrams`,
          })
        } else if (data.state === 'failed') {
          setProcessing(false)
          toast({
            title: 'Analysis Failed',
            description: data.failedReason || 'Unknown error',
            variant: 'destructive',
          })
        } else {
          // Update progress
          setProgress(data.progress || 0)
        }
      } catch (error) {
        console.error('Error checking status:', error)
      }
    }, 2000) // Poll every 2 seconds

    return () => clearInterval(interval)
  }, [jobId, processing, toast])

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (file.type !== 'application/pdf' && !file.name.endsWith('.pdf')) {
      toast({
        title: 'Invalid File Type',
        description: 'Please upload a PDF file.',
        variant: 'destructive',
      })
      return
    }

    setUploading(true)
    setReport(null)
    setJobId(null)
    setProgress(0)

    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch('/api/forensics/scan', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to start scan')
      }

      const data = await response.json()
      setJobId(data.jobId)
      setProcessing(true)
      setProgress(10)

      toast({
        title: 'Scan Started',
        description: 'Forensics analysis is running in the background...',
      })
    } catch (error: any) {
      console.error('Upload error:', error)
      toast({
        title: 'Upload Failed',
        description: error.message || 'Failed to upload PDF',
        variant: 'destructive',
      })
    } finally {
      setUploading(false)
      if (event.target) {
        event.target.value = ''
      }
    }
  }

  const getDecisionBadge = (decision: string) => {
    switch (decision) {
      case 'heavily plagiarized':
        return <Badge variant="destructive">Heavily Plagiarized</Badge>
      case 'partially plagiarized':
        return <Badge className="bg-orange-500">Partially Plagiarized</Badge>
      default:
        return <Badge variant="secondary">Original</Badge>
    }
  }

  const getRiskBadge = (risk: string) => {
    switch (risk) {
      case 'high':
        return <Badge variant="destructive">High Risk</Badge>
      case 'medium':
        return <Badge className="bg-orange-500">Medium Risk</Badge>
      default:
        return <Badge variant="secondary">Low Risk</Badge>
    }
  }

  return (
    <div className="max-w-7xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Diagram Forensics Engine</h1>
        <p className="text-muted-foreground">
          AI-powered plagiarism detection for diagrams and images in PDFs.
        </p>
      </div>

      {/* Upload Section */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Upload PDF for Analysis</CardTitle>
          <CardDescription>
            Upload a PDF to perform comprehensive plagiarism detection on all diagrams.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <input
              type="file"
              accept=".pdf"
              onChange={handleFileUpload}
              disabled={uploading || processing}
              className="hidden"
              id="pdf-upload-forensics"
            />
            <label htmlFor="pdf-upload-forensics">
              <Button asChild variant="outline" disabled={uploading || processing}>
                <span className="flex items-center gap-2">
                  {(uploading || processing) ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {uploading ? 'Uploading...' : `Processing... ${progress}%`}
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4" />
                      Select PDF File
                    </>
                  )}
                </span>
              </Button>
            </label>
            {processing && (
              <div className="flex-1">
                <div className="w-full bg-muted rounded-full h-2">
                  <div
                    className="bg-primary h-2 rounded-full transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Report Section */}
      {report && (
        <div className="space-y-6">
          {/* Summary Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Analysis Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                <div>
                  <p className="text-sm text-muted-foreground">Total Diagrams</p>
                  <p className="text-2xl font-bold">{report.summary.total}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Original</p>
                  <p className="text-2xl font-bold text-green-600">{report.summary.original}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Partially Plagiarized</p>
                  <p className="text-2xl font-bold text-orange-600">
                    {report.summary.partiallyPlagiarized}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Heavily Plagiarized</p>
                  <p className="text-2xl font-bold text-red-600">
                    {report.summary.heavilyPlagiarized}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Risk Level</p>
                  {getRiskBadge(report.summary.riskLevel)}
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Average Confidence</p>
                  <p className="text-lg font-semibold">
                    {(report.summary.averageConfidence * 100).toFixed(1)}%
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Diagram Reports */}
          <div className="space-y-4">
            <h2 className="text-2xl font-bold">Diagram Analysis</h2>
            {report.diagrams.map((diagram, idx) => (
              <Card key={idx}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">
                      Diagram {diagram.index}: {getFilename(diagram.diagram)}
                    </CardTitle>
                    {getDecisionBadge(diagram.decision)}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Image Preview */}
                    <div>
                      <div className="relative aspect-video bg-muted rounded-lg overflow-hidden mb-4">
                        <Image
                          src={`/${diagram.diagram}`}
                          alt={`Diagram ${diagram.index}`}
                          fill
                          className="object-contain"
                          sizes="(max-width: 768px) 100vw, 50vw"
                        />
                      </div>
                      <div className="space-y-2">
                        <p className="text-sm">
                          <span className="font-medium">Confidence:</span>{' '}
                          {(diagram.confidence * 100).toFixed(1)}%
                        </p>
                        {diagram.indicators.length > 0 && (
                          <div>
                            <p className="text-sm font-medium mb-1">Indicators:</p>
                            <ul className="list-disc list-inside text-sm text-muted-foreground">
                              {diagram.indicators.map((indicator, i) => (
                                <li key={i}>{indicator}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Analysis Details */}
                    <div className="space-y-4">
                      {/* Hash Matches */}
                      {diagram.hashMatches && (
                        <div className="p-3 bg-muted rounded-lg">
                          <p className="text-sm font-medium mb-2">Hash Matches</p>
                          <p className="text-xs text-muted-foreground">
                            {diagram.hashMatches.count} similar images found
                            {diagram.hashMatches.highestSimilarity && (
                              <span className="ml-2">
                                (Highest: {(diagram.hashMatches.highestSimilarity * 100).toFixed(1)}%)
                              </span>
                            )}
                          </p>
                        </div>
                      )}

                      {/* Local Similarity */}
                      {diagram.localSimilarity && diagram.localSimilarity.bestMatch && (
                        <div className="p-3 bg-muted rounded-lg">
                          <p className="text-sm font-medium mb-2">Local Similarity</p>
                          <p className="text-xs text-muted-foreground">
                            Best match: {diagram.localSimilarity.bestMatch.score.toFixed(1)}%
                            <br />
                            SSIM: {diagram.localSimilarity.bestMatch.ssim.toFixed(3)}
                          </p>
                        </div>
                      )}

                      {/* Reverse Search */}
                      {diagram.reverseImageSearch && (
                        <div className="p-3 bg-muted rounded-lg">
                          <p className="text-sm font-medium mb-2">Reverse Image Search</p>
                          {diagram.reverseImageSearch.error ? (
                            <p className="text-xs text-muted-foreground">
                              Error: {diagram.reverseImageSearch.error}
                            </p>
                          ) : (
                            <div className="space-y-1">
                              <p className="text-xs text-muted-foreground">
                                {diagram.reverseImageSearch.similarImagesCount} similar images
                                <br />
                                {diagram.reverseImageSearch.matchingPagesCount} matching pages
                              </p>
                              {diagram.reverseImageSearch.resultUrl && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() =>
                                    window.open(diagram.reverseImageSearch.resultUrl, '_blank')
                                  }
                                >
                                  <Search className="h-3 w-3 mr-1" />
                                  View Results
                                </Button>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {diagram.error && (
                        <div className="p-3 bg-destructive/10 rounded-lg">
                          <p className="text-sm text-destructive">Error: {diagram.error}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// Helper to extract filename from path
function getFilename(path: string): string {
  return path.split('/').pop() || path
}


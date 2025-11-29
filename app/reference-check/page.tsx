'use client'

import { useState, useEffect, useRef } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/src/components/ui/card'
import { Button } from '@/src/components/ui/button'
import { Badge } from '@/src/components/ui/badge'
import { Input } from '@/src/components/ui/input'
import { Search, FileText, CheckCircle2, AlertCircle, XCircle, Upload, Loader2, Eye, Trash2, RefreshCw, TrendingUp, TrendingDown } from 'lucide-react'
import Link from 'next/link'
import { useToast } from '@/src/hooks/use-toast'
import axios, { CancelTokenSource } from 'axios'
import { useQuery } from '@tanstack/react-query'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/src/components/ui/alert-dialog'

interface Paper {
  id: string
  title: string
  abstract: string | null
  status: string
  year: number | null
  venue: string | null
  doi: string | null
  citationCount: number
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

export default function ReferenceCheckPage() {
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [uploadedCount, setUploadedCount] = useState(0)
  const [totalCount, setTotalCount] = useState(0)
  const [validatingPapers, setValidatingPapers] = useState<Set<string>>(new Set())
  const [deletingPaperId, setDeletingPaperId] = useState<string | null>(null)
  const { toast } = useToast()
  
  // Refs to track ongoing requests for cleanup
  const uploadCancelToken = useRef<CancelTokenSource | null>(null)
  const validationCancelTokens = useRef<Map<string, CancelTokenSource>>(new Map())
  const deleteCancelToken = useRef<CancelTokenSource | null>(null)

  // Fetch papers with caching (data from DB, cached for fast display)
  const { data: papersData, refetch: refetchPapers, isLoading } = useQuery({
    queryKey: ['papers'],
    queryFn: async () => {
      const response = await axios.get('/api/papers?limit=50')
      return response.data
    },
    staleTime: 5 * 60 * 1000, // 5 minutes - data from DB is fresh for 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes - keep in cache (React Query v5)
    refetchOnMount: false, // Use cached data if available
  })

  const papers: Paper[] = papersData?.papers || []

  const handleMultipleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files || files.length === 0) return

    const fileArray = Array.from(files)
    
    // Validate all files are PDFs
    const invalidFiles = fileArray.filter(
      file => file.type !== 'application/pdf' && !file.name.endsWith('.pdf')
    )
    
    if (invalidFiles.length > 0) {
      toast({
        title: 'Invalid File Type',
        description: 'Please upload only PDF files.',
        variant: 'destructive',
      })
      return
    }

    setUploading(true)
    setProgress(0)
    setTotalCount(fileArray.length)
    setUploadedCount(0)

    // Create cancel token for this upload
    uploadCancelToken.current = axios.CancelToken.source()

    try {
      const formData = new FormData()
      
      // Append all files
      fileArray.forEach((file) => {
        formData.append('files[]', file)
      })

      const response = await axios.post('/api/papers/upload', formData, {
        cancelToken: uploadCancelToken.current.token,
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const percentCompleted = Math.round(
              (progressEvent.loaded * 100) / progressEvent.total
            )
            setProgress(percentCompleted)
          }
        },
      })

      // Show success message
      if (response.data.success) {
        const { total, successful, failed, papers: uploadedPapers, errors } = response.data
        
        setUploadedCount(successful)
        
        let description = ''
        if (total === 1) {
          description = 'PDF uploaded and references extracted successfully.'
        } else {
          description = `Successfully uploaded ${successful} out of ${total} PDF(s) and extracted references.`
          if (failed > 0) {
            description += ` ${failed} file(s) failed to upload.`
          }
        }

        toast({
          title: 'Upload Successful',
          description,
          variant: 'default',
        })

        // Show errors if any
        if (errors && errors.length > 0) {
          errors.forEach((error: { filename: string; error: string }) => {
            toast({
              title: `Upload Failed: ${error.filename}`,
              description: error.error,
              variant: 'destructive',
            })
          })
        }

        // Refresh papers list
        await refetchPapers()

        // References are automatically extracted and validated during upload only
        if (successful > 0) {
          toast({
            title: 'Upload Complete',
            description: `PDF(s) uploaded. References extracted and validated automatically.`,
            variant: 'default',
          })
        }
      }
    } catch (error: any) {
      // Don't show error if request was cancelled
      if (axios.isCancel(error)) {
        console.log('Upload cancelled:', error.message)
        return
      }
      
      console.error('Upload error:', error)
      const errorMessage = error.response?.data?.error || error.message || 'Failed to upload files'
      
      toast({
        title: 'Upload Failed',
        description: errorMessage,
        variant: 'destructive',
      })
    } finally {
      setUploading(false)
      setProgress(0)
      setUploadedCount(0)
      setTotalCount(0)
      uploadCancelToken.current = null
      // Reset input
      if (event.target) {
        event.target.value = ''
      }
    }
  }

  const validateReferences = async (paperId: string) => {
    if (validatingPapers.has(paperId)) return
    
    setValidatingPapers(prev => new Set(prev).add(paperId))
    
    // Create cancel token for this validation
    const cancelToken = axios.CancelToken.source()
    validationCancelTokens.current.set(paperId, cancelToken)
    
    try {
      const response = await axios.post(`/api/papers/${paperId}/references/validate`, {}, {
        cancelToken: cancelToken.token,
      })
      
      if (response.data.success) {
        toast({
          title: 'Validation Complete',
          description: `References validated for paper`,
          variant: 'default',
        })
        refetchPapers()
      }
    } catch (error: any) {
      // Don't show error if request was cancelled
      if (axios.isCancel(error)) {
        console.log('Validation cancelled:', error.message)
        return
      }
      
      console.error('Validation error:', error)
      toast({
        title: 'Validation Failed',
        description: error.response?.data?.error || 'Failed to validate references',
        variant: 'destructive',
      })
    } finally {
      setValidatingPapers(prev => {
        const newSet = new Set(prev)
        newSet.delete(paperId)
        return newSet
      })
      validationCancelTokens.current.delete(paperId)
    }
  }

  const handleDeletePaper = async (paperId: string) => {
    setDeletingPaperId(paperId)
    
    // Create cancel token for this delete
    deleteCancelToken.current = axios.CancelToken.source()
    
    try {
      await axios.delete(`/api/papers/${paperId}`, {
        cancelToken: deleteCancelToken.current.token,
      })
      
      toast({
        title: 'Paper Deleted',
        description: 'Paper has been deleted successfully.',
        variant: 'default',
      })
      
      refetchPapers()
    } catch (error: any) {
      // Don't show error if request was cancelled
      if (axios.isCancel(error)) {
        console.log('Delete cancelled:', error.message)
        return
      }
      
      console.error('Delete error:', error)
      toast({
        title: 'Delete Failed',
        description: error.response?.data?.error || 'Failed to delete paper',
        variant: 'destructive',
      })
    } finally {
      setDeletingPaperId(null)
      deleteCancelToken.current = null
    }
  }


  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Reference Check Module</h1>
        <p className="text-muted-foreground">
          Extract and validate references in research papers. Run this module separately to check references against Crossref database.
        </p>
      </div>

      {/* Upload Multiple PDFs */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Upload PDFs for Reference Extraction
          </CardTitle>
          <CardDescription>
            Upload one or multiple PDF files to extract and validate references
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <input
              type="file"
              accept=".pdf"
              multiple
              onChange={handleMultipleFileUpload}
              disabled={uploading}
              className="hidden"
              id="pdf-upload-multiple"
            />
            <label htmlFor="pdf-upload-multiple">
              <Button 
                asChild 
                variant="outline" 
                disabled={uploading}
                className="w-full"
              >
                <span className="flex items-center gap-2">
                  {uploading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {totalCount > 1
                        ? `Uploading ${uploadedCount}/${totalCount}... ${progress}%`
                        : `Uploading... ${progress}%`
                      }
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4" />
                      Upload PDF(s)
                    </>
                  )}
                </span>
              </Button>
            </label>
            {totalCount > 1 && (
              <p className="text-xs text-muted-foreground">
                {uploading 
                  ? `Processing ${uploadedCount} of ${totalCount} files...`
                  : `Select multiple PDF files to upload and extract references`
                }
              </p>
            )}
            {!uploading && (
              <p className="text-xs text-muted-foreground">
                You can select multiple PDF files at once. References will be automatically extracted from each PDF.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Papers List */}
      <Card className="mt-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Uploaded Papers ({papers.length})
          </CardTitle>
          <CardDescription>
            View and manage uploaded papers and their references
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">
              <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Loading papers...</p>
            </div>
          ) : papers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No papers uploaded yet. Upload PDF files to get started.
            </div>
          ) : (
            <div className="space-y-4">
              {papers.map((paper) => {
                const authorNames = paper.authors.map(pa => pa.author.name).join(', ')
                const isValidating = validatingPapers.has(paper.id)
                const validation = (paper as any).metadata?.validationAnalysis
                const refValidation = validation?.referenceValidation
                const contentCheck = validation?.contentCheck
                const refValidationPercentage = refValidation?.percentage || 0
                const contentCheckPercentage = contentCheck?.percentage || 0
                
                return (
                  <Card key={paper.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="pt-6">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h3 className="font-semibold text-lg mb-2">{paper.title}</h3>
                          {authorNames && (
                            <p className="text-sm text-muted-foreground mb-2">
                              {authorNames}
                            </p>
                          )}
                          <div className="flex gap-2 flex-wrap items-center mt-3">
                            {paper.year && (
                              <Badge variant="outline">{paper.year}</Badge>
                            )}
                            {paper.venue && (
                              <Badge variant="outline">{paper.venue}</Badge>
                            )}
                            <Badge variant="secondary">
                              {paper._count.references} references
                            </Badge>
                            {isValidating && (
                              <Badge variant="outline" className="flex items-center gap-1">
                                <Loader2 className="h-3 w-3 animate-spin" />
                                Validating...
                              </Badge>
                            )}
                          </div>
                          
                          {/* Validation Statistics - Always show */}
                          <div className="mt-4 grid grid-cols-2 gap-3">
                            {/* Reference Validation */}
                            <div className={`p-3 rounded-lg border ${
                              refValidationPercentage >= 75 
                                ? 'bg-green-50 border-green-200' 
                                : refValidationPercentage > 0
                                ? 'bg-red-50 border-red-200'
                                : 'bg-gray-50 border-gray-200'
                            }`}>
                              <div className="flex items-center gap-2 mb-1">
                                <FileText className={`h-4 w-4 ${
                                  refValidationPercentage >= 75 ? 'text-green-600' : 
                                  refValidationPercentage > 0 ? 'text-red-600' : 'text-gray-500'
                                }`} />
                                <span className="text-sm font-medium">Reference Valid</span>
                              </div>
                              <div className="flex items-center gap-2">
                                {refValidationPercentage >= 75 ? (
                                  <TrendingUp className="h-4 w-4 text-green-600" />
                                ) : refValidationPercentage > 0 ? (
                                  <TrendingDown className="h-4 w-4 text-red-600" />
                                ) : (
                                  <AlertCircle className="h-4 w-4 text-gray-500" />
                                )}
                                <span className={`text-xl font-bold ${
                                  refValidationPercentage >= 75 ? 'text-green-700' : 
                                  refValidationPercentage > 0 ? 'text-red-700' : 'text-gray-600'
                                }`}>
                                  {refValidationPercentage.toFixed(1)}%
                                </span>
                              </div>
                              {refValidation ? (
                                <p className="text-xs text-muted-foreground mt-1">
                                  {refValidation.valid || 0} / {refValidation.total || 0} valid
                                </p>
                              ) : (
                                <p className="text-xs text-muted-foreground mt-1">
                                  Not validated yet
                                </p>
                              )}
                            </div>
                            
                            {/* Content Check (Citation) */}
                            <div className={`p-3 rounded-lg border ${
                              contentCheckPercentage >= 75 
                                ? 'bg-green-50 border-green-200' 
                                : contentCheckPercentage > 0
                                ? 'bg-red-50 border-red-200'
                                : 'bg-gray-50 border-gray-200'
                            }`}>
                              <div className="flex items-center gap-2 mb-1">
                                <CheckCircle2 className={`h-4 w-4 ${
                                  contentCheckPercentage >= 75 ? 'text-green-600' : 
                                  contentCheckPercentage > 0 ? 'text-red-600' : 'text-gray-500'
                                }`} />
                                <span className="text-sm font-medium">Valid in Citation</span>
                              </div>
                              <div className="flex items-center gap-2">
                                {contentCheckPercentage >= 75 ? (
                                  <TrendingUp className="h-4 w-4 text-green-600" />
                                ) : contentCheckPercentage > 0 ? (
                                  <TrendingDown className="h-4 w-4 text-red-600" />
                                ) : (
                                  <AlertCircle className="h-4 w-4 text-gray-500" />
                                )}
                                <span className={`text-xl font-bold ${
                                  contentCheckPercentage >= 75 ? 'text-green-700' : 
                                  contentCheckPercentage > 0 ? 'text-red-700' : 'text-gray-600'
                                }`}>
                                  {contentCheckPercentage.toFixed(1)}%
                                </span>
                              </div>
                              <p className="text-xs text-muted-foreground mt-1">
                                {contentCheckPercentage > 0 ? 'Cited in text' : 'Not checked yet'}
                              </p>
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2 ml-4">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => validateReferences(paper.id)}
                            disabled={isValidating}
                          >
                            {isValidating ? (
                              <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Validating...
                              </>
                            ) : (
                              <>
                                <CheckCircle2 className="h-4 w-4 mr-2" />
                                Validate
                              </>
                            )}
                          </Button>
                          <Link href={`/reference-check/${paper.id}`}>
                            <Button variant="outline" size="sm">
                              <Eye className="h-4 w-4 mr-2" />
                              View References
                            </Button>
                          </Link>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button 
                                variant="outline" 
                                size="sm"
                                disabled={deletingPaperId === paper.id}
                                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              >
                                {deletingPaperId === paper.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Trash2 className="h-4 w-4" />
                                )}
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Paper</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to delete "{paper.title}"? This action cannot be undone and will delete all associated references and diagrams.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleDeletePaper(paper.id)}
                                  className="bg-red-600 hover:bg-red-700"
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

    </div>
  )
}


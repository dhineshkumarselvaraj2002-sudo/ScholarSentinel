'use client'

import { useState } from 'react'
import { Button } from '@/src/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/src/components/ui/card'
import { Badge } from '@/src/components/ui/badge'
import { useToast } from '@/src/hooks/use-toast'
import { getGoogleImagesUrl, getBingVisualSearchUrl, formatHash } from '@/lib/diagram/hash'
import { Upload, Search, Copy, CheckCircle2, AlertCircle, Loader2, Globe, ExternalLink, BarChart3 } from 'lucide-react'
import Image from 'next/image'

interface WebSearchResult {
  found: boolean
  similarImages: Array<{ url: string; thumbnail: string }>
  matchingPages: Array<{ url: string; title: string }>
  bestGuess?: string
  resultUrl: string
  count: number
  error?: string
}

interface ExtractedImage {
  filename: string
  hash: string
  path: string
  page: number
  width: number
  height: number
  type: string
  is_duplicate: boolean
  webSearch?: WebSearchResult
  isCopiedFromWeb?: boolean
  ocrText?: string
  keywords?: string[]
}

interface DuplicateGroup {
  hash: string
  files: string[]
  count: number
}

interface ExtractionResult {
  success: boolean
  jobId: string
  images: ExtractedImage[]
  duplicates: DuplicateGroup[]
  total_images: number
  unique_images: number
}

export default function DiagramCheckerPage() {
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<ExtractionResult | null>(null)
  const [copiedHash, setCopiedHash] = useState<string | null>(null)
  const [searching, setSearching] = useState(false)
  const [searchProgress, setSearchProgress] = useState({ current: 0, total: 0 })
  const { toast } = useToast()

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    // Validate file type
    if (file.type !== 'application/pdf' && !file.name.endsWith('.pdf')) {
      toast({
        title: 'Invalid File Type',
        description: 'Please upload a PDF file.',
        variant: 'destructive',
      })
      return
    }

    setUploading(true)
    setResult(null)

    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch('/api/diagram/upload', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to process PDF')
      }

      const data: ExtractionResult = await response.json()
      setResult(data)

      toast({
        title: 'Extraction Complete',
        description: `Extracted ${data.total_images} images (${data.unique_images} unique)`,
      })

      // Automatically start web search for all extracted images
      if (data.images.length > 0) {
        await performWebSearch(data.images, data)
      }
    } catch (error: any) {
      console.error('Upload error:', error)
      toast({
        title: 'Extraction Failed',
        description: error.message || 'Failed to extract diagrams from PDF',
        variant: 'destructive',
      })
    } finally {
      setUploading(false)
      // Reset input
      if (event.target) {
        event.target.value = ''
      }
    }
  }

  const copyHash = (hash: string) => {
    navigator.clipboard.writeText(hash)
    setCopiedHash(hash)
    toast({
      title: 'Hash Copied',
      description: 'Perceptual hash copied to clipboard',
    })
    setTimeout(() => setCopiedHash(null), 2000)
  }

  const openGoogleImages = (imagePath: string) => {
    const imageUrl = `${window.location.origin}/${imagePath}`
    const searchUrl = getGoogleImagesUrl(imageUrl)
    window.open(searchUrl, '_blank', 'noopener,noreferrer')
  }

  const openBingVisualSearch = (imagePath: string) => {
    const imageUrl = `${window.location.origin}/${imagePath}`
    const searchUrl = getBingVisualSearchUrl(imageUrl)
    window.open(searchUrl, '_blank', 'noopener,noreferrer')
  }

  const performWebSearch = async (images: ExtractedImage[], currentResult: ExtractionResult) => {
    setSearching(true)
    setSearchProgress({ current: 0, total: images.length })

    const updatedImages: ExtractedImage[] = []
    
    // Configuration for delays between searches
    const DELAY_BETWEEN_SEARCHES_MS = 5000  // 5 seconds (OCR is faster, less rate limiting needed)
    const USE_OCR_SEARCH = true  // Use OCR-based search instead of Playwright

    for (let i = 0; i < images.length; i++) {
      const image = images[i]
      setSearchProgress({ current: i + 1, total: images.length })

      // Add delay between searches (except for the first one)
      if (i > 0) {
        toast({
          title: 'Processing',
          description: `Waiting ${DELAY_BETWEEN_SEARCHES_MS / 1000} seconds before next search...`,
          duration: DELAY_BETWEEN_SEARCHES_MS,
        })
        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_SEARCHES_MS))
      }

      try {
        // Use OCR-based search (no browser automation)
        const response = await fetch('/api/diagram/ocr-search', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            imagePath: image.path,
            // Optional: API keys can be passed here or set as env vars
            // serperApiKey: process.env.NEXT_PUBLIC_SERPER_API_KEY,
            // googleCseId: process.env.NEXT_PUBLIC_GOOGLE_CSE_ID,
          }),
        })

        if (response.ok) {
          const searchData = await response.json()
          const ocrResult = searchData.result
          
          // Check for rate limiting
          if (response.status === 429) {
            toast({
              title: 'Rate Limit Exceeded',
              description: searchData.error || 'Too many searches. Please wait before trying again.',
              variant: 'destructive',
              duration: 10000,
            })
            updatedImages.push({
              ...image,
              webSearch: {
                found: false,
                similarImages: [],
                matchingPages: [],
                resultUrl: '',
                count: 0,
                error: searchData.error || 'Rate limit exceeded',
              },
              isCopiedFromWeb: false,
            })
            // Stop searching if rate limited
            break
          }
          
          // Convert OCR search results to WebSearchResult format
          const webSearchResult: WebSearchResult = {
            found: ocrResult.results && ocrResult.results.length > 0,
            similarImages: [],  // OCR search doesn't return image URLs directly
            matchingPages: ocrResult.results?.map((r: any) => ({
              url: r.url,
              title: r.title || r.url,
            })) || [],
            bestGuess: ocrResult.queries?.[0] || undefined,
            resultUrl: ocrResult.results?.[0]?.url || '',
            count: ocrResult.results?.length || 0,
            error: ocrResult.error,
          }
          
          updatedImages.push({
            ...image,
            webSearch: webSearchResult,
            isCopiedFromWeb: webSearchResult.found && webSearchResult.matchingPages.length > 0,
            // Store OCR data for display
            ocrText: ocrResult.ocr_text,
            keywords: ocrResult.keywords,
          })
        } else if (response.status === 429) {
          // Rate limit exceeded
          const errorData = await response.json()
          toast({
            title: 'Rate Limit Exceeded',
            description: errorData.error || 'Too many searches. Please wait before trying again.',
            variant: 'destructive',
            duration: 10000,
          })
          updatedImages.push({
            ...image,
            webSearch: {
              found: false,
              similarImages: [],
              matchingPages: [],
              resultUrl: '',
              count: 0,
              error: errorData.error || 'Rate limit exceeded',
            },
            isCopiedFromWeb: false,
          })
          // Stop searching if rate limited
          break
        } else {
          // If search fails, keep original image without web search data
          updatedImages.push({
            ...image,
            webSearch: {
              found: false,
              similarImages: [],
              matchingPages: [],
              resultUrl: '',
              count: 0,
              error: 'Search failed',
            },
            isCopiedFromWeb: false,
          })
        }
      } catch (error) {
        console.error(`Error searching for image ${image.filename}:`, error)
        updatedImages.push({
          ...image,
          webSearch: {
            found: false,
            similarImages: [],
            matchingPages: [],
            resultUrl: '',
            count: 0,
            error: 'Search error',
          },
          isCopiedFromWeb: false,
        })
      }

      // Update result progressively
      setResult({
        ...currentResult,
        images: [...updatedImages, ...images.slice(i + 1)],
      })
    }

    setSearching(false)
    setSearchProgress({ current: 0, total: 0 })

    toast({
      title: 'Web Search Complete',
      description: `Searched ${images.length} images for web matches`,
    })
  }

  return (
    <div className="max-w-7xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Diagram Checker</h1>
        <p className="text-muted-foreground">
          Upload a PDF to extract diagrams/images, detect duplicates, and prepare for reverse image search.
        </p>
      </div>

      {/* Upload Section */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Upload PDF</CardTitle>
          <CardDescription>
            Select a PDF file to extract diagrams and images. The system will compute perceptual hashes
            and detect duplicates automatically.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <input
              type="file"
              accept=".pdf"
              onChange={handleFileUpload}
              disabled={uploading}
              className="hidden"
              id="pdf-upload"
            />
            <label htmlFor="pdf-upload">
              <Button asChild variant="outline" disabled={uploading}>
                <span className="flex items-center gap-2">
                  {uploading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Processing PDF...
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
            {uploading && (
              <p className="text-sm text-muted-foreground">
                Extracting diagrams and computing hashes...
              </p>
            )}
            {searching && (
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <p className="text-sm text-muted-foreground">
                  Searching web for matches... ({searchProgress.current}/{searchProgress.total})
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Results Section */}
      {result && (
        <div className="space-y-6">
          {/* Summary Card */}
          <Card>
            <CardHeader>
              <CardTitle>Extraction Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Total Images</p>
                  <p className="text-2xl font-bold">{result.total_images}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Unique Images</p>
                  <p className="text-2xl font-bold text-green-600">{result.unique_images}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Duplicates</p>
                  <p className="text-2xl font-bold text-orange-600">
                    {result.total_images - result.unique_images}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Duplicate Groups</p>
                  <p className="text-2xl font-bold">{result.duplicates.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Analytics Card - Copy-Paste Detection */}
          {result.images.some(img => img.webSearch) && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  Web Copy-Paste Analytics
                </CardTitle>
                <CardDescription>
                  Analysis of diagrams found on websites (potential copy-paste detection)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Found on Web</p>
                    <p className="text-2xl font-bold text-red-600">
                      {result.images.filter(img => img.isCopiedFromWeb).length}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {result.images.length > 0
                        ? `${Math.round((result.images.filter(img => img.isCopiedFromWeb).length / result.images.length) * 100)}% of images`
                        : '0%'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Original</p>
                    <p className="text-2xl font-bold text-green-600">
                      {result.images.filter(img => !img.isCopiedFromWeb && img.webSearch).length}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Not found on web
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total Matches</p>
                    <p className="text-2xl font-bold text-orange-600">
                      {result.images.reduce((sum, img) => sum + (img.webSearch?.count || 0), 0)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Similar images found
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Matching Pages</p>
                    <p className="text-2xl font-bold text-blue-600">
                      {result.images.reduce((sum, img) => sum + (img.webSearch?.matchingPages?.length || 0), 0)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Web pages with matches
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Duplicate Groups */}
          {result.duplicates.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-orange-600" />
                  Duplicate Groups
                </CardTitle>
                <CardDescription>
                  Images with identical perceptual hashes (exact duplicates)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {result.duplicates.map((dup, idx) => (
                    <div
                      key={idx}
                      className="p-4 border rounded-lg bg-orange-50 dark:bg-orange-950/20"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Badge variant="destructive">{dup.count} duplicates</Badge>
                          <code className="text-xs bg-muted px-2 py-1 rounded">
                            {formatHash(dup.hash, 20)}
                          </code>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyHash(dup.hash)}
                          className="h-7"
                        >
                          {copiedHash === dup.hash ? (
                            <CheckCircle2 className="h-3 w-3" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </Button>
                      </div>
                      <ul className="list-disc list-inside text-sm text-muted-foreground">
                        {dup.files.map((file, fileIdx) => (
                          <li key={fileIdx}>{file}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Images Grid */}
          <Card>
            <CardHeader>
              <CardTitle>Extracted Images</CardTitle>
              <CardDescription>
                All diagrams and images extracted from the PDF. Click on images to view full size.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {result.images.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No images found in the PDF.
                </p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {result.images.map((img, idx) => (
                    <Card key={idx} className="overflow-hidden">
                      <div className="relative aspect-video bg-muted">
                        <Image
                          src={`/${img.path}`}
                          alt={img.filename}
                          fill
                          className="object-contain"
                          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                        />
                        {img.is_duplicate && (
                          <div className="absolute top-2 right-2">
                            <Badge variant="destructive">Duplicate</Badge>
                          </div>
                        )}
                        {img.isCopiedFromWeb && (
                          <div className="absolute top-2 left-2">
                            <Badge variant="destructive" className="flex items-center gap-1">
                              <Globe className="h-3 w-3" />
                              Found on Web
                            </Badge>
                          </div>
                        )}
                      </div>
                      <CardContent className="p-4">
                        <div className="space-y-3">
                          <div>
                            <p className="text-sm font-medium">{img.filename}</p>
                            <p className="text-xs text-muted-foreground">
                              Page {img.page} • {img.width}×{img.height}px • {img.type}
                            </p>
                          </div>

                          {/* Hash Display */}
                          <div className="flex items-center gap-2">
                            <code className="text-xs bg-muted px-2 py-1 rounded flex-1 truncate">
                              {formatHash(img.hash, 16)}
                            </code>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => copyHash(img.hash)}
                              className="h-7 w-7 p-0"
                              title="Copy hash"
                            >
                              {copiedHash === img.hash ? (
                                <CheckCircle2 className="h-3 w-3" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                            </Button>
                          </div>

                          {/* Web Search Results */}
                          {img.webSearch && (
                            <div className="space-y-2 p-2 bg-muted rounded-lg">
                              {img.webSearch.error ? (
                                <p className="text-xs text-destructive">{img.webSearch.error}</p>
                              ) : (
                                <>
                                  {img.webSearch.found ? (
                                    <div className="space-y-1">
                                      <p className="text-xs font-medium text-red-600">
                                        ⚠️ Found {img.webSearch.count} similar images
                                      </p>
                                      {img.webSearch.matchingPages && img.webSearch.matchingPages.length > 0 && (
                                        <div className="space-y-1">
                                          <p className="text-xs text-muted-foreground">Matching pages:</p>
                                          {img.webSearch.matchingPages.slice(0, 2).map((page, pageIdx) => (
                                            <a
                                              key={pageIdx}
                                              href={page.url}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                                            >
                                              <ExternalLink className="h-3 w-3" />
                                              {page.title || page.url}
                                            </a>
                                          ))}
                                        </div>
                                      )}
                                      {img.webSearch.resultUrl && (
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          className="w-full mt-2"
                                          onClick={() => window.open(img.webSearch!.resultUrl, '_blank')}
                                        >
                                          <ExternalLink className="h-3 w-3 mr-1" />
                                          View Search Results
                                        </Button>
                                      )}
                                    </div>
                                  ) : (
                                    <p className="text-xs text-green-600">✓ Not found on web (likely original)</p>
                                  )}
                                </>
                              )}
                            </div>
                          )}

                          {/* Action Buttons */}
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-1"
                              onClick={() => openGoogleImages(img.path)}
                            >
                              <Search className="h-3 w-3 mr-1" />
                              Google
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-1"
                              onClick={() => openBingVisualSearch(img.path)}
                            >
                              <Search className="h-3 w-3 mr-1" />
                              Bing
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}


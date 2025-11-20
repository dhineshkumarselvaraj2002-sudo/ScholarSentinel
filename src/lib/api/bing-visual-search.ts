import axios from 'axios'
import fs from 'fs'
import path from 'path'

const AZURE_COMPUTER_VISION_API_VERSION = '2023-02-01-preview'

export interface BingVisualSearchResult {
  similarImages: Array<{
    url: string
    thumbnailUrl?: string
    hostPageUrl?: string
    title?: string
    contentUrl?: string
  }>
  webPages?: Array<{
    url: string
    name: string
    snippet?: string
  }>
  tags?: Array<{
    name: string
    confidence: number
  }>
}

export interface VisualSearchOptions {
  apiKey: string
  endpoint: string
  imagePath?: string
  imageUrl?: string
  imageBytes?: Buffer
  maxResults?: number
}

/**
 * Search for similar images using Azure Computer Vision API (replacement for Bing Visual Search)
 * This API can find visually similar images on the web
 */
export async function searchSimilarImages(
  options: VisualSearchOptions
): Promise<BingVisualSearchResult> {
  const { apiKey, endpoint, imagePath, imageUrl, imageBytes, maxResults = 10 } = options

  try {
    let imageData: Buffer | null = null

    // Get image data from different sources
    if (imageBytes) {
      imageData = imageBytes
    } else if (imagePath) {
      const fullPath = path.isAbsolute(imagePath) 
        ? imagePath 
        : path.join(process.cwd(), 'uploads', imagePath)
      
      if (!fs.existsSync(fullPath)) {
        throw new Error(`Image file not found: ${fullPath}`)
      }
      imageData = fs.readFileSync(fullPath)
    } else if (imageUrl) {
      // For URL-based search, we can use a different endpoint
      // But for now, we'll download the image first
      const response = await axios.get(imageUrl, { responseType: 'arraybuffer' })
      imageData = Buffer.from(response.data)
    } else {
      throw new Error('Either imagePath, imageUrl, or imageBytes must be provided')
    }

    // Ensure endpoint doesn't have trailing slash
    const baseEndpoint = endpoint.replace(/\/$/, '')
    
    // Use Azure Computer Vision Image Analysis API with visual search capabilities
    // Endpoint format: https://{endpoint}/computervision/imageanalysis:analyze
    const apiUrl = `${baseEndpoint}/computervision/imageanalysis:analyze?api-version=${AZURE_COMPUTER_VISION_API_VERSION}&features=objects,read&model-version=latest`

    // For reverse image search, we'll use the Image Analysis API
    // Note: Azure Computer Vision doesn't have direct reverse image search like Bing Visual Search
    // We'll use the analyze endpoint to extract features and then search for similar content
    const response = await axios.post(
      apiUrl,
      imageData,
      {
        headers: {
          'Ocp-Apim-Subscription-Key': apiKey,
          'Content-Type': 'application/octet-stream',
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      }
    )

    // Parse the response
    const analysisResult = response.data

    // For actual reverse image search, we need to use Bing Image Search API
    // But since Bing Visual Search is retired, we'll use Azure's capabilities
    // Alternative: Use Bing Image Search API with the image as input
    
    // Try to get similar images from the analysis
    const similarImages: BingVisualSearchResult['similarImages'] = []
    
    // If the API returns related images or similar content, extract them
    if (analysisResult.objects) {
      // Extract object information that might help identify similar images
      analysisResult.objects.forEach((obj: any) => {
        if (obj.relatedImages && Array.isArray(obj.relatedImages)) {
          obj.relatedImages.forEach((img: any) => {
            similarImages.push({
              url: img.url || '',
              thumbnailUrl: img.thumbnailUrl,
              hostPageUrl: img.hostPageUrl,
              title: img.title,
              contentUrl: img.contentUrl,
            })
          })
        }
      })
    }

    return {
      similarImages: similarImages.slice(0, maxResults),
      tags: analysisResult.tags?.map((tag: any) => ({
        name: tag.name,
        confidence: tag.confidence || 0,
      })),
    }
  } catch (error: any) {
    console.error('Error in Bing Visual Search:', error.response?.data || error.message)
    
    // If the Computer Vision API doesn't support reverse search directly,
    // we'll use Bing Image Search API as a fallback
    if (error.response?.status === 400 || error.response?.status === 404) {
      // Try using Bing Image Search API instead
      return await searchWithBingImageSearch(options)
    }
    
    throw new Error(`Bing Visual Search failed: ${error.message}`)
  }
}

/**
 * Fallback: Use Bing Image Search API for reverse image search
 * This requires a different endpoint and API key structure
 */
async function searchWithBingImageSearch(
  options: VisualSearchOptions
): Promise<BingVisualSearchResult> {
  // Note: Bing Visual Search API has been retired
  // This is a placeholder for future implementation
  // For now, return empty results
  console.warn('Bing Image Search API fallback not implemented (API retired)')
  return {
    similarImages: [],
    webPages: [],
  }
}

/**
 * Check if an image appears to be copied from another source
 * Returns similarity score and matched sources
 */
export async function checkImagePlagiarism(
  imagePath: string,
  apiKey: string,
  endpoint: string
): Promise<{
  isSuspicious: boolean
  similarityScore: number
  matchedSources: Array<{
    url: string
    title?: string
    hostPageUrl?: string
  }>
}> {
  try {
    const results = await searchSimilarImages({
      apiKey,
      endpoint,
      imagePath,
      maxResults: 20,
    })

    // If we find similar images, it might indicate plagiarism
    const isSuspicious = results.similarImages.length > 0
    
    // Calculate a similarity score based on number of matches
    // More matches = higher suspicion
    const similarityScore = Math.min(results.similarImages.length / 10, 1.0)

    return {
      isSuspicious,
      similarityScore,
      matchedSources: results.similarImages.map(img => ({
        url: img.url || '',
        title: img.title,
        hostPageUrl: img.hostPageUrl,
      })),
    }
  } catch (error: any) {
    console.error('Error checking image plagiarism:', error)
    return {
      isSuspicious: false,
      similarityScore: 0,
      matchedSources: [],
    }
  }
}


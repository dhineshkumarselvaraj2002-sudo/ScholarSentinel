import axios from 'axios'
import FormData from 'form-data'
import fs from 'fs'
import path from 'path'

const PDF_SERVICE_URL = process.env.PDF_SERVICE_URL || 'http://127.0.0.1:8000'

export interface TextExtractionResult {
  text: string
  pages: number
  metadata: Record<string, any>
}

export interface ReferenceExtractionResult {
  references: Array<{
    order: number
    raw_text: string
    normalized_title?: string
    normalized_authors?: string
    normalized_year?: number
    normalized_doi?: string
    normalized_venue?: string
  }>
  count: number
}

export interface FigureExtractionResult {
  figures: Array<{
    order: number
    page_number: number
    image_path: string
    perceptual_hash?: string
    width?: number
    height?: number
    caption?: string
  }>
  count: number
}

export async function extractTextFromPDF(
  pdfPath: string,
  geminiApiKey?: string
): Promise<TextExtractionResult> {
  try {
    const formData = new FormData()
    const fileStream = fs.createReadStream(pdfPath)
    formData.append('file', fileStream, path.basename(pdfPath))

    const headers: Record<string, string> = {
      ...formData.getHeaders(),
    }

    // Add Gemini API key header if provided
    if (geminiApiKey) {
      headers['X-Gemini-API-Key'] = geminiApiKey
    }

    const response = await axios.post(`${PDF_SERVICE_URL}/extract-text`, formData, {
      headers,
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    })

    return response.data
  } catch (error) {
    console.error('Error extracting text from PDF:', error)
    throw error
  }
}

export async function extractReferencesFromPDF(
  pdfPath: string,
  geminiApiKey?: string
): Promise<ReferenceExtractionResult> {
  try {
    const formData = new FormData()
    const fileStream = fs.createReadStream(pdfPath)
    formData.append('file', fileStream, path.basename(pdfPath))

    const headers: Record<string, string> = {
      ...formData.getHeaders(),
    }

    // Add Gemini API key header if provided
    if (geminiApiKey) {
      headers['X-Gemini-API-Key'] = geminiApiKey
    }

    const response = await axios.post(`${PDF_SERVICE_URL}/extract-references`, formData, {
      headers,
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    })

    return response.data
  } catch (error) {
    console.error('Error extracting references from PDF:', error)
    throw error
  }
}

export async function extractFiguresFromPDF(pdfPath: string): Promise<FigureExtractionResult> {
  try {
    const formData = new FormData()
    const fileStream = fs.createReadStream(pdfPath)
    formData.append('file', fileStream, path.basename(pdfPath))

    const response = await axios.post(`${PDF_SERVICE_URL}/extract-figures`, formData, {
      headers: {
        ...formData.getHeaders(),
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    })

    return response.data
  } catch (error) {
    console.error('Error extracting figures from PDF:', error)
    throw error
  }
}

export async function validateContent(
  text: string,
  references: any[]
): Promise<any> {
  try {
    const response = await axios.post(`${PDF_SERVICE_URL}/validate-content`, {
      text,
      references
    })
    return response.data
  } catch (error) {
    console.error('Error validating content:', error)
    throw error
  }
}


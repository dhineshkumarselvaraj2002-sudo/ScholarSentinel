'use client'

import { Button } from '@/src/components/ui/button'
import { useState } from 'react'
import axios from 'axios'
import { useToast } from '@/src/hooks/use-toast'

interface FileUploadProps {
  onUploadComplete?: () => void
}

export function FileUpload({ onUploadComplete }: FileUploadProps) {
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [uploadedCount, setUploadedCount] = useState(0)
  const [totalCount, setTotalCount] = useState(0)
  const { toast } = useToast()

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files || files.length === 0) return

    const fileArray = Array.from(files)
    setUploading(true)
    setProgress(0)
    setTotalCount(fileArray.length)
    setUploadedCount(0)

    try {
      const formData = new FormData()
      
      // Append all files
      fileArray.forEach((file) => {
        formData.append('files[]', file)
      })

      const response = await axios.post('/api/papers/upload', formData, {
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const percentCompleted = Math.round(
              (progressEvent.loaded * 100) / progressEvent.total
            )
            setProgress(percentCompleted)
          }
        },
      })

      if (onUploadComplete) {
        onUploadComplete()
      }
      
      // Show success message
      if (response.data.success) {
        const { total, successful, failed, papers, errors } = response.data
        
        setUploadedCount(successful)
        
        let description = ''
        if (total === 1) {
          // Single file upload
          const paper = papers?.[0]
          description = 'Your PDF has been uploaded and processed.'
          
          // Check for OpenAlex validation if available
          if (paper?.metadata?.openAlexValidation) {
            const openAlexValidation = paper.metadata.openAlexValidation
            if (openAlexValidation.found && openAlexValidation.matchScore >= 0.7) {
              description = `Paper validated with OpenAlex (match score: ${(openAlexValidation.matchScore * 100).toFixed(0)}%)`
            } else if (openAlexValidation.found) {
              description = `Paper found in OpenAlex but with some differences (match score: ${(openAlexValidation.matchScore * 100).toFixed(0)}%)`
            } else {
              description = 'Paper uploaded but not found in OpenAlex database. Please review manually.'
            }
          }
        } else {
          // Multiple files upload
          description = `Successfully uploaded ${successful} out of ${total} PDF(s).`
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
      }
    } catch (error: any) {
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
      // Reset input
      if (event.target) {
        event.target.value = ''
      }
    }
  }

  return (
    <div className="space-y-2">
      <input
        type="file"
        accept=".pdf"
        multiple
        onChange={handleFileUpload}
        disabled={uploading}
        className="hidden"
        id="file-upload"
      />
      <label htmlFor="file-upload">
        <Button asChild variant="outline" disabled={uploading}>
          <span>
            {uploading 
              ? totalCount > 1
                ? `Uploading ${uploadedCount}/${totalCount}... ${progress}%`
                : `Uploading... ${progress}%`
              : 'Upload PDF(s)'
            }
          </span>
        </Button>
      </label>
      {totalCount > 1 && (
        <p className="text-xs text-muted-foreground">
          {uploading 
            ? `Processing ${uploadedCount} of ${totalCount} files...`
            : `Select multiple PDF files to upload`
          }
        </p>
      )}
    </div>
  )
}


'use client'

import { useQuery } from '@tanstack/react-query'
import { useParams } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/src/components/ui/card'
import { StatusBadge } from '@/src/components/StatusBadge'
import { ReferenceTable } from '@/src/components/ReferenceTable'
import { DiagramGrid } from '@/src/components/DiagramGrid'
import { Button } from '@/src/components/ui/button'
import { Badge } from '@/src/components/ui/badge'
import axios from 'axios'
import { formatDate } from '@/src/lib/utils'
import { useState } from 'react'
import { useToast } from '@/src/hooks/use-toast'
import { Pencil, Trash2, CheckCircle2 } from 'lucide-react'
import { Input } from '@/src/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/src/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/src/components/ui/alert-dialog'
import { useRouter } from 'next/navigation'

export default function PaperDetailPage() {
  const params = useParams()
  const router = useRouter()
  const paperId = params.id as string
  const [validating, setValidating] = useState(false)
  const [editingTitle, setEditingTitle] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const { toast } = useToast()

  const { data: paper, isLoading, refetch } = useQuery({
    queryKey: ['paper', paperId],
    queryFn: async () => {
      const response = await axios.get(`/api/papers/${paperId}`)
      return response.data
    },
  })

  const handleValidate = async () => {
    setValidating(true)
    try {
      const response = await axios.post(`/api/papers/${paperId}/validate`)
      refetch()
      
      const validationData = response.data
      const status = validationData.paper?.status || paper?.status
      
      if (status === 'VALIDATED') {
        toast({
          title: 'Validation Successful',
          description: 'Paper has been validated successfully.',
          variant: 'default',
        })
      } else if (status === 'REJECTED') {
        toast({
          title: 'Validation Failed',
          description: validationData.paper?.validationNotes || 'Paper was rejected during validation.',
          variant: 'destructive',
        })
      } else {
        toast({
          title: 'Validation Completed',
          description: validationData.paper?.validationNotes || 'Paper validation completed. Review required.',
          variant: 'default',
        })
      }
    } catch (error: any) {
      toast({
        title: 'Validation Failed',
        description: error.response?.data?.error || error.message || 'An error occurred during validation.',
        variant: 'destructive',
      })
    } finally {
      setValidating(false)
    }
  }

  const handleValidateReferences = async () => {
    setValidating(true)
    try {
      const response = await axios.post(`/api/papers/${paperId}/references/validate`)
      refetch()
      
      const result = response.data
      const validCount = result.validCount || 0
      const invalidCount = result.invalidCount || 0
      const missingCount = result.missingCount || 0
      
      toast({
        title: 'Reference Validation Completed',
        description: `Found ${validCount} valid, ${invalidCount} invalid, and ${missingCount} missing references.`,
        variant: 'default',
      })
    } catch (error: any) {
      toast({
        title: 'Reference Validation Failed',
        description: error.response?.data?.error || error.message || 'An error occurred during reference validation.',
        variant: 'destructive',
      })
    } finally {
      setValidating(false)
    }
  }

  const handleValidateDiagrams = async () => {
    setValidating(true)
    try {
      const response = await axios.post(`/api/papers/${paperId}/diagrams/validate`)
      refetch()
      
      const result = response.data
      const count = result.count || 0
      
      toast({
        title: 'Diagram Validation Completed',
        description: `Extracted ${count} diagram(s) from the PDF.`,
        variant: 'default',
      })
    } catch (error: any) {
      toast({
        title: 'Diagram Validation Failed',
        description: error.response?.data?.error || error.message || 'An error occurred during diagram validation.',
        variant: 'destructive',
      })
    } finally {
      setValidating(false)
    }
  }

  const handleUpdateTitle = async () => {
    if (!newTitle.trim()) {
      toast({
        title: 'Error',
        description: 'Title cannot be empty',
        variant: 'destructive',
      })
      return
    }

    try {
      await axios.patch(`/api/papers/${paperId}`, { title: newTitle.trim() })
      refetch()
      setIsDialogOpen(false)
      setNewTitle('')
      toast({
        title: 'Success',
        description: 'Paper title updated successfully',
      })
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.response?.data?.error || error.message || 'Failed to update title',
        variant: 'destructive',
      })
    }
  }

  const handleExtractTitleFromPDF = async () => {
    try {
      const response = await axios.post(`/api/papers/${paperId}/extract-title`)
      if (response.data.title) {
        setNewTitle(response.data.title)
        toast({
          title: 'Title Extracted',
          description: 'Title extracted from PDF second page',
        })
      } else {
        toast({
          title: 'No Title Found',
          description: 'Could not extract title from PDF second page',
          variant: 'default',
        })
      }
    } catch (error: any) {
      toast({
        title: 'Extraction Failed',
        description: error.response?.data?.error || error.message || 'Failed to extract title from PDF',
        variant: 'destructive',
      })
    }
  }

  const handleDeletePaper = async () => {
    setDeleting(true)
    try {
      await axios.delete(`/api/papers/${paperId}`)
      toast({
        title: 'Paper Deleted',
        description: 'Paper has been deleted successfully',
      })
      // Redirect to papers list
      router.push('/papers')
    } catch (error: any) {
      toast({
        title: 'Delete Failed',
        description: error.response?.data?.error || error.message || 'Failed to delete paper',
        variant: 'destructive',
      })
      setDeleting(false)
    }
  }

  if (isLoading) {
    return <div className="container mx-auto py-8">Loading paper details...</div>
  }

  if (!paper) {
    return <div className="container mx-auto py-8">Paper not found</div>
  }

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <h1 className="text-3xl font-bold">{paper.title}</h1>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => {
                    setNewTitle(paper.title)
                    setIsDialogOpen(true)
                  }}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Edit Paper Title</DialogTitle>
                  <DialogDescription>
                    Update the paper title. You can extract it from the PDF second page or enter it manually.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Title</label>
                    <Input
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      placeholder="Enter paper title"
                    />
                  </div>
                  {paper.pdfPath && (
                    <Button
                      variant="outline"
                      onClick={handleExtractTitleFromPDF}
                      className="w-full"
                    >
                      Extract from PDF (Second Page)
                    </Button>
                  )}
                  <div className="flex gap-2 justify-end">
                    <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleUpdateTitle}>
                      Save
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={paper.status} />
            {paper.doi && (
              <Badge variant="outline" className="font-mono text-xs">
                {paper.doi}
              </Badge>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Button 
            onClick={handleValidateReferences} 
            disabled={validating}
            variant="outline"
          >
            <CheckCircle2 className="h-4 w-4 mr-2" />
            {validating ? 'Validating...' : 'Validate References'}
          </Button>
          <Button onClick={handleValidate} disabled={validating}>
            {validating ? 'Validating...' : 'Validate Paper'}
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" disabled={deleting}>
                <Trash2 className="h-4 w-4 mr-2" />
                {deleting ? 'Deleting...' : 'Delete Paper'}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone. This will permanently delete the paper
                  "{paper.title}" and all associated data including references, diagrams, and similarity reports.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDeletePaper}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Metadata */}
      <Card>
        <CardHeader>
          <CardTitle>Metadata</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div>
            <span className="font-medium">Authors: </span>
            <span>
              {paper.authors?.map((pa: any) => pa.author.name).join(', ') || 'N/A'}
            </span>
          </div>
          {paper.venue && (
            <div>
              <span className="font-medium">Venue: </span>
              <span>{paper.venue}</span>
            </div>
          )}
          {paper.year && (
            <div>
              <span className="font-medium">Year: </span>
              <span>{paper.year}</span>
            </div>
          )}
          {paper.volume && (
            <div>
              <span className="font-medium">Volume: </span>
              <span>{paper.volume}</span>
            </div>
          )}
          {paper.pages && (
            <div>
              <span className="font-medium">Pages: </span>
              <span>{paper.pages}</span>
            </div>
          )}
          {paper.citationCount > 0 && (
            <div>
              <span className="font-medium">Citations: </span>
              <span>{paper.citationCount}</span>
            </div>
          )}
          {paper.abstract && (
            <div className="mt-4">
              <span className="font-medium">Abstract: </span>
              <p className="text-sm text-muted-foreground mt-1">{paper.abstract}</p>
            </div>
          )}
          {paper.topics && paper.topics.length > 0 && (
            <div className="mt-4">
              <span className="font-medium">Topics: </span>
              <div className="flex gap-2 mt-1 flex-wrap">
                {paper.topics.map((topic: string, idx: number) => (
                  <Badge key={idx} variant="outline">
                    {topic}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          <div className="mt-4 text-xs text-muted-foreground">
            Created: {formatDate(paper.createdAt)} • Updated: {formatDate(paper.updatedAt)}
          </div>
        </CardContent>
      </Card>

      {/* Validation Notes */}
      {paper.validationNotes && (
        <Card>
          <CardHeader>
            <CardTitle>Validation Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{paper.validationNotes}</p>
          </CardContent>
        </Card>
      )}

      {/* References */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>References</CardTitle>
              <CardDescription>
                {paper._count?.references || 0} references found
              </CardDescription>
            </div>
            <Button onClick={handleValidateReferences} disabled={validating} variant="outline">
              Validate References
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {paper.references && paper.references.length > 0 ? (
            <ReferenceTable references={paper.references} paperId={paperId} />
          ) : (
            <div className="text-center py-4 text-muted-foreground">
              No references found. Click "Validate References" to extract them from the PDF.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Diagrams */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Diagrams</CardTitle>
              <CardDescription>
                {paper._count?.diagrams || 0} diagrams found
              </CardDescription>
            </div>
            <Button onClick={handleValidateDiagrams} disabled={validating} variant="outline">
              Validate Diagrams
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {paper.diagrams && paper.diagrams.length > 0 ? (
            <DiagramGrid diagrams={paper.diagrams} />
          ) : (
            <div className="text-center py-4 text-muted-foreground">
              No diagrams found. Click "Validate Diagrams" to extract them from the PDF.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Similarity Reports */}
      {paper.similarities && paper.similarities.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Similarity Reports</CardTitle>
            <CardDescription>Potential duplicates or similar papers</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {paper.similarities.map((sim: any) => (
                <div key={sim.id} className="p-3 border rounded">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">
                        {sim.paper?.title || 'Unknown Paper'}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Similarity: {(sim.similarityScore * 100).toFixed(1)}% • Type: {sim.similarityType}
                      </div>
                    </div>
                    {sim.paper && (
                      <a
                        href={`/papers/${sim.paper.id}`}
                        className="text-sm text-primary hover:underline"
                      >
                        View →
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}


'use client'

import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/src/components/ui/card'
import { FileUpload } from '@/src/components/FileUpload'
import { Badge } from '@/src/components/ui/badge'
import { CheckCircle2, XCircle, AlertCircle, FileText, TrendingUp, TrendingDown } from 'lucide-react'
import axios from 'axios'
import Link from 'next/link'

export default function DashboardPage() {
  const statsQuery = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      const papersRes = await axios.get('/api/papers?limit=1000')
      
      const papers = papersRes.data.papers || []
      
      // Separate valid and invalid papers based on validation analysis
      const validPapers = papers.filter((p: any) => {
        const validation = p.metadata?.validationAnalysis
        return validation?.overallStatus === 'VALID' || p.status === 'VALIDATED'
      })
      
      const invalidPapers = papers.filter((p: any) => {
        const validation = p.metadata?.validationAnalysis
        return validation?.overallStatus === 'INVALID' || 
               (validation && validation.overallStatus !== 'VALID' && p.status !== 'VALIDATED')
      })
      
      const stats = {
        total: papers.length,
        validated: papers.filter((p: any) => p.status === 'VALIDATED').length,
        pending: papers.filter((p: any) => p.status === 'PENDING').length,
        needsReview: papers.filter((p: any) => p.status === 'NEEDS_REVIEW').length,
        rejected: papers.filter((p: any) => p.status === 'REJECTED').length,
        validPapers,
        invalidPapers,
      }
      return stats
    },
  })

  const stats = statsQuery.data || {
    total: 0,
    validated: 0,
    pending: 0,
    needsReview: 0,
    rejected: 0,
    validPapers: [],
    invalidPapers: [],
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Dashboard</h1>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Papers</CardDescription>
            <CardTitle className="text-4xl">{stats.total}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Valid Papers</CardDescription>
            <CardTitle className="text-4xl text-green-600">{stats.validPapers?.length || 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Invalid Papers</CardDescription>
            <CardTitle className="text-4xl text-red-600">{stats.invalidPapers?.length || 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Needs Review</CardDescription>
            <CardTitle className="text-4xl text-orange-600">{stats.needsReview}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Valid Papers Section */}
      {stats.validPapers && stats.validPapers.length > 0 && (
        <Card className="border-green-200 bg-green-50/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              Valid Papers ({stats.validPapers.length})
            </CardTitle>
            <CardDescription>
              Papers that meet the 75% validation threshold for both reference check and content check
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {stats.validPapers.slice(0, 10).map((paper: any) => {
                const validation = paper.metadata?.validationAnalysis as any as any
                const refValidation = validation?.referenceValidation
                const contentCheck = validation?.contentCheck
                
                return (
                  <div key={paper.id} className="border rounded-lg p-4 bg-white">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <Link href={`/reference-check/${paper.id}`}>
                          <h3 className="font-semibold text-lg hover:text-primary cursor-pointer">
                            {paper.title}
                          </h3>
                        </Link>
                        {paper.authors && paper.authors.length > 0 && (
                          <p className="text-sm text-muted-foreground mt-1">
                            {paper.authors.map((pa: any) => pa.author.name).join(', ')}
                          </p>
                        )}
                      </div>
                      <Badge variant="default" className="bg-green-600">
                        Valid
                      </Badge>
                    </div>
                    
                    {/* Always show statistics */}
                    <div className="mt-4 space-y-3">
                      <div className="grid grid-cols-2 gap-4">
                        <div className={`p-3 rounded-lg border ${
                          (refValidation?.percentage || 0) >= 75 
                            ? 'bg-green-50 border-green-200' 
                            : (refValidation?.percentage || 0) > 0
                            ? 'bg-red-50 border-red-200'
                            : 'bg-gray-50 border-gray-200'
                        }`}>
                          <div className="flex items-center gap-2 mb-1">
                            <FileText className={`h-4 w-4 ${
                              (refValidation?.percentage || 0) >= 75 ? 'text-green-600' : 
                              (refValidation?.percentage || 0) > 0 ? 'text-red-600' : 'text-gray-500'
                            }`} />
                            <span className="text-sm font-medium">Reference Valid</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {(refValidation?.percentage || 0) >= 75 ? (
                              <TrendingUp className="h-4 w-4 text-green-600" />
                            ) : (refValidation?.percentage || 0) > 0 ? (
                              <TrendingDown className="h-4 w-4 text-red-600" />
                            ) : (
                              <AlertCircle className="h-4 w-4 text-gray-500" />
                            )}
                            <span className={`text-xl font-bold ${
                              (refValidation?.percentage || 0) >= 75 ? 'text-green-700' : 
                              (refValidation?.percentage || 0) > 0 ? 'text-red-700' : 'text-gray-600'
                            }`}>
                              {refValidation?.percentage?.toFixed(1) || 0}%
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            {refValidation ? `${refValidation.valid || 0} / ${refValidation.total || 0} valid` : 'Not validated yet'}
                          </p>
                        </div>
                        
                        <div className={`p-3 rounded-lg border ${
                          (contentCheck?.percentage || 0) >= 75 
                            ? 'bg-green-50 border-green-200' 
                            : (contentCheck?.percentage || 0) > 0
                            ? 'bg-red-50 border-red-200'
                            : 'bg-gray-50 border-gray-200'
                        }`}>
                          <div className="flex items-center gap-2 mb-1">
                            <CheckCircle2 className={`h-4 w-4 ${
                              (contentCheck?.percentage || 0) >= 75 ? 'text-green-600' : 
                              (contentCheck?.percentage || 0) > 0 ? 'text-red-600' : 'text-gray-500'
                            }`} />
                            <span className="text-sm font-medium">Valid in Citation</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {(contentCheck?.percentage || 0) >= 75 ? (
                              <TrendingUp className="h-4 w-4 text-green-600" />
                            ) : (contentCheck?.percentage || 0) > 0 ? (
                              <TrendingDown className="h-4 w-4 text-red-600" />
                            ) : (
                              <AlertCircle className="h-4 w-4 text-gray-500" />
                            )}
                            <span className={`text-xl font-bold ${
                              (contentCheck?.percentage || 0) >= 75 ? 'text-green-700' : 
                              (contentCheck?.percentage || 0) > 0 ? 'text-red-700' : 'text-gray-600'
                            }`}>
                              {contentCheck?.percentage?.toFixed(1) || 0}%
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            {(contentCheck?.percentage || 0) > 0 ? 'References cited in text' : 'Not checked yet'}
                          </p>
                        </div>
                      </div>
                        
                      {validation?.reason && (
                        <div className="p-3 bg-green-100 rounded-lg border border-green-300">
                          <p className="text-sm text-green-800">
                            <strong>Analysis:</strong> {validation.reason}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
              {stats.validPapers.length > 10 && (
                <p className="text-sm text-muted-foreground text-center">
                  Showing 10 of {stats.validPapers.length} valid papers
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Invalid Papers Section */}
      {stats.invalidPapers && stats.invalidPapers.length > 0 && (
        <Card className="border-red-200 bg-red-50/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-red-600" />
              Invalid Papers ({stats.invalidPapers.length})
            </CardTitle>
            <CardDescription>
              Papers that do not meet the 75% validation threshold
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {stats.invalidPapers.slice(0, 10).map((paper: any) => {
                const validation = paper.metadata?.validationAnalysis as any
                const refValidation = validation?.referenceValidation
                const contentCheck = validation?.contentCheck
                
                return (
                  <div key={paper.id} className="border rounded-lg p-4 bg-white">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <Link href={`/reference-check/${paper.id}`}>
                          <h3 className="font-semibold text-lg hover:text-primary cursor-pointer">
                            {paper.title}
                          </h3>
                        </Link>
                        {paper.authors && paper.authors.length > 0 && (
                          <p className="text-sm text-muted-foreground mt-1">
                            {paper.authors.map((pa: any) => pa.author.name).join(', ')}
                          </p>
                        )}
                      </div>
                      <Badge variant="destructive">
                        Invalid
                      </Badge>
                    </div>
                    
                    {validation && (
                      <div className="mt-4 space-y-3">
                        <div className="grid grid-cols-2 gap-4">
                          <div className={`p-3 rounded-lg border ${
                            (refValidation?.percentage || 0) >= 75 
                              ? 'bg-green-50 border-green-200' 
                              : 'bg-red-50 border-red-200'
                          }`}>
                            <div className="flex items-center gap-2 mb-1">
                              <FileText className={`h-4 w-4 ${
                                (refValidation?.percentage || 0) >= 75 ? 'text-green-600' : 'text-red-600'
                              }`} />
                              <span className="text-sm font-medium">Reference Validation</span>
                            </div>
                            <div className="flex items-center gap-2">
                              {(refValidation?.percentage || 0) >= 75 ? (
                                <TrendingUp className="h-4 w-4 text-green-600" />
                              ) : (
                                <TrendingDown className="h-4 w-4 text-red-600" />
                              )}
                              <span className={`text-lg font-bold ${
                                (refValidation?.percentage || 0) >= 75 ? 'text-green-700' : 'text-red-700'
                              }`}>
                                {refValidation?.percentage?.toFixed(1) || 0}%
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                              {refValidation?.valid || 0} valid / {refValidation?.total || 0} total
                            </p>
                          </div>
                          
                          <div className={`p-3 rounded-lg border ${
                            (contentCheck?.percentage || 0) >= 75 
                              ? 'bg-green-50 border-green-200' 
                              : 'bg-red-50 border-red-200'
                          }`}>
                            <div className="flex items-center gap-2 mb-1">
                              <CheckCircle2 className={`h-4 w-4 ${
                                (contentCheck?.percentage || 0) >= 75 ? 'text-green-600' : 'text-red-600'
                              }`} />
                              <span className="text-sm font-medium">Content Check</span>
                            </div>
                            <div className="flex items-center gap-2">
                              {(contentCheck?.percentage || 0) >= 75 ? (
                                <TrendingUp className="h-4 w-4 text-green-600" />
                              ) : (
                                <TrendingDown className="h-4 w-4 text-red-600" />
                              )}
                              <span className={`text-lg font-bold ${
                                (contentCheck?.percentage || 0) >= 75 ? 'text-green-700' : 'text-red-700'
                              }`}>
                                {contentCheck?.percentage?.toFixed(1) || 0}%
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                              References cited in text
                            </p>
                          </div>
                        </div>
                        
                      {validation?.reason && (
                        <div className="p-3 bg-red-100 rounded-lg border border-red-300">
                          <p className="text-sm text-red-800">
                            <strong>Reason:</strong> {validation.reason}
                          </p>
                        </div>
                      )}
                      </div>
                    )}
                  </div>
                )
              })}
              {stats.invalidPapers.length > 10 && (
                <p className="text-sm text-muted-foreground text-center">
                  Showing 10 of {stats.invalidPapers.length} invalid papers
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Upload Section */}
      <Card>
        <CardHeader>
          <CardTitle>Upload PDF</CardTitle>
          <CardDescription>
            Upload a PDF to automatically run reference check, content check, and diagram extraction. All results will be stored in the database.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FileUpload onUploadComplete={() => statsQuery.refetch()} />
        </CardContent>
      </Card>
    </div>
  )
}


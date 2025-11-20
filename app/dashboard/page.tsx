'use client'

import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/src/components/ui/card'
import { PaperList } from '@/src/components/PaperList'
import { FileUpload } from '@/src/components/FileUpload'
import { Button } from '@/src/components/ui/button'
import axios from 'axios'
import { useState } from 'react'

export default function DashboardPage() {
  const [importSource, setImportSource] = useState<'openalex' | 'crossref' | 'semantic'>('openalex')
  const [importQuery, setImportQuery] = useState('')
  const [importing, setImporting] = useState(false)

  const statsQuery = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      const [papersRes, alertsRes] = await Promise.all([
        axios.get('/api/papers?limit=1000'),
        axios.get('/api/alerts?limit=100'),
      ])
      
      const papers = papersRes.data.papers || []
      const stats = {
        total: papers.length,
        validated: papers.filter((p: any) => p.status === 'VALIDATED').length,
        pending: papers.filter((p: any) => p.status === 'PENDING').length,
        needsReview: papers.filter((p: any) => p.status === 'NEEDS_REVIEW').length,
        rejected: papers.filter((p: any) => p.status === 'REJECTED').length,
        recentAlerts: alertsRes.data.alerts?.slice(0, 5) || [],
      }
      return stats
    },
  })

  const handleImport = async () => {
    if (!importQuery.trim()) {
      alert('Please enter a search query')
      return
    }

    setImporting(true)
    try {
      const response = await axios.post('/api/papers/import', {
        source: importSource,
        query: importQuery,
      })
      
      alert(`Imported ${response.data.imported} papers. ${response.data.skipped} skipped.`)
      setImportQuery('')
      statsQuery.refetch()
    } catch (error: any) {
      alert(`Import failed: ${error.response?.data?.error || error.message}`)
    } finally {
      setImporting(false)
    }
  }

  const stats = statsQuery.data || {
    total: 0,
    validated: 0,
    pending: 0,
    needsReview: 0,
    rejected: 0,
    recentAlerts: [],
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
            <CardDescription>Validated</CardDescription>
            <CardTitle className="text-4xl text-green-600">{stats.validated}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Pending</CardDescription>
            <CardTitle className="text-4xl text-yellow-600">{stats.pending}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Needs Review</CardDescription>
            <CardTitle className="text-4xl text-orange-600">{stats.needsReview}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Import Section */}
      <Card>
        <CardHeader>
          <CardTitle>Import Papers</CardTitle>
          <CardDescription>Fetch papers from external sources</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4">
            <select
              value={importSource}
              onChange={(e) => setImportSource(e.target.value as any)}
              className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="openalex">OpenAlex</option>
              <option value="crossref">CrossRef</option>
              <option value="semantic">Semantic Scholar</option>
            </select>
            <input
              type="text"
              placeholder="Search query (e.g., 'machine learning', 'DOI:10.1234/example')"
              value={importQuery}
              onChange={(e) => setImportQuery(e.target.value)}
              className="flex-1 h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            <Button onClick={handleImport} disabled={importing}>
              {importing ? 'Importing...' : 'Import'}
            </Button>
          </div>
          <FileUpload onUploadComplete={() => statsQuery.refetch()} />
        </CardContent>
      </Card>

      {/* Recent Alerts */}
      {stats.recentAlerts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recent Alerts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {stats.recentAlerts.map((alert: any) => (
                <div key={alert.id} className="flex items-start justify-between p-2 border rounded">
                  <div>
                    <div className="font-medium">{alert.title}</div>
                    <div className="text-sm text-muted-foreground">{alert.message}</div>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Date(alert.createdAt).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Papers List */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Papers</CardTitle>
          <CardDescription>Latest papers in the system</CardDescription>
        </CardHeader>
        <CardContent>
          <PaperList />
        </CardContent>
      </Card>
    </div>
  )
}


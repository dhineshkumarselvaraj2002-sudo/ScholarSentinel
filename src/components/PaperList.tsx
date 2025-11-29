'use client'

import { useQuery } from '@tanstack/react-query'
import { PaperCard } from '@/src/components/PaperCard'
import { Input } from '@/src/components/ui/input'
import { Button } from '@/src/components/ui/button'
import { useState } from 'react'
import axios from 'axios'

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

export function PaperList() {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('')

  const { data, isLoading, error } = useQuery({
    queryKey: ['papers', search, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (search) params.append('search', search)
      if (statusFilter) params.append('status', statusFilter)
      const response = await axios.get(`/api/papers?${params.toString()}`)
      return response.data
    },
  })

  if (isLoading) {
    return <div className="text-center py-8">Loading papers...</div>
  }

  if (error) {
    return <div className="text-center py-8 text-destructive">Error loading papers</div>
  }

  const papers = data?.papers || []

  return (
    <div className="space-y-4">
      <div className="flex gap-4 items-center">
        <Input
          placeholder="Search papers..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="">All Status</option>
          <option value="PENDING">Pending</option>
          <option value="VALIDATED">Validated</option>
          <option value="REJECTED">Rejected</option>
          <option value="NEEDS_REVIEW">Needs Review</option>
        </select>
      </div>

      {papers.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          No papers found. Import papers to get started.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {papers.map((paper: Paper) => (
            <PaperCard key={paper.id} paper={paper as any} />
          ))}
        </div>
      )}
    </div>
  )
}


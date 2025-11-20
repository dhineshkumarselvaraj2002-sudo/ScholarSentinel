'use client'

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/src/components/ui/table'
import { Badge } from '@/src/components/ui/badge'
import { Button } from '@/src/components/ui/button'
import { ReferenceDetailsDialog } from '@/src/components/ReferenceDetailsDialog'
import { Eye } from 'lucide-react'

interface Reference {
  id: string
  order: number
  rawText: string
  normalizedTitle: string | null
  normalizedAuthors: string | null
  normalizedYear: number | null
  normalizedDoi: string | null
  status: 'PENDING' | 'VALID' | 'INVALID' | 'MISSING'
}

interface ReferenceTableProps {
  references: Reference[]
  paperId?: string
}

const statusColors: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  VALID: 'default',
  INVALID: 'destructive',
  MISSING: 'secondary',
  PENDING: 'outline',
}

export function ReferenceTable({ references, paperId }: ReferenceTableProps) {
  if (references.length === 0) {
    return <div className="text-center py-4 text-muted-foreground">No references found</div>
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-16">#</TableHead>
          <TableHead>Reference</TableHead>
          <TableHead>DOI</TableHead>
          <TableHead>Status</TableHead>
          {paperId && <TableHead className="w-24">Actions</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {references.map((ref) => (
          <TableRow key={ref.id}>
            <TableCell className="font-medium">{ref.order}</TableCell>
            <TableCell>
              <div className="max-w-2xl">
                <div className="text-sm">{ref.rawText.substring(0, 200)}...</div>
                {ref.normalizedTitle && (
                  <div className="text-xs text-muted-foreground mt-1">
                    Title: {ref.normalizedTitle}
                  </div>
                )}
                {ref.normalizedAuthors && (
                  <div className="text-xs text-muted-foreground">
                    Authors: {ref.normalizedAuthors}
                  </div>
                )}
              </div>
            </TableCell>
            <TableCell>
              {ref.normalizedDoi ? (
                <a
                  href={`https://doi.org/${ref.normalizedDoi}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline font-mono"
                >
                  {ref.normalizedDoi}
                </a>
              ) : (
                <span className="text-xs text-muted-foreground">—</span>
              )}
            </TableCell>
            <TableCell>
              <Badge variant={statusColors[ref.status] || 'outline'}>
                {ref.status}
              </Badge>
            </TableCell>
            {paperId && (
              <TableCell>
                <ReferenceDetailsDialog referenceId={ref.id} paperId={paperId}>
                  <Button variant="ghost" size="sm">
                    <Eye className="h-4 w-4" />
                  </Button>
                </ReferenceDetailsDialog>
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}


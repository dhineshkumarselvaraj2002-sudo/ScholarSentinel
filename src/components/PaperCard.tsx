import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/src/components/ui/card'
import { Badge } from '@/src/components/ui/badge'
import { StatusBadge } from '@/src/components/StatusBadge'
import { formatDate } from '@/src/lib/utils'
import Link from 'next/link'
import { Paper } from '@prisma/client'

interface PaperCardProps {
  paper: Paper & {
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
}

export function PaperCard({ paper }: PaperCardProps) {
  const authorNames = paper.authors.map(pa => pa.author.name).join(', ')
  
  return (
    <Card className="hover:shadow-lg transition-shadow">
      <CardHeader>
        <div className="flex items-start justify-between">
          <CardTitle className="text-lg line-clamp-2">{paper.title}</CardTitle>
          <StatusBadge status={paper.status} />
        </div>
        <CardDescription>
          {authorNames && <div className="mt-2">{authorNames}</div>}
          {paper.venue && <div className="mt-1 text-xs">{paper.venue}</div>}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {paper.abstract && (
          <p className="text-sm text-muted-foreground line-clamp-3">
            {paper.abstract}
          </p>
        )}
        <div className="flex gap-2 mt-4 flex-wrap">
          {paper.year && <Badge variant="outline">{paper.year}</Badge>}
          {paper.doi && (
            <Badge variant="outline" className="font-mono text-xs">
              DOI
            </Badge>
          )}
          {paper.citationCount > 0 && (
            <Badge variant="outline">📊 {paper.citationCount} citations</Badge>
          )}
        </div>
      </CardContent>
      <CardFooter className="flex justify-between items-center">
        <div className="text-xs text-muted-foreground">
          {paper._count.references} refs • {paper._count.diagrams} diagrams
        </div>
        <Link href={`/papers/${paper.id}`}>
          <span className="text-sm text-primary hover:underline">View Details →</span>
        </Link>
      </CardFooter>
    </Card>
  )
}


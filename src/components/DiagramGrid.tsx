'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/src/components/ui/card'
import { Badge } from '@/src/components/ui/badge'

interface Diagram {
  id: string
  order: number
  pageNumber: number
  imagePath: string
  caption: string | null
  isSuspicious: boolean
  similarityScore: number | null
  width: number | null
  height: number | null
}

interface DiagramGridProps {
  diagrams: Diagram[]
}

export function DiagramGrid({ diagrams }: DiagramGridProps) {
  if (diagrams.length === 0) {
    return <div className="text-center py-4 text-muted-foreground">No diagrams found</div>
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {diagrams.map((diagram) => (
        <Card key={diagram.id} className={diagram.isSuspicious ? 'border-destructive' : ''}>
          <CardHeader>
            <div className="flex items-start justify-between">
              <CardTitle className="text-sm">Figure {diagram.order}</CardTitle>
              {diagram.isSuspicious && (
                <Badge variant="destructive">⚠️ Suspicious</Badge>
              )}
            </div>
            <CardDescription>
              Page {diagram.pageNumber}
              {diagram.similarityScore && (
                <span className="ml-2">
                  Similarity: {(diagram.similarityScore * 100).toFixed(1)}%
                </span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="relative w-full aspect-video bg-muted rounded-md overflow-hidden">
              <img
                src={`/uploads/${diagram.imagePath}`}
                alt={diagram.caption || `Figure ${diagram.order}`}
                className="object-contain w-full h-full"
                onError={(e) => {
                  const target = e.target as HTMLImageElement
                  target.src = '/placeholder-image.png'
                }}
              />
            </div>
            {diagram.caption && (
              <p className="text-xs text-muted-foreground mt-2">{diagram.caption}</p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}


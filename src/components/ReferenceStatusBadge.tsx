import { Badge } from '@/src/components/ui/badge'
import { ReferenceStatus } from '@prisma/client'
import { cn } from '@/src/lib/utils'

interface ReferenceStatusBadgeProps {
  status: ReferenceStatus
}

const statusConfig: Record<ReferenceStatus, { label: string; className: string }> = {
  PENDING: { 
    label: 'Pending', 
    className: 'bg-gray-100 text-gray-800 border-gray-300' 
  },
  VALID: { 
    label: 'Valid', 
    className: 'bg-green-100 text-green-800 border-green-300' 
  },
  INVALID: { 
    label: 'Invalid', 
    className: 'bg-red-100 text-red-800 border-red-300' 
  },
  MISSING: { 
    label: 'Missing', 
    className: 'bg-orange-100 text-orange-800 border-orange-300' 
  },
}

export function ReferenceStatusBadge({ status }: ReferenceStatusBadgeProps) {
  const config = statusConfig[status]
  return (
    <Badge 
      variant="outline" 
      className={cn('border', config.className)}
    >
      {config.label}
    </Badge>
  )
}


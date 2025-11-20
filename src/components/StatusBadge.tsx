import { Badge } from '@/src/components/ui/badge'
import { PaperStatus } from '@prisma/client'

interface StatusBadgeProps {
  status: PaperStatus
}

const statusConfig: Record<PaperStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  PENDING: { label: 'Pending', variant: 'outline' },
  VALIDATED: { label: 'Validated', variant: 'default' },
  REJECTED: { label: 'Rejected', variant: 'destructive' },
  NEEDS_REVIEW: { label: 'Needs Review', variant: 'secondary' },
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const config = statusConfig[status]
  return <Badge variant={config.variant}>{config.label}</Badge>
}


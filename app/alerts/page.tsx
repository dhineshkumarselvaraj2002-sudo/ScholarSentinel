'use client'

import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/src/components/ui/card'
import { Badge } from '@/src/components/ui/badge'
import axios from 'axios'
import { formatDateTime } from '@/src/lib/utils'

export default function AlertsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['alerts'],
    queryFn: async () => {
      const response = await axios.get('/api/alerts')
      return response.data
    },
  })

  if (isLoading) {
    return <div>Loading alerts...</div>
  }

  const alerts = data?.alerts || []

  const severityColors: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    INFO: 'default',
    WARNING: 'secondary',
    ERROR: 'destructive',
    CRITICAL: 'destructive',
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Alerts</h1>
        <p className="text-muted-foreground">System notifications and alerts</p>
      </div>

      <div className="space-y-4">
        {alerts.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              No alerts found
            </CardContent>
          </Card>
        ) : (
          alerts.map((alert: any) => (
            <Card key={alert.id} className={alert.isRead ? 'opacity-60' : ''}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-lg">{alert.title}</CardTitle>
                    <CardDescription className="mt-2">{alert.message}</CardDescription>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <Badge variant={severityColors[alert.severity] || 'outline'}>
                      {alert.severity}
                    </Badge>
                    <Badge variant="outline">{alert.type}</Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>{formatDateTime(alert.createdAt)}</span>
                  {alert.paper && (
                    <a
                      href={`/papers/${alert.paper.id}`}
                      className="text-primary hover:underline"
                    >
                      View Paper →
                    </a>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  )
}


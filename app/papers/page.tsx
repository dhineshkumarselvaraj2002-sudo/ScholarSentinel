'use client'

import { PaperList } from '@/src/components/PaperList'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/src/components/ui/card'

export default function PapersPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Papers</h1>
      </div>
      <PaperList />
    </div>
  )
}


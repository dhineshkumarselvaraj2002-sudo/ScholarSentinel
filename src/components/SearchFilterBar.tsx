'use client'

import { Input } from '@/src/components/ui/input'
import { Button } from '@/src/components/ui/button'

interface SearchFilterBarProps {
  search: string
  onSearchChange: (value: string) => void
  onFilterChange?: (filters: any) => void
}

export function SearchFilterBar({ search, onSearchChange, onFilterChange }: SearchFilterBarProps) {
  return (
    <div className="flex gap-4 items-center">
      <Input
        placeholder="Search papers..."
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        className="max-w-sm"
      />
      <Button variant="outline" onClick={() => onSearchChange('')}>
        Clear
      </Button>
    </div>
  )
}


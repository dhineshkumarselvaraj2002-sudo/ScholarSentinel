/**
 * Diagram Forensics Queue
 * Simplified version without Redis - jobs execute directly
 */

// Job data types
export interface ExtractJobData {
  type: 'extract'
  pdfPath: string
  jobId: string
}

export interface HashJobData {
  type: 'hash'
  imagePath: string
  jobId: string
}

export interface CompareJobData {
  type: 'compare'
  imagePath: string
  referenceDir?: string
  jobId: string
}

export interface ReverseSearchJobData {
  type: 'reverse-search'
  imagePath: string
  engine: 'google' | 'bing' | 'both'
  jobId: string
}

export interface PlagiarismJobData {
  type: 'plagiarism'
  pdfPath: string
  jobId: string
}

export type DiagramJobData =
  | ExtractJobData
  | HashJobData
  | CompareJobData
  | ReverseSearchJobData
  | PlagiarismJobData

// In-memory job status store (for direct execution mode)
const jobStatusStore = new Map<string, {
  id: string
  name: string
  state: 'waiting' | 'active' | 'completed' | 'failed'
  progress: number
  data: any
  returnValue?: any
  failedReason?: string
  timestamp: number
  processedOn?: number
  finishedOn?: number
}>()

/**
 * Check if Redis is available (always returns false now)
 */
export const isRedisAvailable = () => false

/**
 * Add job (direct execution mode - no queue)
 */
export async function addJob(data: DiagramJobData) {
  // In direct execution mode, jobs are handled immediately by the caller
  // This function is kept for API compatibility but doesn't queue anything
  console.log('Job added (direct execution mode):', data.jobId)
  
  // Store initial job status
  jobStatusStore.set(data.jobId, {
    id: data.jobId,
    name: data.type,
    state: 'waiting',
    progress: 0,
    data,
    timestamp: Date.now(),
  })
  
  return { id: data.jobId, name: data.type }
}

/**
 * Get job status
 */
export async function getJobStatus(jobId: string) {
  const status = jobStatusStore.get(jobId)
  return status || null
}

/**
 * Update job status
 */
export function updateJobStatus(
  jobId: string,
  updates: Partial<{
    state: 'waiting' | 'active' | 'completed' | 'failed'
    progress: number
    returnValue: any
    failedReason: string
  }>
) {
  const current = jobStatusStore.get(jobId)
  if (current) {
    jobStatusStore.set(jobId, {
      ...current,
      ...updates,
      processedOn: updates.state === 'active' ? Date.now() : current.processedOn,
      finishedOn: (updates.state === 'completed' || updates.state === 'failed') ? Date.now() : current.finishedOn,
    })
  }
}

/**
 * Get all jobs for a jobId pattern
 */
export async function getJobsByPattern(pattern: string) {
  const jobs: any[] = []
  for (const [jobId, status] of jobStatusStore.entries()) {
    if (jobId.includes(pattern)) {
      jobs.push(status)
    }
  }
  return jobs
}

/**
 * Clean up queue (no-op in direct execution mode)
 */
export async function cleanQueue() {
  // Clean up old completed/failed jobs (older than 24 hours)
  const now = Date.now()
  const maxAge = 24 * 60 * 60 * 1000 // 24 hours
  
  for (const [jobId, status] of jobStatusStore.entries()) {
    if (
      (status.state === 'completed' || status.state === 'failed') &&
      status.finishedOn &&
      (now - status.finishedOn) > maxAge
    ) {
      jobStatusStore.delete(jobId)
    }
  }
}

// No queue instance in direct execution mode
export const diagramQueue = null

export default diagramQueue

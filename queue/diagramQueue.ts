/**
 * Diagram Forensics Queue
 * Uses BullMQ with Redis for background job processing
 */

import { Queue, QueueOptions, Job } from 'bullmq'
import Redis from 'ioredis'

// Redis connection with error handling
let connection: Redis | null = null
let redisAvailable = false

try {
  connection = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    maxRetriesPerRequest: null,
    retryStrategy: (times) => {
      // Stop retrying after 3 attempts
      if (times > 3) {
        console.warn('Redis connection failed after 3 attempts. Running in fallback mode (no queue).')
        redisAvailable = false
        return null
      }
      return Math.min(times * 200, 2000)
    },
    lazyConnect: true, // Don't connect immediately
  })

  // Handle connection events
  connection.on('connect', () => {
    console.log('✅ Redis connected successfully')
    redisAvailable = true
  })

  connection.on('error', (err) => {
    console.warn('⚠️ Redis connection error:', err.message)
    redisAvailable = false
  })

  connection.on('close', () => {
    console.warn('⚠️ Redis connection closed')
    redisAvailable = false
  })

  // Try to connect
  connection.connect().catch((err) => {
    console.warn('⚠️ Redis not available. Running in fallback mode (direct execution).')
    console.warn('   To use background jobs, start Redis: redis-server')
    redisAvailable = false
  })
} catch (error: any) {
  console.warn('⚠️ Redis initialization failed:', error.message)
  console.warn('   Running in fallback mode (direct execution)')
  redisAvailable = false
}

// Queue options
const queueOptions: QueueOptions | null = connection
  ? {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: {
          age: 3600, // Keep completed jobs for 1 hour
          count: 100, // Keep last 100 jobs
        },
        removeOnFail: {
          age: 86400, // Keep failed jobs for 24 hours
        },
      },
    }
  : null

// Create queue instance (only if Redis is available)
export const diagramQueue = connection && queueOptions
  ? new Queue('diagram-forensics', queueOptions)
  : null

// Export Redis availability status
export const isRedisAvailable = () => redisAvailable

/**
 * Job data types
 */
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

/**
 * Add job to queue (or execute directly if Redis unavailable)
 */
export async function addJob(data: DiagramJobData) {
  if (!diagramQueue || !redisAvailable) {
    throw new Error('Redis not available. Jobs must be processed directly.')
  }
  
  try {
    return await diagramQueue.add(data.type, data, {
      jobId: data.jobId,
    })
  } catch (error: any) {
    console.error('Error adding job to queue:', error)
    throw new Error('Failed to add job to queue. Redis may not be running.')
  }
}

/**
 * Get job status
 */
export async function getJobStatus(jobId: string) {
  if (!diagramQueue || !redisAvailable) {
    return null
  }

  try {
    const job = await diagramQueue.getJob(jobId)
    if (!job) {
      return null
    }

    const state = await job.getState()
    const progress = job.progress
    const returnValue = job.returnvalue
    const failedReason = job.failedReason

    return {
      id: job.id,
      name: job.name,
      state,
      progress,
      data: job.data,
      returnValue,
      failedReason,
      timestamp: job.timestamp,
      processedOn: job.processedOn,
      finishedOn: job.finishedOn,
    }
  } catch (error: any) {
    console.error('Error getting job status:', error)
    return null
  }
}

/**
 * Get all jobs for a jobId pattern
 */
export async function getJobsByPattern(pattern: string) {
  if (!diagramQueue || !redisAvailable) {
    return []
  }

  try {
    const jobs = await diagramQueue.getJobs(['waiting', 'active', 'completed', 'failed'])
    return jobs.filter((job: Job) => job.id?.toString().includes(pattern))
  } catch (error: any) {
    console.error('Error getting jobs by pattern:', error)
    return []
  }
}

/**
 * Clean up queue
 */
export async function cleanQueue() {
  if (!diagramQueue || !redisAvailable) {
    return
  }

  try {
    await diagramQueue.clean(0, 100, 'completed')
    await diagramQueue.clean(0, 100, 'failed')
  } catch (error: any) {
    console.error('Error cleaning queue:', error)
  }
}

export default diagramQueue


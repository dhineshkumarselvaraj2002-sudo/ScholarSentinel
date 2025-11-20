/**
 * Diagram Forensics Worker
 * Processes background jobs for diagram extraction, hashing, comparison, and reverse search
 */

import { Worker, Job } from 'bullmq'
import Redis from 'ioredis'
import { spawn } from 'child_process'
import path from 'path'
import { writeFile, mkdir } from 'fs/promises'
import {
  DiagramJobData,
  ExtractJobData,
  HashJobData,
  CompareJobData,
  ReverseSearchJobData,
  PlagiarismJobData,
} from '../queue/diagramQueue'

// Redis connection
const connection = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  maxRetriesPerRequest: null,
})

// Worker options
const workerOptions = {
  connection,
  concurrency: 2, // Process 2 jobs concurrently
  limiter: {
    max: 10, // Max 10 jobs per duration
    duration: 10000, // Per 10 seconds
  },
}

/**
 * Run Python script and return result
 */
async function runPythonScript(
  scriptName: string,
  args: string[],
  job: Job
): Promise<any> {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(process.cwd(), 'scripts', scriptName)
    const fs = require('fs')

    if (!fs.existsSync(scriptPath)) {
      reject(new Error(`Python script not found: ${scriptPath}`))
      return
    }

    const pythonProcess = spawn('python', [scriptPath, ...args], {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''

    pythonProcess.stdout.on('data', (data) => {
      stdout += data.toString()
      // Update job progress
      job.updateProgress(50)
    })

    pythonProcess.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    pythonProcess.on('close', (code) => {
      if (code !== 0) {
        reject(
          new Error(
            `Python script exited with code ${code}. Error: ${stderr || stdout}`
          )
        )
        return
      }

      try {
        // Try to parse as JSON, fallback to string
        let result
        try {
          result = JSON.parse(stdout.trim())
        } catch {
          result = { output: stdout.trim() }
        }
        resolve(result)
      } catch (parseError: any) {
        reject(
          new Error(
            `Failed to parse output: ${parseError.message}. Output: ${stdout}`
          )
        )
      }
    })

    pythonProcess.on('error', (error) => {
      reject(new Error(`Failed to spawn Python process: ${error.message}`))
    })
  })
}

/**
 * Process extraction job
 */
async function processExtractJob(job: Job<ExtractJobData>) {
  const { pdfPath, jobId } = job.data

  await job.updateProgress(10)

  // Run extraction script
  const result = await runPythonScript('pdf_extractor.py', [pdfPath], job)

  await job.updateProgress(90)

  // Save result
  const resultsDir = path.join(process.cwd(), 'data', 'results')
  await mkdir(resultsDir, { recursive: true })
  const resultPath = path.join(resultsDir, `${jobId}.json`)

  await writeFile(
    resultPath,
    JSON.stringify(
      {
        jobId,
        type: 'extract',
        result,
        timestamp: new Date().toISOString(),
      },
      null,
      2
    )
  )

  await job.updateProgress(100)

  return {
    success: true,
    extractedPaths: result,
    resultPath,
  }
}

/**
 * Process hashing job
 */
async function processHashJob(job: Job<HashJobData>) {
  const { imagePath, jobId } = job.data

  await job.updateProgress(10)

  const result = await runPythonScript('image_hashing.py', [imagePath], job)

  await job.updateProgress(90)

  // Save result
  const resultsDir = path.join(process.cwd(), 'data', 'results')
  await mkdir(resultsDir, { recursive: true })
  const resultPath = path.join(resultsDir, `${jobId}.json`)

  await writeFile(
    resultPath,
    JSON.stringify(
      {
        jobId,
        type: 'hash',
        result,
        timestamp: new Date().toISOString(),
      },
      null,
      2
    )
  )

  await job.updateProgress(100)

  return {
    success: true,
    hashes: result,
    resultPath,
  }
}

/**
 * Process comparison job
 */
async function processCompareJob(job: Job<CompareJobData>) {
  const { imagePath, referenceDir, jobId } = job.data

  await job.updateProgress(10)

  const args = [imagePath]
  if (referenceDir) {
    args.push('--reference-dir', referenceDir)
  }

  const result = await runPythonScript('opencv_compare.py', args, job)

  await job.updateProgress(90)

  // Save result
  const resultsDir = path.join(process.cwd(), 'data', 'results')
  await mkdir(resultsDir, { recursive: true })
  const resultPath = path.join(resultsDir, `${jobId}.json`)

  await writeFile(
    resultPath,
    JSON.stringify(
      {
        jobId,
        type: 'compare',
        result,
        timestamp: new Date().toISOString(),
      },
      null,
      2
    )
  )

  await job.updateProgress(100)

  return {
    success: true,
    comparison: result,
    resultPath,
  }
}

/**
 * Process reverse search job
 */
async function processReverseSearchJob(job: Job<ReverseSearchJobData>) {
  const { imagePath, engine, jobId } = job.data

  await job.updateProgress(10)

  const result = await runPythonScript(
    'auto_reverse_search.py',
    [imagePath, '--engine', engine, '--headless'],
    job
  )

  await job.updateProgress(90)

  // Save result
  const resultsDir = path.join(process.cwd(), 'data', 'results')
  await mkdir(resultsDir, { recursive: true })
  const resultPath = path.join(resultsDir, `${jobId}.json`)

  await writeFile(
    resultPath,
    JSON.stringify(
      {
        jobId,
        type: 'reverse-search',
        result,
        timestamp: new Date().toISOString(),
      },
      null,
      2
    )
  )

  await job.updateProgress(100)

  return {
    success: true,
    searchResults: result,
    resultPath,
  }
}

/**
 * Process plagiarism detection job
 */
async function processPlagiarismJob(job: Job<PlagiarismJobData>) {
  const { pdfPath, jobId } = job.data

  await job.updateProgress(10)

  const result = await runPythonScript(
    'plagiarism_engine.py',
    [pdfPath, '--job-id', jobId],
    job
  )

  await job.updateProgress(90)

  // Save result
  const resultsDir = path.join(process.cwd(), 'data', 'results')
  await mkdir(resultsDir, { recursive: true })
  const resultPath = path.join(resultsDir, `${jobId}.json`)

  await writeFile(
    resultPath,
    JSON.stringify(
      {
        jobId,
        type: 'plagiarism',
        result,
        timestamp: new Date().toISOString(),
      },
      null,
      2
    )
  )

  await job.updateProgress(100)

  return {
    success: true,
    plagiarismReport: result,
    resultPath,
  }
}

/**
 * Main worker processor
 */
async function processJob(job: Job<DiagramJobData>) {
  const { type } = job.data

  console.log(`Processing job ${job.id}: ${type}`)

  try {
    let result

    switch (type) {
      case 'extract':
        result = await processExtractJob(job as Job<ExtractJobData>)
        break
      case 'hash':
        result = await processHashJob(job as Job<HashJobData>)
        break
      case 'compare':
        result = await processCompareJob(job as Job<CompareJobData>)
        break
      case 'reverse-search':
        result = await processReverseSearchJob(job as Job<ReverseSearchJobData>)
        break
      case 'plagiarism':
        result = await processPlagiarismJob(job as Job<PlagiarismJobData>)
        break
      default:
        throw new Error(`Unknown job type: ${type}`)
    }

    return result
  } catch (error: any) {
    console.error(`Error processing job ${job.id}:`, error)
    throw error
  }
}

// Create worker
export const diagramWorker = new Worker('diagram-forensics', processJob, workerOptions)

// Event handlers
diagramWorker.on('completed', (job) => {
  console.log(`Job ${job.id} completed`)
})

diagramWorker.on('failed', (job, err) => {
  console.error(`Job ${job?.id} failed:`, err)
})

diagramWorker.on('error', (err) => {
  console.error('Worker error:', err)
})

console.log('Diagram Forensics Worker started')

export default diagramWorker


/**
 * Neon Database Helper
 * Provides direct SQL access using Neon serverless driver
 * Use this for Server Actions or when you need raw SQL queries
 */

import { neon } from '@neondatabase/serverless'

// Get the database connection string
// For Neon, use the pooled connection string (ends with ?sslmode=require)
const getDatabaseUrl = (): string => {
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error('DATABASE_URL environment variable is not set')
  }
  
  // Ensure SSL is enabled for Neon
  if (url.includes('@')) {
    // If URL doesn't have sslmode, add it
    if (!url.includes('sslmode=')) {
      return url.includes('?') ? `${url}&sslmode=require` : `${url}?sslmode=require`
    }
  }
  
  return url
}

/**
 * Get a Neon SQL client for direct queries
 * Use this in Server Actions for direct SQL access
 */
export function getNeonSQL() {
  return neon(getDatabaseUrl())
}

/**
 * Example Server Action using Neon
 * 
 * export async function createComment(formData: FormData) {
 *   'use server'
 *   const sql = getNeonSQL()
 *   const comment = formData.get('comment')
 *   await sql('INSERT INTO comments (comment) VALUES ($1)', [comment])
 * }
 */


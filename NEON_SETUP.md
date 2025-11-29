# Neon Database Setup Guide

## Quick Start

### 1. Create Neon Database

1. Go to [neon.tech](https://neon.tech) and sign up
2. Create a new project
3. Copy your connection string

### 2. Configure Connection Strings

Neon provides two types of connection strings:

#### Pooled Connection (Recommended for Production)
- Use for: Application queries, Server Actions
- Format: `postgresql://user:password@ep-xxx-pooler.region.aws.neon.tech/dbname?sslmode=require`
- Better for serverless environments (Vercel)
- Handles connection pooling automatically

#### Direct Connection (For Migrations)
- Use for: Prisma migrations, database tools
- Format: `postgresql://user:password@ep-xxx.region.aws.neon.tech/dbname?sslmode=require`
- Direct connection without pooling

### 3. Set Environment Variables

#### For Vercel:
In Vercel Dashboard → Settings → Environment Variables, add:
```env
DATABASE_URL=postgresql://neondb_owner:password@ep-xxx-pooler.region.aws.neon.tech/neondb?sslmode=require
DIRECT_URL=postgresql://neondb_owner:password@ep-xxx.region.aws.neon.tech/neondb?sslmode=require
```

#### For Local Development:
Create `.env.local` in the project root:
```env
# Pooled connection (for application queries)
DATABASE_URL=postgresql://neondb_owner:password@ep-xxx-pooler.region.aws.neon.tech/neondb?sslmode=require

# Unpooled connection (for migrations)
DIRECT_URL=postgresql://neondb_owner:password@ep-xxx.region.aws.neon.tech/neondb?sslmode=require
```

**Note**: Your `.env.local` file has been created with your Neon credentials. The file is gitignored and won't be committed.

### 4. Enable Required Extensions

In Neon SQL Editor, run:
```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

### 5. Run Migrations

```bash
# Generate Prisma Client
npm run db:generate

# Push schema to Neon
npm run db:push

# Or run migrations
npm run db:migrate
```

## Using Neon with Server Actions

The project includes a Neon helper (`src/lib/neon.ts`) for direct SQL queries:

```typescript
// app/api/example/route.ts
import { getNeonSQL } from '@/src/lib/neon'

export async function POST(request: Request) {
  'use server'
  
  const sql = getNeonSQL()
  const { data } = await request.json()
  
  // Direct SQL query
  await sql('INSERT INTO table (column) VALUES ($1)', [data.value])
  
  return Response.json({ success: true })
}
```

## Prisma + Neon

Prisma works seamlessly with Neon. The schema is configured to use:
- **Pooled connection** (`DATABASE_URL`) for application queries
- **Direct connection** (`DIRECT_URL`) for migrations (optional)

## Connection Pooling

Neon automatically handles connection pooling. For serverless environments:
- Use **pooled connection string** for better performance
- Neon manages connection limits automatically
- No need for additional connection pool configuration

## Troubleshooting

### Connection Timeout
- Ensure you're using the pooled connection string for production
- Check that SSL mode is set: `?sslmode=require`

### Migration Issues
- Use direct connection string for migrations
- Ensure `DIRECT_URL` is set if using separate connection

### pg_trgm Extension
- Run `CREATE EXTENSION IF NOT EXISTS pg_trgm;` in Neon SQL Editor
- Required for fuzzy text matching features

## Vercel Integration

1. In Vercel dashboard: **Storage → Create Database → Neon**
2. Vercel will automatically:
   - Create Neon project
   - Set `DATABASE_URL` environment variable
   - Configure connection pooling

3. Pull environment variables locally:
   ```bash
   vercel env pull .env.local
   ```

## Benefits of Neon

- ✅ Serverless-friendly (no connection limits)
- ✅ Automatic scaling
- ✅ Branching (create database branches for testing)
- ✅ Built-in connection pooling
- ✅ Free tier available
- ✅ Fast performance


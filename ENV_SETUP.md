# Environment Variables Setup

## Quick Setup for Neon Database

### 1. Create `.env.local` file

Create a `.env.local` file in the project root with your Neon connection strings:

```env
# Recommended for most uses (Pooled Connection)
DATABASE_URL=postgresql://neondb_owner:npg_ipt8flku3LXS@ep-lively-dream-a12mmavo-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require

# For uses requiring a connection without pgbouncer (Migrations)
DIRECT_URL=postgresql://neondb_owner:npg_ipt8flku3LXS@ep-lively-dream-a12mmavo.ap-southeast-1.aws.neon.tech/neondb?sslmode=require

# Alternative name (Neon provides this)
DATABASE_URL_UNPOOLED=postgresql://neondb_owner:npg_ipt8flku3LXS@ep-lively-dream-a12mmavo.ap-southeast-1.aws.neon.tech/neondb?sslmode=require

# PDF Processing Service
PDF_SERVICE_URL=http://localhost:8000

# API Keys (Optional)
GEMINI_API_KEY=
CROSSREF_API_KEY=
OPENALEX_API_KEY=
SEMANTIC_SCHOLAR_API_KEY=

# Alert Configuration (Optional)
SENDGRID_API_KEY=
SLACK_WEBHOOK_URL=
DISCORD_WEBHOOK_URL=

# Bing Visual Search (Optional)
BING_VISUAL_SEARCH_API_KEY=
BING_VISUAL_SEARCH_ENDPOINT=

# Node Environment
NODE_ENV=development

# Neon Auth (if using Neon Auth features)
NEXT_PUBLIC_STACK_PROJECT_ID=2f5beab9-1e23-4a68-80e0-5f888db550d6
NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY=pck_pfrymn2cw2s8bsq27hevkxb3mf4864vs7qeg5w621m6wg
STACK_SECRET_SERVER_KEY=ssk_mq5vamrm60k0k5gbewar82k473vzpex85wm9x2526tccr
```

### 2. Enable Required Extensions

Run this SQL in Neon SQL Editor:

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

### 3. Generate Prisma Client and Push Schema

```bash
# Generate Prisma Client
npm run db:generate

# Push schema to database
npm run db:push

# Or run migrations
npm run db:migrate
```

### 4. Verify Connection

```bash
npm run dev
```

## For Vercel Deployment

Add these environment variables in **Vercel Dashboard → Settings → Environment Variables**:

### Required:
- `DATABASE_URL` - Pooled connection string
- `DIRECT_URL` or `DATABASE_URL_UNPOOLED` - Unpooled connection for migrations
- `PDF_SERVICE_URL` - Your Python service URL

### Optional:
- `GEMINI_API_KEY`
- `CROSSREF_API_KEY`
- `OPENALEX_API_KEY`
- `SEMANTIC_SCHOLAR_API_KEY`
- `SENDGRID_API_KEY`
- `SLACK_WEBHOOK_URL`
- `DISCORD_WEBHOOK_URL`
- `BING_VISUAL_SEARCH_API_KEY`
- `BING_VISUAL_SEARCH_ENDPOINT`

### Neon Auth (if using):
- `NEXT_PUBLIC_STACK_PROJECT_ID`
- `NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY`
- `STACK_SECRET_SERVER_KEY`

## Connection String Types

### Pooled Connection (DATABASE_URL)
- **Use for**: Application queries, Server Actions, API routes
- **Format**: `postgresql://...@ep-xxx-pooler.region.aws.neon.tech/...`
- **Benefits**: Better for serverless, automatic connection pooling

### Unpooled Connection (DIRECT_URL / DATABASE_URL_UNPOOLED)
- **Use for**: Prisma migrations, database tools, direct connections
- **Format**: `postgresql://...@ep-xxx.region.aws.neon.tech/...`
- **Benefits**: Direct connection without pooling layer

## Notes

- `.env.local` is gitignored and won't be committed
- Never commit actual credentials to the repository
- Use Vercel's environment variables for production
- Pooled connections are recommended for Vercel/serverless deployments


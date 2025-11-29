# Vercel Deployment Guide

## Prerequisites

1. **Vercel Account**: Sign up at [vercel.com](https://vercel.com)
2. **Database**: Set up a PostgreSQL database (recommended: Vercel Postgres, Supabase, or Neon)
3. **Python Service**: Deploy the Python microservice separately (see below)

## Deployment Steps

### 1. Connect Repository to Vercel

1. Go to [vercel.com/new](https://vercel.com/new)
2. Import your GitHub/GitLab/Bitbucket repository
3. Vercel will auto-detect Next.js

### 2. Configure Environment Variables

In Vercel dashboard, go to **Settings → Environment Variables** and add:

#### Required Variables
```env
DATABASE_URL=postgresql://user:password@host:5432/database?schema=public
PDF_SERVICE_URL=https://your-python-service.vercel.app
NODE_ENV=production
```

#### Optional API Keys
```env
GEMINI_API_KEY=your_gemini_api_key
CROSSREF_API_KEY=your_crossref_api_key
OPENALEX_API_KEY=your_openalex_api_key
SEMANTIC_SCHOLAR_API_KEY=your_semantic_scholar_api_key
SENDGRID_API_KEY=your_sendgrid_api_key
SLACK_WEBHOOK_URL=your_slack_webhook_url
DISCORD_WEBHOOK_URL=your_discord_webhook_url
BING_VISUAL_SEARCH_API_KEY=your_bing_api_key
BING_VISUAL_SEARCH_ENDPOINT=your_bing_endpoint
```

### 3. Database Setup

#### Option A: Vercel Postgres (Recommended)
1. In Vercel dashboard, go to **Storage → Create Database → Postgres**
2. Copy the connection string to `DATABASE_URL`
3. Run migrations:
   ```bash
   npx prisma migrate deploy
   ```

#### Option B: External Database (Supabase, Neon, etc.)
1. Create database instance
2. Get connection string
3. Add to `DATABASE_URL` environment variable
4. Run migrations:
   ```bash
   npx prisma migrate deploy
   ```

### 4. Deploy Python Service

The Python service needs to be deployed separately. Options:

#### Option A: Deploy as Vercel Serverless Function
- Convert Python service to serverless functions
- Use Vercel's Python runtime

#### Option B: Deploy to Separate Service
- **Railway**: [railway.app](https://railway.app)
- **Render**: [render.com](https://render.com)
- **Fly.io**: [fly.io](https://fly.io)
- **Heroku**: [heroku.com](https://heroku.com)

Update `PDF_SERVICE_URL` to point to your deployed Python service.

### 5. File Storage

For production, use external storage instead of local `uploads/` directory:

#### Recommended: Vercel Blob Storage
1. In Vercel dashboard: **Storage → Create Database → Blob**
2. Update upload routes to use Vercel Blob

#### Alternative: AWS S3 / Cloudflare R2
- Configure S3/R2 credentials
- Update upload routes to use S3/R2

### 6. Build Settings

Vercel will auto-detect from `vercel.json`:
- **Framework**: Next.js
- **Build Command**: `npm run build`
- **Output Directory**: `.next`

### 7. Deploy

1. Push to your main branch
2. Vercel will automatically deploy
3. Or manually trigger from Vercel dashboard

## Post-Deployment

### 1. Run Database Migrations

```bash
# Using Vercel CLI
vercel env pull .env.local
npx prisma migrate deploy
```

### 2. Verify Deployment

- Check API routes: `https://your-app.vercel.app/api/papers`
- Test upload functionality
- Verify database connection

### 3. Set Up Custom Domain (Optional)

1. Go to **Settings → Domains**
2. Add your custom domain
3. Configure DNS as instructed

## Important Notes

### File Upload Limits
- Vercel has a 4.5MB limit for serverless functions
- For larger files, use:
  - Direct upload to external storage (S3, Blob)
  - Or increase function memory/timeout in `vercel.json`

### Python Service
- The Python service (`python-service/`) must be deployed separately
- Update `PDF_SERVICE_URL` environment variable
- Ensure CORS is configured to allow requests from your Vercel domain

### Database
- Use connection pooling for production
- Consider using Prisma Data Proxy for better performance
- Enable SSL for database connections

### Environment Variables
- Never commit `.env` files
- Use Vercel's environment variables UI
- Set different values for Production, Preview, and Development

## Troubleshooting

### Build Fails
- Check build logs in Vercel dashboard
- Ensure all dependencies are in `package.json`
- Verify Node.js version compatibility

### Database Connection Issues
- Verify `DATABASE_URL` format
- Check database allows connections from Vercel IPs
- Ensure SSL is enabled if required

### Python Service Not Responding
- Verify `PDF_SERVICE_URL` is correct
- Check Python service logs
- Ensure CORS allows your Vercel domain

### File Upload Errors
- Check file size limits
- Verify storage configuration
- Check function timeout settings

## Monitoring

- Use Vercel Analytics for performance monitoring
- Set up error tracking (Sentry, etc.)
- Monitor function execution times
- Track API usage and limits


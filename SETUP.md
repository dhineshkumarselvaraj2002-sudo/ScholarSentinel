# Scholar Sentinel - Quick Setup Guide

## Step-by-Step Setup

### 1. Database Setup

```bash
# Create PostgreSQL database
createdb scholar_sentinel

# Or using psql
psql -U postgres
CREATE DATABASE scholar_sentinel;
\q

# Enable pg_trgm extension
psql -U postgres -d scholar_sentinel
CREATE EXTENSION IF NOT EXISTS pg_trgm;
\q
```

### 2. Environment Configuration

```bash
# Copy example env file
cp .env.example .env

# Edit .env with your settings
# Minimum required:
DATABASE_URL="postgresql://user:password@localhost:5432/scholar_sentinel?schema=public"
PDF_SERVICE_URL="http://localhost:8000"
```

### 3. Install Dependencies

```bash
# Install Node.js dependencies
npm install

# Generate Prisma Client
npm run db:generate

# Push database schema
npm run db:push
```

### 4. Python Microservice Setup

```bash
cd python-service

# Create virtual environment
python -m venv venv

# Activate virtual environment
# On Windows:
venv\Scripts\activate
# On Linux/Mac:
source venv/bin/activate

# Install Python dependencies
pip install -r requirements.txt

# Run the service (in a separate terminal)
python main.py
# Or: uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### 5. Start the Application

```bash
# In the project root directory
npm run dev
```

Visit `http://localhost:3000`

### 6. (Optional) Set Up Cron Jobs

#### Using cron (Linux/Mac)

```bash
# Edit crontab
crontab -e

# Add these lines:
0 * * * * cd /path/to/ScholarSentinel && npm run cron:fetch
*/15 * * * * cd /path/to/ScholarSentinel && npm run cron:validate
0 2 * * * cd /path/to/ScholarSentinel && npm run cron:diagrams
0 9 * * * cd /path/to/ScholarSentinel && npm run cron:alerts
```

#### Using PM2

```bash
npm install -g pm2

pm2 start scripts/cron/fetch-papers.js --cron "0 * * * *" --name fetch-papers
pm2 start scripts/cron/validate-pending.js --cron "*/15 * * * *" --name validate-pending
pm2 start scripts/cron/rescan-diagrams.js --cron "0 2 * * *" --name rescan-diagrams
pm2 start scripts/cron/daily-alerts.js --cron "0 9 * * *" --name daily-alerts

pm2 save
pm2 startup
```

## Verification

1. **Check Python Service**: Visit `http://localhost:8000/health` - should return `{"status":"healthy"}`
2. **Check Next.js**: Visit `http://localhost:3000` - should show the dashboard
3. **Check Database**: Run `npm run db:studio` to open Prisma Studio

## Common Issues

### Python service not starting
- Check Python version: `python --version` (should be 3.9+)
- Verify all dependencies installed: `pip list`
- Check port 8000 is not in use

### Database connection errors
- Verify PostgreSQL is running: `pg_isready`
- Check DATABASE_URL format in .env
- Ensure database exists and user has permissions

### Prisma errors
- Run `npm run db:generate` after schema changes
- Run `npm run db:push` to sync schema
- Check DATABASE_URL is correct

## Next Steps

1. Configure API keys in `.env` for:
   - OpenAlex (optional)
   - CrossRef (optional, but recommended)
   - Semantic Scholar (optional)
   - SendGrid for email alerts (optional)
   - Slack/Discord webhooks (optional)

2. Import your first papers:
   - Go to Dashboard
   - Use "Import Papers" section
   - Or upload a PDF directly

3. Set up alerts:
   - Configure email/Slack/Discord in Settings
   - Test alert delivery


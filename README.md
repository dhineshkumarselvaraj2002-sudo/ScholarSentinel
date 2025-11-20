# Scholar Sentinel

A comprehensive research paper verification platform that automates the validation, reference checking, and diagram analysis of academic papers.

## Features

- **Paper Import**: Fetch papers from OpenAlex, CrossRef, and Semantic Scholar APIs
- **Metadata Validation**: Automated validation of paper metadata (title, authors, DOI, venue, etc.)
- **Reference Verification**: Extract and verify references using CrossRef and OpenAlex
- **Diagram Analysis**: Extract diagrams from PDFs and detect suspicious similarities using perceptual hashing
- **Duplicate Detection**: Fuzzy matching to detect duplicate or highly similar papers
- **Alerts System**: Email, Slack, and Discord notifications for important events
- **Dashboard**: Comprehensive dashboard with statistics and paper management
- **Automated Jobs**: Cron jobs for scheduled paper fetching, validation, and monitoring

## Tech Stack

- **Frontend**: Next.js 14+ (App Router), TypeScript, TailwindCSS, ShadCN UI, TanStack Query
- **Backend**: Next.js API Routes, Prisma ORM
- **Database**: PostgreSQL with pg_trgm extension for fuzzy matching
- **PDF Processing**: Python microservice with FastAPI, PyMuPDF, pdfminer.six, imagehash
- **APIs**: OpenAlex, CrossRef, Semantic Scholar

## Prerequisites

- Node.js 18+ and npm/yarn
- Python 3.9+
- PostgreSQL 12+
- (Optional) Redis for job queue

## Installation

### 1. Clone the repository

```bash
git clone <repository-url>
cd ScholarSentinel
```

### 2. Install Node.js dependencies

```bash
npm install
```

### 3. Set up PostgreSQL database

```bash
# Create database
createdb scholar_sentinel

# Or using psql
psql -U postgres
CREATE DATABASE scholar_sentinel;
```

### 4. Configure environment variables

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```env
DATABASE_URL="postgresql://user:password@localhost:5432/scholar_sentinel?schema=public"
PDF_SERVICE_URL="http://localhost:8000"

# Optional API keys
OPENALEX_API_KEY=""
CROSSREF_API_KEY=""
SEMANTIC_SCHOLAR_API_KEY=""

# Alert configuration
SENDGRID_API_KEY=""
SLACK_WEBHOOK_URL=""
DISCORD_WEBHOOK_URL=""
```

### 5. Set up Prisma

```bash
# Generate Prisma Client
npm run db:generate

# Push schema to database
npm run db:push

# Enable pg_trgm extension (run in PostgreSQL)
psql -U postgres -d scholar_sentinel
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

### 6. Set up Python microservice

```bash
cd python-service

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Run the service
python main.py
# Or with uvicorn:
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### 7. Run the Next.js application

```bash
# Development
npm run dev

# Production
npm run build
npm start
```

The application will be available at `http://localhost:3000`

## Project Structure

```
ScholarSentinel/
├── app/                    # Next.js App Router pages
│   ├── api/               # API routes
│   ├── dashboard/         # Dashboard page
│   ├── papers/            # Papers pages
│   ├── alerts/            # Alerts page
│   └── settings/          # Settings page
├── src/
│   ├── components/        # React components
│   │   ├── ui/           # ShadCN UI components
│   │   ├── PaperCard.tsx
│   │   ├── PaperList.tsx
│   │   ├── ReferenceTable.tsx
│   │   └── DiagramGrid.tsx
│   └── lib/              # Utilities and API clients
│       ├── api/          # External API integrations
│       ├── prisma.ts
│       ├── validation.ts
│       └── alerts.ts
├── prisma/
│   └── schema.prisma     # Database schema
├── python-service/        # PDF processing microservice
│   ├── main.py
│   └── requirements.txt
├── scripts/
│   └── cron/             # Cron job scripts
└── uploads/              # PDF and image storage
```

## Usage

### Importing Papers

1. Go to the Dashboard
2. Use the "Import Papers" section to search and import from:
   - OpenAlex
   - CrossRef
   - Semantic Scholar
3. Or upload a PDF directly

### Validating Papers

1. Navigate to a paper's detail page
2. Click "Validate Paper" to run full validation
3. The system will:
   - Validate metadata
   - Check for duplicates
   - Extract and verify references
   - Extract and analyze diagrams

### Setting Up Cron Jobs

Use a cron scheduler (like `cron` on Linux/Mac or Task Scheduler on Windows) to run:

```bash
# Fetch new papers every hour
0 * * * * cd /path/to/ScholarSentinel && npm run cron:fetch

# Validate pending papers every 15 minutes
*/15 * * * * cd /path/to/ScholarSentinel && npm run cron:validate

# Rescan diagrams nightly at 2 AM
0 2 * * * cd /path/to/ScholarSentinel && npm run cron:diagrams

# Send daily summary at 9 AM
0 9 * * * cd /path/to/ScholarSentinel && npm run cron:alerts
```

Or use a process manager like PM2:

```bash
pm2 start scripts/cron/fetch-papers.js --cron "0 * * * *" --name fetch-papers
pm2 start scripts/cron/validate-pending.js --cron "*/15 * * * *" --name validate-pending
pm2 start scripts/cron/rescan-diagrams.js --cron "0 2 * * *" --name rescan-diagrams
pm2 start scripts/cron/daily-alerts.js --cron "0 9 * * *" --name daily-alerts
```

## API Endpoints

### Papers

- `GET /api/papers` - List papers with filters
- `GET /api/papers/[id]` - Get paper details
- `POST /api/papers/import` - Import papers from external sources
- `POST /api/papers/[id]/validate` - Validate a paper
- `POST /api/papers/[id]/references/validate` - Validate references
- `POST /api/papers/[id]/diagrams/validate` - Validate diagrams

### Alerts

- `GET /api/alerts` - List alerts
- `POST /api/alerts/send` - Send an alert

## Database Schema

The Prisma schema includes:

- **User**: System users
- **Paper**: Research papers with metadata
- **Author**: Paper authors
- **Reference**: Extracted references from papers
- **Diagram**: Extracted figures/diagrams with perceptual hashes
- **SimilarityReport**: Duplicate detection results
- **Alert**: System alerts and notifications

## Development

### Running in Development Mode

```bash
# Terminal 1: Next.js dev server
npm run dev

# Terminal 2: Python microservice
cd python-service
source venv/bin/activate
python main.py

# Terminal 3: Prisma Studio (optional)
npm run db:studio
```

### Database Migrations

```bash
# Create a migration
npm run db:migrate

# Apply migrations
npm run db:push
```

## Configuration

### PDF Service

The Python microservice should be running on port 8000 by default. Configure the URL in `.env`:

```env
PDF_SERVICE_URL="http://localhost:8000"
```

### Storage

By default, PDFs and images are stored locally in the `uploads/` directory. For production, consider:

- Using S3-compatible storage
- Setting up proper file permissions
- Implementing cleanup jobs for old files

## Troubleshooting

### PDF Service Not Responding

- Ensure the Python service is running on port 8000
- Check that all Python dependencies are installed
- Verify `PDF_SERVICE_URL` in `.env`

### Database Connection Issues

- Verify PostgreSQL is running
- Check `DATABASE_URL` format
- Ensure database exists and user has permissions

### pg_trgm Extension

If fuzzy matching doesn't work:

```sql
-- Connect to your database
psql -U postgres -d scholar_sentinel

-- Enable extension
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

For issues and questions, please open an issue on GitHub.


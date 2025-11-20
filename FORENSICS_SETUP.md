# Diagram Forensics Engine - Complete Setup Guide

## Overview

This is a complete AI-powered Diagram Forensics Engine that detects diagram plagiarism in PDFs. The system runs **fully locally** with no paid APIs or cloud storage.

## Architecture

```
┌─────────────────┐
│  Next.js Frontend│
│  /app/forensics │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  API Routes     │
│  /api/forensics │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  BullMQ Queue   │
│  + Redis        │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Worker Process │
│  diagramWorker  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Python Scripts │
│  - pdf_extractor│
│  - image_hashing│
│  - opencv_compare│
│  - auto_reverse  │
│  - plagiarism    │
└─────────────────┘
```

## Prerequisites

### 1. Python 3.8+

```bash
python --version  # Should be 3.8 or higher
```

### 2. Node.js 18+

```bash
node --version  # Should be 18 or higher
```

### 3. Redis Server

**Windows:**
- Download from: https://github.com/microsoftarchive/redis/releases
- Or use WSL: `sudo apt-get install redis-server`
- Or use Docker: `docker run -d -p 6379:6379 redis:latest`

**macOS:**
```bash
brew install redis
brew services start redis
```

**Linux:**
```bash
sudo apt-get install redis-server
sudo systemctl start redis
```

### 4. Chrome Browser + ChromeDriver

**Install Chrome:**
- Download from: https://www.google.com/chrome/

**Install ChromeDriver:**

**Option A: Using WebDriver Manager (Recommended)**
```bash
pip install webdriver-manager
```

**Option B: Manual Installation**
1. Check Chrome version: `chrome://version/`
2. Download matching ChromeDriver from: https://chromedriver.chromium.org/
3. Extract and add to PATH

**Option C: Using Homebrew (macOS)**
```bash
brew install chromedriver
```

## Installation Steps

### Step 1: Install Python Dependencies

```bash
cd ScholarSentinel
pip install -r python-service/requirements.txt

# Additional dependencies for forensics
pip install opencv-python scikit-image selenium webdriver-manager
```

**Complete Python Requirements:**
```
pymupdf==1.23.8
pillow==10.1.0
imagehash==4.3.1
opencv-python==4.8.1.78
scikit-image==0.22.0
selenium==4.15.2
webdriver-manager==4.0.1
pdf2image==1.16.3  # Optional, for fallback extraction
```

### Step 2: Install Node.js Dependencies

```bash
npm install
```

This will install:
- `bullmq` - Queue management
- `ioredis` - Redis client
- `tsx` - TypeScript execution

### Step 3: Create Required Directories

```bash
mkdir -p public/diagrams/extracted
mkdir -p public/diagrams/reference
mkdir -p data/results
mkdir -p uploads
```

### Step 4: Start Redis Server

**Windows (if installed):**
```bash
redis-server
```

**macOS/Linux:**
```bash
redis-server
# Or if using systemd:
sudo systemctl start redis
```

**Verify Redis is running:**
```bash
redis-cli ping
# Should return: PONG
```

### Step 5: Start the Worker Process

In a **separate terminal**, start the background worker:

```bash
npm run worker
```

Or manually:
```bash
npx tsx workers/diagramWorker.ts
```

**Keep this running** - it processes jobs from the queue.

### Step 6: Start Next.js Development Server

In the **main terminal**:

```bash
npm run dev
```

The application will be available at: `http://localhost:3000`

## Usage

### 1. Access the Forensics Panel

Navigate to: `http://localhost:3000/forensics`

### 2. Upload a PDF

1. Click "Select PDF File"
2. Choose a PDF document
3. Wait for processing (progress bar will show status)

### 3. View Results

The system will:
- Extract all diagrams from the PDF
- Compute perceptual hashes
- Compare with reference diagrams (if available)
- Perform reverse image search
- Generate comprehensive plagiarism report

## Folder Structure

```
ScholarSentinel/
├── app/
│   ├── api/
│   │   ├── extract/
│   │   │   └── route.ts          # PDF extraction API
│   │   ├── hashing/
│   │   │   └── route.ts          # Hash computation API
│   │   ├── compare/
│   │   │   └── route.ts           # OpenCV comparison API
│   │   ├── reverse/
│   │   │   └── route.ts           # Reverse search API
│   │   └── forensics/
│   │       ├── scan/
│   │       │   └── route.ts       # Start plagiarism scan
│   │       ├── status/
│   │       │   └── route.ts       # Get job status
│   │       └── report/
│   │           └── route.ts       # Get final report
│   └── forensics/
│       └── page.tsx               # Frontend UI
├── scripts/
│   ├── pdf_extractor.py          # Module A: PDF extraction
│   ├── image_hashing.py           # Module B: Hash computation
│   ├── opencv_compare.py          # Module C: OpenCV comparison
│   ├── auto_reverse_search.py     # Module D: Selenium automation
│   └── plagiarism_engine.py       # Module F: Master pipeline
├── queue/
│   └── diagramQueue.ts            # BullMQ queue definition
├── workers/
│   └── diagramWorker.ts           # Background worker
├── data/
│   ├── diagram_hashes.db          # SQLite database (auto-created)
│   └── results/                   # Job results (auto-created)
├── public/
│   └── diagrams/
│       ├── extracted/            # Extracted diagrams
│       └── reference/             # Reference diagrams for comparison
└── uploads/                       # Uploaded PDFs
```

## Configuration

### Environment Variables

Create `.env.local` (optional):

```env
# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379

# ChromeDriver Path (if not in PATH)
CHROMEDRIVER_PATH=/path/to/chromedriver
```

### Reference Directory

Place reference diagrams in `public/diagrams/reference/` for local comparison.

## API Endpoints

### 1. Start Plagiarism Scan
```
POST /api/forensics/scan
Body: FormData with 'file' (PDF)
Response: { jobId, success }
```

### 2. Get Job Status
```
GET /api/forensics/status?jobId=<jobId>
Response: { state, progress, ... }
```

### 3. Get Final Report
```
GET /api/forensics/report?jobId=<jobId>
Response: { report: { diagrams, summary, ... } }
```

## Troubleshooting

### Python Script Not Found

**Error:** `Python script not found at: ...`

**Solution:**
- Ensure scripts are in `scripts/` directory
- Check file permissions
- Verify Python is in PATH

### Redis Connection Error

**Error:** `Error connecting to Redis`

**Solution:**
- Ensure Redis is running: `redis-cli ping`
- Check REDIS_HOST and REDIS_PORT in .env
- Verify firewall settings

### ChromeDriver Not Found

**Error:** `ChromeDriver executable not found`

**Solution:**
- Install ChromeDriver (see Prerequisites)
- Add to PATH or set CHROMEDRIVER_PATH
- Use webdriver-manager for automatic management

### Worker Not Processing Jobs

**Error:** Jobs stuck in queue

**Solution:**
- Ensure worker is running: `npm run worker`
- Check Redis connection
- Verify Python scripts are executable
- Check worker logs for errors

### OpenCV Import Error

**Error:** `No module named 'cv2'`

**Solution:**
```bash
pip install opencv-python
```

### Selenium Timeout

**Error:** `TimeoutException` in reverse search

**Solution:**
- Increase wait times in `auto_reverse_search.py`
- Check internet connection
- Verify Chrome/ChromeDriver compatibility
- Try running in non-headless mode for debugging

## Performance Notes

- **Small PDFs** (< 10 pages): 30-60 seconds
- **Medium PDFs** (10-50 pages): 2-5 minutes
- **Large PDFs** (> 50 pages): 5-15 minutes

Reverse image search adds ~10-20 seconds per diagram.

## Security Considerations

- All processing is local (no external APIs)
- Uploaded PDFs stored in `uploads/` (not publicly accessible)
- Extracted images in `public/diagrams/` (publicly accessible)
- SQLite database in `data/` (not publicly accessible)
- Consider adding authentication for production use

## Production Deployment

1. **Build Next.js:**
   ```bash
   npm run build
   ```

2. **Start Production Server:**
   ```bash
   npm start
   ```

3. **Run Worker as Service:**
   - Use PM2: `pm2 start npm --name "forensics-worker" -- run worker`
   - Or systemd service
   - Or Docker container

4. **Configure Redis:**
   - Use managed Redis service (AWS ElastiCache, etc.)
   - Or persistent Redis instance

5. **Set Environment Variables:**
   - Production Redis connection
   - ChromeDriver path
   - File storage paths

## Support

For issues or questions:
1. Check logs in worker terminal
2. Check browser console for frontend errors
3. Verify all prerequisites are installed
4. Review this setup guide

## License

Part of the ScholarSentinel project.


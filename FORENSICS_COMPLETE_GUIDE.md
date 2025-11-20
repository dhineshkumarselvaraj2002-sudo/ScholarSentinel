# Diagram Forensics Engine - Complete Implementation Guide

## 🎯 System Overview

The **Diagram Forensics Engine** is a complete, locally-running AI-powered system for detecting diagram plagiarism in PDF documents. It combines multiple detection techniques:

1. **Perceptual Hashing** - Detects exact and near-exact duplicates
2. **OpenCV Feature Matching** - Detects edited/cropped versions
3. **Reverse Image Search** - Finds similar images on the web
4. **Local Comparison** - Compares against reference database

**Key Features:**
- ✅ 100% Local Processing (No Cloud APIs)
- ✅ Background Job Queue (BullMQ + Redis)
- ✅ Comprehensive Reporting
- ✅ Real-time Progress Tracking
- ✅ Modern Web UI

## 📁 Complete File Structure

```
ScholarSentinel/
│
├── app/
│   ├── api/
│   │   ├── extract/
│   │   │   └── route.ts                    # Module A API
│   │   ├── hashing/
│   │   │   └── route.ts                    # Module B API
│   │   ├── compare/
│   │   │   └── route.ts                    # Module C API
│   │   ├── reverse/
│   │   │   └── route.ts                    # Module D API
│   │   └── forensics/
│   │       ├── scan/
│   │       │   └── route.ts                # Start scan
│   │       ├── status/
│   │       │   └── route.ts                 # Job status
│   │       └── report/
│   │           └── route.ts                 # Get report
│   └── forensics/
│       └── page.tsx                         # Module G: Frontend UI
│
├── scripts/
│   ├── pdf_extractor.py                     # Module A: PDF extraction
│   ├── image_hashing.py                     # Module B: Hash computation
│   ├── opencv_compare.py                    # Module C: OpenCV comparison
│   ├── auto_reverse_search.py               # Module D: Selenium automation
│   └── plagiarism_engine.py                 # Module F: Master pipeline
│
├── queue/
│   └── diagramQueue.ts                      # Module E: Queue definition
│
├── workers/
│   └── diagramWorker.ts                     # Module E: Background worker
│
├── data/
│   ├── diagram_hashes.db                     # SQLite database (auto-created)
│   └── results/                             # Job results (auto-created)
│       └── <jobId>.json
│
├── public/
│   └── diagrams/
│       ├── extracted/                       # Extracted diagrams
│       │   └── <pdfName>/
│       │       └── <page>-<index>.png
│       └── reference/                       # Reference diagrams
│
└── uploads/                                 # Uploaded PDFs
```

## 🔄 End-to-End Pipeline Flow

### 1. User Uploads PDF
```
User → /forensics → Upload PDF → POST /api/forensics/scan
```

### 2. Job Queued
```
API → diagramQueue.add() → Redis → Job stored
```

### 3. Worker Processes Job
```
Worker → Reads job from queue → Calls plagiarism_engine.py
```

### 4. Plagiarism Engine Pipeline

```
plagiarism_engine.py:
  │
  ├─→ Step 1: Extract Diagrams
  │   └─→ pdf_extractor.py
  │       ├─→ Extract embedded images (PyMuPDF)
  │       ├─→ Render vector graphics
  │       └─→ Save to public/diagrams/extracted/<pdfName>/
  │
  ├─→ Step 2: For Each Diagram
  │   │
  │   ├─→ 2a. Compute Hashes
  │   │   └─→ image_hashing.py
  │   │       ├─→ Generate pHash, dHash, aHash
  │   │       └─→ Store in SQLite (data/diagram_hashes.db)
  │   │
  │   ├─→ 2b. Local Comparison
  │   │   └─→ opencv_compare.py
  │   │       ├─→ ORB feature detection
  │   │       ├─→ SSIM computation
  │   │       └─→ Compare with reference/ directory
  │   │
  │   └─→ 2c. Reverse Image Search
  │       └─→ auto_reverse_search.py
  │           ├─→ Selenium automation
  │           ├─→ Upload to Google Images
  │           └─→ Extract results
  │
  └─→ Step 3: Generate Report
      ├─→ Combine all results
      ├─→ Make plagiarism decision
      └─→ Save to data/results/<jobId>.json
```

### 5. Frontend Polls for Results
```
Frontend → GET /api/forensics/status?jobId=... (every 2s)
         → GET /api/forensics/report?jobId=... (when complete)
         → Display report
```

## 🔍 Detection Algorithms

### Hash-Based Detection

**Perceptual Hash (pHash):**
- Detects visually similar images
- Hash distance < 10 → Strong duplicate indicator
- Stored in SQLite for fast lookup

**Difference Hash (dHash):**
- Detects horizontal gradients
- Complementary to pHash

**Average Hash (aHash):**
- Simple average-based hash
- Fast but less accurate

### OpenCV Feature Matching

**ORB (Oriented FAST and Rotated BRIEF):**
- Detects keypoints and descriptors
- Match ratio > 35% → Likely copied
- Handles rotation and scaling

**SSIM (Structural Similarity Index):**
- Measures structural similarity
- Score > 0.65 → Likely copied
- Score > 0.75 → High confidence

### Reverse Image Search

**Google Images:**
- Uploads image via Selenium
- Extracts similar images
- Finds matching web pages

**Bing Visual Search:**
- Alternative search engine
- Cross-validation

## 📊 Decision Logic

### Plagiarism Decision Rules

```python
confidence = 0.0

# Hash match (strong indicator)
if hash_similarity > 0.9:
    confidence += 0.3

# OpenCV SSIM (high confidence)
if ssim > 0.75:
    confidence += 0.4

# ORB matches
if orb_matches > 0.35:
    confidence += 0.2

# Reverse search results
if google_found_similar_images:
    confidence += 0.3

# Final decision
if confidence >= 0.7:
    decision = "heavily plagiarized"
elif confidence >= 0.4:
    decision = "partially plagiarized"
else:
    decision = "original"
```

## 🛠️ Module Details

### Module A: PDF Extraction

**File:** `scripts/pdf_extractor.py`

**Functions:**
- `extract_diagrams(pdf_path, output_base_dir) -> List[str]`

**Methods:**
1. Extract embedded images (PyMuPDF)
2. Render vector graphics (page rendering)
3. Filter small images (< 150px)

**Output:**
- PNG files in `public/diagrams/extracted/<pdfName>/<page>-<index>.png`

### Module B: Image Hashing

**File:** `scripts/image_hashing.py`

**Database Schema:**
```sql
CREATE TABLE diagram_hashes (
    id INTEGER PRIMARY KEY,
    filePath TEXT UNIQUE,
    pHash TEXT,
    dHash TEXT,
    aHash TEXT,
    createdAt DATETIME
);
```

**Functions:**
- `compute_hashes(image_path) -> Dict`
- `store_hashes(image_path, hashes) -> bool`
- `compare_hashes(hash1, hash2) -> float`
- `find_similar(image_path, threshold) -> List[Dict]`

### Module C: OpenCV Comparison

**File:** `scripts/opencv_compare.py`

**Functions:**
- `compare_images(image1, image2) -> Dict`
- `is_likely_copied(image1, image2) -> Dict`
- `compare_with_directory(query_image, ref_dir) -> Dict`

**Thresholds:**
- ORB matches > 35% → Likely copied
- SSIM > 0.65 → Likely copied

### Module D: Reverse Search

**File:** `scripts/auto_reverse_search.py`

**Functions:**
- `search_google(image_path) -> Dict`
- `search_bing(image_path) -> Dict`

**Features:**
- Headless/visible mode
- Anti-detection (UA spoofing, throttling)
- Error handling

### Module E: Queue System

**Files:**
- `queue/diagramQueue.ts` - Queue definition
- `workers/diagramWorker.ts` - Worker process

**Job Types:**
- `extract` - PDF extraction
- `hash` - Hash computation
- `compare` - OpenCV comparison
- `reverse-search` - Reverse image search
- `plagiarism` - Full pipeline

### Module F: Master Pipeline

**File:** `scripts/plagiarism_engine.py`

**Pipeline:**
1. Extract diagrams
2. For each diagram:
   - Compute hashes
   - Compare locally
   - Reverse search
3. Generate report

### Module G: Frontend UI

**File:** `app/forensics/page.tsx`

**Features:**
- PDF upload
- Progress tracking
- Report display
- Diagram previews
- Similarity charts

## 🚀 Quick Start

### 1. Install Dependencies

```bash
# Python
pip install -r python-service/requirements-forensics.txt

# Node.js
npm install
```

### 2. Start Services

```bash
# Terminal 1: Redis
redis-server

# Terminal 2: Worker
npm run worker

# Terminal 3: Next.js
npm run dev
```

### 3. Access UI

Navigate to: `http://localhost:3000/forensics`

## 📝 Sample Report Structure

```json
{
  "jobId": "plagiarism_1234567890_abc123",
  "pdfPath": "uploads/1234567890_document.pdf",
  "totalDiagrams": 5,
  "diagrams": [
    {
      "diagram": "diagrams/extracted/document/page_1-1.png",
      "index": 1,
      "localSimilarity": {
        "bestMatch": {
          "image": "reference/similar.png",
          "score": 85.5,
          "ssim": 0.78
        }
      },
      "reverseImageSearch": {
        "bestGuess": "Flowchart diagram",
        "similarImagesCount": 12,
        "matchingPagesCount": 5
      },
      "hashMatches": {
        "count": 2,
        "highestSimilarity": 0.95
      },
      "decision": "heavily plagiarized",
      "confidence": 0.85,
      "indicators": [
        "High SSIM similarity: 0.78",
        "ORB match percentage: 85.50%",
        "Visually similar images found on Google"
      ]
    }
  ],
  "summary": {
    "total": 5,
    "original": 2,
    "partiallyPlagiarized": 1,
    "heavilyPlagiarized": 2,
    "averageConfidence": 0.52,
    "riskLevel": "high"
  }
}
```

## 🔧 Configuration Options

### Python Scripts

**pdf_extractor.py:**
- Minimum image size: 150px (configurable)
- Output format: PNG
- Vector rendering: 2x resolution

**image_hashing.py:**
- Hash size: 16 (configurable)
- Similarity threshold: 0.8 (configurable)

**opencv_compare.py:**
- ORB features: 1000 (configurable)
- ORB threshold: 0.35 (configurable)
- SSIM threshold: 0.65 (configurable)

**auto_reverse_search.py:**
- Throttle delay: 1-2 seconds
- Upload wait: 5-8 seconds
- Headless mode: true (default)

### Queue Configuration

**diagramQueue.ts:**
- Max retries: 3
- Backoff: Exponential (2s)
- Concurrency: 2 jobs

## 🐛 Common Issues

### Issue: Worker Not Starting

**Solution:**
- Check Redis is running
- Verify Python is in PATH
- Check worker logs

### Issue: Selenium Timeout

**Solution:**
- Update ChromeDriver
- Check Chrome version compatibility
- Increase wait times

### Issue: OpenCV Import Error

**Solution:**
```bash
pip install opencv-python scikit-image
```

### Issue: Jobs Stuck

**Solution:**
- Restart worker
- Clear Redis queue
- Check Python script errors

## 📈 Performance Optimization

1. **Parallel Processing:** Worker processes 2 jobs concurrently
2. **Caching:** Hashes stored in SQLite for fast lookup
3. **Throttling:** Reverse search throttled to avoid detection
4. **Batch Operations:** Multiple diagrams processed in sequence

## 🔒 Security Notes

- All processing is local
- No external API calls (except reverse search)
- Uploaded files stored securely
- SQLite database not publicly accessible
- Consider authentication for production

## 📚 Additional Resources

- **PyMuPDF Docs:** https://pymupdf.readthedocs.io/
- **OpenCV Docs:** https://docs.opencv.org/
- **Selenium Docs:** https://www.selenium.dev/documentation/
- **BullMQ Docs:** https://docs.bullmq.io/

## ✅ Testing Checklist

- [ ] Redis running
- [ ] Worker process running
- [ ] Python dependencies installed
- [ ] ChromeDriver installed
- [ ] Test PDF uploads successfully
- [ ] Diagrams extracted correctly
- [ ] Hashes computed and stored
- [ ] OpenCV comparison works
- [ ] Reverse search completes
- [ ] Report generated correctly
- [ ] Frontend displays results

## 🎉 Success!

Your Diagram Forensics Engine is now complete and ready to detect diagram plagiarism!


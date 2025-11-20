# PDF Processing Microservice

FastAPI service for processing PDF files in Scholar Sentinel.

## Setup

1. Create virtual environment:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

3. Run the service:
```bash
python main.py
# Or with uvicorn directly:
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

## Endpoints

- `GET /health` - Health check
- `POST /extract-text` - Extract text from PDF
- `POST /extract-references` - Extract references from PDF
- `POST /extract-figures` - Extract figures/images from PDF with perceptual hashes

## Usage Example

```bash
curl -X POST "http://localhost:8000/extract-text" \
  -F "file=@paper.pdf"
```


"""
OCR-based Diagram Search Engine
Uses OCR to extract text from diagrams, then searches using free APIs.
NO browser automation or Playwright.
"""

import sys
import json
import argparse
import logging
import os
import time
from pathlib import Path
from typing import Dict, List, Any, Optional
import re
from urllib.parse import quote

# Configure logging first (needed for early initialization messages)
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    stream=sys.stderr
)
logger = logging.getLogger(__name__)

# Try to import requests
try:
    import requests
    REQUESTS_AVAILABLE = True
except ImportError:
    REQUESTS_AVAILABLE = False

# Try to import OCR library
try:
    import pytesseract
    from PIL import Image, ImageEnhance, ImageFilter
    OCR_AVAILABLE = True
    
    # Try to set Tesseract path for Windows if not in PATH
    # Common Windows installation paths
    if sys.platform == 'win32':
        possible_paths = [
            r'C:\Program Files\Tesseract-OCR\tesseract.exe',
            r'C:\Program Files (x86)\Tesseract-OCR\tesseract.exe',
            r'C:\Users\{}\AppData\Local\Programs\Tesseract-OCR\tesseract.exe'.format(os.getenv('USERNAME', '')),
        ]
        for tesseract_path in possible_paths:
            if os.path.exists(tesseract_path):
                pytesseract.pytesseract.tesseract_cmd = tesseract_path
                logger.debug(f"Found Tesseract at: {tesseract_path}")
                break
except ImportError:
    OCR_AVAILABLE = False
    print("ERROR: pytesseract and Pillow required. Install with: pip install pytesseract pillow", file=sys.stderr)

# Try to import imagehash for hash comparison
try:
    import imagehash
    HASH_AVAILABLE = True
except ImportError:
    HASH_AVAILABLE = False


class OCRDiagramSearcher:
    """OCR-based diagram search using free APIs"""
    
    def __init__(self, serper_api_key: Optional[str] = None, google_cse_id: Optional[str] = None):
        """
        Initialize the OCR searcher.
        
        Args:
            serper_api_key: Serper.dev API key (optional, 100 free/day)
            google_cse_id: Google Custom Search Engine ID (optional)
        """
        self.serper_api_key = serper_api_key or os.getenv('SERPER_API_KEY')
        self.google_cse_id = google_cse_id or os.getenv('GOOGLE_CSE_ID')
        self.google_api_key = os.getenv('GOOGLE_API_KEY')
    
    def _preprocess_image(self, image: Image.Image) -> List[tuple]:
        """
        Preprocess image with multiple strategies for better OCR.
        
        Returns:
            List of (variant_name, preprocessed_image) tuples
        """
        variants = []
        
        # Original RGB
        if image.mode != 'RGB':
            rgb_image = image.convert('RGB')
        else:
            rgb_image = image.copy()
        variants.append(('original', rgb_image))
        
        # Upscale if image is small (improves OCR accuracy)
        width, height = rgb_image.size
        if width < 300 or height < 300:
            scale_factor = max(300 / width, 300 / height, 2.0)
            new_size = (int(width * scale_factor), int(height * scale_factor))
            upscaled = rgb_image.resize(new_size, Image.Resampling.LANCZOS)
            variants.append(('upscaled', upscaled))
        
        # Grayscale with contrast enhancement
        gray = rgb_image.convert('L')
        enhancer = ImageEnhance.Contrast(gray)
        high_contrast = enhancer.enhance(2.0)
        variants.append(('high_contrast_gray', high_contrast))
        
        # Sharpened grayscale
        sharpened = gray.filter(ImageFilter.SHARPEN)
        variants.append(('sharpened_gray', sharpened))
        
        # High contrast + sharpened
        sharp_contrast = high_contrast.filter(ImageFilter.SHARPEN)
        variants.append(('sharp_contrast_gray', sharp_contrast))
        
        return variants
    
    def _try_ocr_with_psm(self, image: Image.Image, psm_mode: int = None) -> str:
        """
        Try OCR with specific PSM (Page Segmentation Mode).
        
        PSM modes:
        3 = Fully automatic page segmentation, but no OSD (default)
        6 = Assume a single uniform block of text
        7 = Treat the image as a single text line
        8 = Treat the image as a single word
        11 = Sparse text. Find as much text as possible in no particular order
        12 = Sparse text with OSD
        """
        config = '--psm {}'.format(psm_mode) if psm_mode else ''
        try:
            text = pytesseract.image_to_string(image, lang='eng', config=config)
            return ' '.join(text.split()).strip()
        except Exception as e:
            logger.debug(f"OCR with PSM {psm_mode} failed: {e}")
            return ""
    
    def extract_ocr_text(self, image_path: str) -> str:
        """
        Step 1: Extract text from diagram using OCR with enhanced preprocessing.
        
        Args:
            image_path: Path to image file
            
        Returns:
            Extracted text or "no_ocr_text_found"
        """
        if not OCR_AVAILABLE:
            logger.error("OCR libraries not available. Install with: pip install pytesseract pillow")
            return "no_ocr_text_found"
        
        try:
            # Check if Tesseract is installed
            try:
                pytesseract.get_tesseract_version()
            except Exception as tesseract_error:
                error_msg = str(tesseract_error)
                if "tesseract is not installed" in error_msg.lower() or "not in your path" in error_msg.lower():
                    logger.error("Tesseract OCR is not installed or not in PATH.")
                    logger.error("Installation instructions:")
                    logger.error("  Windows: choco install tesseract OR download from https://github.com/UB-Mannheim/tesseract/wiki")
                    logger.error("  macOS: brew install tesseract")
                    logger.error("  Linux: sudo apt-get install tesseract-ocr")
                    logger.error("After installation, ensure Tesseract is in your system PATH.")
                else:
                    logger.error(f"Tesseract check failed: {tesseract_error}")
                return "no_ocr_text_found"
            
            image = Image.open(image_path)
            logger.info(f"Processing image: {image.size[0]}x{image.size[1]} pixels, mode: {image.mode}")
            
            # Generate preprocessed variants
            variants = self._preprocess_image(image)
            logger.debug(f"Generated {len(variants)} image variants for OCR")
            
            # Try OCR with different preprocessing and PSM modes
            best_text = ""
            best_length = 0
            psm_modes = [11, 6, 3, 12, 7]  # Start with sparse text modes (best for diagrams)
            
            for variant_name, variant_image in variants:
                logger.debug(f"Trying OCR with variant: {variant_name}")
                
                # Try multiple PSM modes for each variant
                for psm in psm_modes:
                    text = self._try_ocr_with_psm(variant_image, psm)
                    if text and len(text) > best_length:
                        best_text = text
                        best_length = len(text)
                        logger.debug(f"Found better text ({len(text)} chars) with {variant_name}, PSM {psm}")
                
                # Also try without PSM (default)
                text = self._try_ocr_with_psm(variant_image, None)
                if text and len(text) > best_length:
                    best_text = text
                    best_length = len(text)
                    logger.debug(f"Found better text ({len(text)} chars) with {variant_name}, default PSM")
            
            # Log what was extracted
            if best_text:
                # Show first 100 characters for debugging
                preview = best_text[:100] + "..." if len(best_text) > 100 else best_text
                logger.info(f"OCR extracted {len(best_text)} characters: {preview}")
                
                # Even if text is short, try to use it (might contain important keywords)
                if len(best_text.strip()) >= 1:
                    return best_text.strip()
                else:
                    logger.warning("OCR extracted only whitespace")
            else:
                logger.warning("OCR extracted no text from any variant")
            
            # Final fallback: try to extract any single characters/symbols
            logger.debug("Attempting final fallback: extracting individual characters")
            try:
                # Use PSM 8 (single word) or 7 (single line) to catch any text
                for variant_name, variant_image in variants[:2]:  # Try first 2 variants
                    for psm in [8, 7]:
                        text = self._try_ocr_with_psm(variant_image, psm)
                        if text and len(text.strip()) > 0:
                            logger.info(f"Fallback OCR found {len(text)} characters")
                            return text.strip()
            except Exception as e:
                logger.debug(f"Fallback OCR failed: {e}")
            
            logger.warning("No OCR text found after trying all strategies")
            return "no_ocr_text_found"
            
        except Exception as e:
            error_msg = str(e)
            if "tesseract is not installed" in error_msg.lower() or "not in your path" in error_msg.lower():
                logger.error("Tesseract OCR is not installed or not in PATH.")
                logger.error("Installation instructions:")
                logger.error("  Windows: choco install tesseract OR download from https://github.com/UB-Mannheim/tesseract/wiki")
                logger.error("  macOS: brew install tesseract")
                logger.error("  Linux: sudo apt-get install tesseract-ocr")
            else:
                logger.error(f"OCR extraction failed: {e}")
            return "no_ocr_text_found"
    
    def clean_and_normalize(self, ocr_text: str) -> List[str]:
        """
        Step 2: Extract meaningful keywords from OCR text.
        Enhanced to handle minimal text.
        
        Args:
            ocr_text: Raw OCR output
            
        Returns:
            List of cleaned keywords
        """
        if ocr_text == "no_ocr_text_found":
            return []
        
        keywords = []
        
        # If text is very short, extract everything that looks meaningful
        if len(ocr_text.strip()) < 10:
            # Extract any alphanumeric sequences (even single chars)
            all_tokens = re.findall(r'[A-Za-z0-9]+', ocr_text)
            keywords.extend(all_tokens)
            # Extract any symbols that might be meaningful
            symbols = re.findall(r'[^\w\s]{1,3}', ocr_text)
            keywords.extend(symbols)
            logger.debug(f"Minimal text detected, extracted all tokens: {keywords}")
        else:
            # Extract technical terms (capitalized words, acronyms)
            technical_terms = re.findall(r'\b[A-Z][a-zA-Z0-9]{2,}\b', ocr_text)
            keywords.extend(technical_terms)
            
            # Extract lowercase words (might be important terms)
            lowercase_words = re.findall(r'\b[a-z]{3,}\b', ocr_text)
            keywords.extend(lowercase_words)
            
            # Extract numbers with context (percentages, dimensions, versions)
            numbers = re.findall(r'\d+\.?\d*[x×]\d+\.?\d*', ocr_text)  # Dimensions like 640x640
            keywords.extend(numbers)
            
            numbers_pct = re.findall(r'\d+\.?\d*%', ocr_text)  # Percentages
            keywords.extend(numbers_pct)
            
            numbers_ver = re.findall(r'\d+\.\d+', ocr_text)  # Version numbers
            keywords.extend(numbers_ver)
            
            # Extract standalone numbers (might be important)
            standalone_numbers = re.findall(r'\b\d{2,}\b', ocr_text)
            keywords.extend(standalone_numbers)
            
            # Extract quoted phrases (likely important terms)
            quoted = re.findall(r'"([^"]+)"', ocr_text)
            keywords.extend(quoted)
            
            # Extract multi-word technical terms (2-4 words, capitalized)
            multi_word = re.findall(r'\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3}\b', ocr_text)
            keywords.extend(multi_word)
            
            # Extract dataset/model names (common patterns)
            dataset_patterns = [
                r'\b[A-Z]{2,}[0-9]+\b',  # MNIST, CIFAR10, etc.
                r'\b[A-Z]+-[A-Z]+\b',  # YOLO-V5, ResNet-50
            ]
            for pattern in dataset_patterns:
                matches = re.findall(pattern, ocr_text)
                keywords.extend(matches)
        
        # Clean and deduplicate
        cleaned = []
        seen = set()
        
        # Common stop words to filter
        stop_words = {'the', 'and', 'for', 'with', 'from', 'this', 'that', 'are', 'was', 'were', 'has', 'have', 'had'}
        
        for kw in keywords:
            # For minimal text, be less strict
            min_length = 1 if len(ocr_text.strip()) < 10 else 2
            
            if len(kw) < min_length:
                continue
            if kw.lower() in stop_words:
                continue
            
            # Normalize
            kw_clean = kw.strip()
            kw_lower = kw_clean.lower()
            
            # Keep original case for technical terms, lowercase for common words
            if kw_lower not in seen:
                seen.add(kw_lower)
                # Preserve case for acronyms and technical terms
                if kw_clean.isupper() or (kw_clean[0].isupper() and len(kw_clean) > 2):
                    cleaned.append(kw_clean)
                else:
                    cleaned.append(kw_lower)
        
        # Sort by length (longer = more specific), then alphabetically
        cleaned.sort(key=lambda x: (-len(x), x.lower()))
        
        # Limit to top 30 most meaningful (increased for minimal text scenarios)
        keywords = cleaned[:30]
        
        if keywords:
            logger.info(f"Extracted {len(keywords)} keywords: {keywords[:10]}{'...' if len(keywords) > 10 else ''}")
        else:
            logger.warning("No keywords extracted from OCR text")
        
        return keywords
    
    def build_search_queries(self, keywords: List[str], ocr_text: str) -> List[str]:
        """
        Step 3: Build search queries from keywords.
        Enhanced to handle minimal keywords and use raw OCR text as fallback.
        
        Args:
            keywords: List of extracted keywords
            ocr_text: Original OCR text for context
            
        Returns:
            List of search queries
        """
        queries = []
        
        # If no keywords but we have OCR text, use the text directly
        if not keywords and ocr_text != "no_ocr_text_found" and len(ocr_text.strip()) > 0:
            # Use the entire OCR text as a query (up to 100 chars)
            text_query = ocr_text.strip()[:100]
            queries.append(text_query)
            logger.info(f"Using raw OCR text as query (no keywords extracted): {text_query[:50]}...")
        
        if not keywords:
            return queries
        
        # Strategy 1: Use individual keywords (especially if we have few)
        if len(keywords) <= 3:
            # Use each keyword individually with context
            for kw in keywords[:3]:
                queries.append(f"{kw} diagram")
                queries.append(f"{kw} architecture")
        else:
            # Strategy 1: Combine top keywords (2-3 at a time)
            # Take top 5 keywords and create combinations
            top_keywords = keywords[:5]
            
            # Pair combinations
            for i in range(min(3, len(top_keywords))):
                for j in range(i + 1, min(i + 3, len(top_keywords))):
                    query = f"{top_keywords[i]} {top_keywords[j]}"
                    queries.append(query)
        
        # Strategy 2: Architecture/Model name + "architecture" or "diagram"
        architecture_keywords = [kw for kw in keywords if any(term in kw.lower() for term in ['net', 'model', 'arch', 'cnn', 'rnn', 'yolo', 'resnet', 'vgg', 'transformer', 'bert', 'gpt'])]
        for arch_kw in architecture_keywords[:3]:
            queries.append(f"{arch_kw} architecture")
            queries.append(f"{arch_kw} diagram")
            queries.append(f"{arch_kw} neural network")
        
        # Strategy 3: Extract key phrases from OCR (if meaningful)
        # Look for patterns like "X Architecture", "Y Module", etc.
        if ocr_text != "no_ocr_text_found" and len(ocr_text) > 10:
            phrase_patterns = [
                r'([A-Z][a-zA-Z0-9]+(?:\s+[A-Z][a-zA-Z0-9]+)*)\s+(?:Architecture|Module|Block|Layer|Network)',
                r'(Architecture|Module|Block|Layer|Network)\s+([A-Z][a-zA-Z0-9]+(?:\s+[A-Z][a-zA-Z0-9]+)*)',
            ]
            
            for pattern in phrase_patterns:
                matches = re.findall(pattern, ocr_text)
                for match in matches[:2]:
                    if isinstance(match, tuple):
                        query = ' '.join(m for m in match if m)
                    else:
                        query = match
                    if query and len(query) > 5:
                        queries.append(query)
        
        # Strategy 4: Dimensions + architecture
        dimensions = [kw for kw in keywords if 'x' in kw.lower() or '×' in kw]
        if dimensions and architecture_keywords:
            for dim in dimensions[:2]:
                for arch in architecture_keywords[:2]:
                    queries.append(f"{arch} {dim}")
        
        # Deduplicate and limit
        seen = set()
        unique_queries = []
        min_length = 3 if len(keywords) <= 3 else 5  # Allow shorter queries for minimal keywords
        for q in queries:
            q_lower = q.lower()
            q_stripped = q.strip()
            if q_lower not in seen and len(q_stripped) >= min_length:
                seen.add(q_lower)
                unique_queries.append(q_stripped)
        
        # Limit to 5 best queries (or fewer if we don't have many)
        max_queries = min(5, len(unique_queries))
        queries = unique_queries[:max_queries]
        
        logger.info(f"Generated {len(queries)} search queries")
        return queries
    
    def build_api_calls(self, queries: List[str]) -> List[Dict[str, Any]]:
        """
        Step 4: Build API call payloads for free search APIs.
        
        Args:
            queries: List of search queries
            
        Returns:
            List of API call configurations
        """
        api_calls = []
        
        for query in queries:
            # Primary: Serper.dev (if API key available)
            if self.serper_api_key:
                api_calls.append({
                    "api": "serper",
                    "method": "POST",
                    "url": "https://google.serper.dev/search",
                    "headers": {
                        "X-API-KEY": self.serper_api_key,
                        "Content-Type": "application/json"
                    },
                    "body": {
                        "q": query,
                        "num": 10
                    }
                })
            
            # Fallback: DuckDuckGo (no API key needed)
            api_calls.append({
                "api": "duckduckgo",
                "method": "GET",
                "url": f"https://api.duckduckgo.com/?q={quote(query)}&format=json&no_html=1&skip_disambig=1",
                "headers": {},
                "body": None
            })
            
            # Fallback: NoAPI.com (if available)
            api_calls.append({
                "api": "noapi",
                "method": "GET",
                "url": f"https://noapi.com/api/v1/search?q={quote(query)}",
                "headers": {},
                "body": None
            })
            
            # Google CSE (if configured)
            if self.google_cse_id and self.google_api_key:
                api_calls.append({
                    "api": "google_cse",
                    "method": "GET",
                    "url": "https://www.googleapis.com/customsearch/v1",
                    "headers": {},
                    "body": {
                        "key": self.google_api_key,
                        "cx": self.google_cse_id,
                        "q": query,
                        "num": 10
                    }
                })
        
        return api_calls
    
    def search_with_api(self, api_call: Dict[str, Any], max_retries: int = 2) -> Optional[Dict[str, Any]]:
        """
        Execute a single API call with retry logic and error handling.
        
        Args:
            api_call: API call configuration
            max_retries: Maximum number of retry attempts
            
        Returns:
            API response or None
        """
        if not REQUESTS_AVAILABLE:
            logger.error("requests library not available")
            return None
        
        api_name = api_call.get("api", "unknown")
        
        # Configure SSL verification based on API
        verify_ssl = True
        if api_name == "noapi":
            # NoAPI.com has SSL certificate issues, disable verification
            verify_ssl = False
            try:
                import urllib3
                urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
            except ImportError:
                pass  # urllib3 not available, warnings will still show but won't break
        
        # Add user agent to avoid blocking
        headers = api_call.get("headers", {}).copy()
        if "User-Agent" not in headers:
            headers["User-Agent"] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        
        for attempt in range(max_retries + 1):
            try:
                # Add small delay between retries
                if attempt > 0:
                    delay = min(2 ** attempt, 5)  # Exponential backoff, max 5 seconds
                    logger.debug(f"Retrying {api_name} API call (attempt {attempt + 1}/{max_retries + 1}) after {delay}s delay")
                    time.sleep(delay)
                
                if api_call["method"] == "POST":
                    response = requests.post(
                        api_call["url"],
                        json=api_call.get("body"),
                        headers=headers,
                        timeout=15,
                        verify=verify_ssl
                    )
                else:
                    # GET request
                    url = api_call["url"]
                    if api_call.get("body"):
                        # Add query params for GET
                        params = api_call["body"]
                        response = requests.get(
                            url,
                            params=params,
                            headers=headers,
                            timeout=15,
                            verify=verify_ssl
                        )
                    else:
                        response = requests.get(
                            url,
                            headers=headers,
                            timeout=15,
                            verify=verify_ssl
                        )
                
                # Handle different status codes
                if response.status_code == 200:
                    try:
                        return response.json()
                    except json.JSONDecodeError:
                        # Some APIs return non-JSON on success (e.g., DuckDuckGo)
                        logger.debug(f"{api_name} returned non-JSON response, treating as empty")
                        return None
                elif response.status_code == 202:
                    # 202 Accepted - might be rate limiting or async processing
                    if api_name == "duckduckgo":
                        logger.debug(f"DuckDuckGo returned 202 (rate limit or processing), skipping")
                        return None
                    else:
                        logger.warning(f"{api_name} returned 202, may indicate rate limiting")
                        if attempt < max_retries:
                            continue
                        return None
                elif response.status_code == 429:
                    # Rate limited - wait longer before retry
                    logger.warning(f"{api_name} rate limited (429), waiting before retry")
                    if attempt < max_retries:
                        time.sleep(5)
                        continue
                    return None
                elif response.status_code in [403, 401]:
                    # Authentication/authorization error - don't retry
                    logger.warning(f"{api_name} authentication failed (Status {response.status_code})")
                    return None
                else:
                    logger.warning(f"{api_name} API call failed - Status {response.status_code}")
                    if attempt < max_retries and response.status_code >= 500:
                        # Retry on server errors (5xx)
                        continue
                    return None
                    
            except requests.exceptions.SSLError as e:
                logger.warning(f"{api_name} SSL error: {e}")
                if verify_ssl and attempt < max_retries:
                    # Try without SSL verification as fallback
                    verify_ssl = False
                    try:
                        import urllib3
                        urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
                    except ImportError:
                        pass
                    logger.debug(f"Retrying {api_name} without SSL verification")
                    continue
                return None
            except requests.exceptions.Timeout:
                logger.warning(f"{api_name} request timeout")
                if attempt < max_retries:
                    continue
                return None
            except requests.exceptions.ConnectionError as e:
                logger.warning(f"{api_name} connection error: {e}")
                if attempt < max_retries:
                    continue
                return None
            except Exception as e:
                error_msg = str(e)
                # Don't retry on certain errors
                if "CERTIFICATE_VERIFY_FAILED" in error_msg and verify_ssl:
                    logger.debug(f"{api_name} SSL certificate error, retrying without verification")
                    verify_ssl = False
                    try:
                        import urllib3
                        urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
                    except ImportError:
                        pass
                    if attempt < max_retries:
                        continue
                logger.error(f"{api_name} API call error: {e}")
                if attempt < max_retries:
                    continue
                return None
        
        return None
    
    def interpret_results(self, api_results: List[Dict[str, Any]], ocr_text: str, keywords: List[str]) -> List[Dict[str, Any]]:
        """
        Step 5: Interpret search results and find matching sources.
        
        Args:
            api_results: List of API responses
            ocr_text: Original OCR text
            keywords: Extracted keywords
            
        Returns:
            List of potential matching sources
        """
        results = []
        seen_urls = set()
        
        for api_result in api_results:
            if not api_result:
                continue
            
            # Parse different API response formats
            urls = []
            
            # Serper.dev format
            if "organic" in api_result:
                for item in api_result["organic"]:
                    urls.append({
                        "url": item.get("link", ""),
                        "title": item.get("title", ""),
                        "snippet": item.get("snippet", "")
                    })
            
            # Google CSE format
            elif "items" in api_result:
                for item in api_result["items"]:
                    urls.append({
                        "url": item.get("link", ""),
                        "title": item.get("title", ""),
                        "snippet": item.get("snippet", "")
                    })
            
            # DuckDuckGo format
            elif "RelatedTopics" in api_result:
                for topic in api_result["RelatedTopics"]:
                    if "FirstURL" in topic:
                        urls.append({
                            "url": topic["FirstURL"],
                            "title": topic.get("Text", ""),
                            "snippet": topic.get("Text", "")
                        })
            
            # Evaluate each URL
            for url_data in urls:
                url = url_data["url"]
                if not url or url in seen_urls:
                    continue
                
                seen_urls.add(url)
                
                # Check if URL is likely to contain diagrams
                diagram_indicators = [
                    'github.com' in url.lower(),
                    '.pdf' in url.lower(),
                    'arxiv.org' in url.lower(),
                    'research' in url.lower(),
                    'dataset' in url.lower(),
                    'diagram' in url_data.get("title", "").lower(),
                    'architecture' in url_data.get("title", "").lower(),
                ]
                
                if not any(diagram_indicators):
                    continue
                
                # Calculate similarity score
                title = url_data.get("title", "").lower()
                snippet = url_data.get("snippet", "").lower()
                combined_text = f"{title} {snippet}"
                
                # Keyword match score
                keyword_matches = sum(1 for kw in keywords if kw.lower() in combined_text)
                keyword_score = keyword_matches / max(len(keywords), 1)
                
                # OCR text similarity (simple substring matching)
                ocr_lower = ocr_text.lower()
                ocr_words = set(ocr_lower.split())
                combined_words = set(combined_text.split())
                common_words = ocr_words.intersection(combined_words)
                ocr_score = len(common_words) / max(len(ocr_words), 1) if ocr_words else 0
                
                # Combined confidence
                confidence = (keyword_score * 0.6 + ocr_score * 0.4)
                
                # Only include if confidence > 0.3
                if confidence > 0.3:
                    # Determine reason
                    matched_keywords = [kw for kw in keywords if kw.lower() in combined_text]
                    reason = f"Keywords matched: {', '.join(matched_keywords[:3])}" if matched_keywords else "Contextual match"
                    
                    results.append({
                        "url": url,
                        "title": url_data.get("title", ""),
                        "reason": reason,
                        "confidence": round(confidence, 2)
                    })
        
        # Sort by confidence
        results.sort(key=lambda x: x["confidence"], reverse=True)
        
        # Limit to top 10
        results = results[:10]
        
        logger.info(f"Found {len(results)} potential matches")
        return results
    
    def compute_hash_similarity(self, original_image_path: str, result_url: str) -> Optional[Dict[str, Any]]:
        """
        Step 6 (Optional): Compute hash-based similarity.
        
        Note: This would require downloading images from result URLs,
        which is not implemented here. This is a placeholder.
        
        Args:
            original_image_path: Path to original diagram
            result_url: URL of potential match
            
        Returns:
            Hash match data or None
        """
        if not HASH_AVAILABLE:
            return None
        
        # This would require:
        # 1. Downloading image from result_url
        # 2. Computing hashes
        # 3. Comparing with original
        # 
        # For now, return None as this is optional
        return None
    
    def search_diagram(self, image_path: str) -> Dict[str, Any]:
        """
        Main search function: OCR → Keywords → Queries → API → Results
        
        Args:
            image_path: Path to diagram image
            
        Returns:
            Complete search results
        """
        result = {
            "ocr_text": "",
            "keywords": [],
            "queries": [],
            "api_calls": [],
            "results": [],
            "hash_match": None
        }
        
        # Step 1: OCR Extraction
        logger.info("Step 1: Extracting OCR text...")
        ocr_text = self.extract_ocr_text(image_path)
        result["ocr_text"] = ocr_text
        
        if ocr_text == "no_ocr_text_found":
            logger.warning("No OCR text found in diagram")
            return result
        
        # Step 2: Clean & Normalize
        logger.info("Step 2: Extracting keywords...")
        keywords = self.clean_and_normalize(ocr_text)
        result["keywords"] = keywords
        
        if not keywords:
            logger.warning("No keywords extracted")
            return result
        
        # Step 3: Build Queries
        logger.info("Step 3: Building search queries...")
        queries = self.build_search_queries(keywords, ocr_text)
        result["queries"] = queries
        
        if not queries:
            logger.warning("No search queries generated")
            return result
        
        # Step 4: Build API Calls
        logger.info("Step 4: Building API calls...")
        api_calls = self.build_api_calls(queries)
        result["api_calls"] = api_calls
        
        # Execute API calls (limit to avoid rate limits)
        logger.info("Step 5: Executing API calls...")
        api_results = []
        api_call_count = 0
        max_api_calls = 15  # Limit total API calls
        
        for api_call in api_calls[:max_api_calls]:
            # Add delay between API calls to avoid rate limiting
            if api_call_count > 0:
                delay = 1.0  # 1 second delay between calls
                time.sleep(delay)
            
            api_result = self.search_with_api(api_call)
            api_call_count += 1
            
            if api_result:
                api_results.append(api_result)
            
            # Log progress
            if api_call_count % 5 == 0:
                logger.debug(f"Executed {api_call_count}/{min(len(api_calls), max_api_calls)} API calls")
        
        # Step 5: Interpret Results
        logger.info("Step 6: Interpreting results...")
        results = self.interpret_results(api_results, ocr_text, keywords)
        result["results"] = results
        
        # Step 6: Hash Similarity (optional, not implemented)
        result["hash_match"] = None
        
        return result


def main():
    """CLI entry point"""
    parser = argparse.ArgumentParser(
        description="OCR-based diagram search using free APIs"
    )
    parser.add_argument("image_path", help="Path to diagram image")
    parser.add_argument(
        "--serper-key",
        help="Serper.dev API key (or set SERPER_API_KEY env var)",
        default=None
    )
    parser.add_argument(
        "--google-cse-id",
        help="Google CSE ID (or set GOOGLE_CSE_ID env var)",
        default=None
    )
    parser.add_argument(
        "--log-level",
        choices=['DEBUG', 'INFO', 'WARNING', 'ERROR'],
        default='INFO',
        help="Set logging level (default: INFO)"
    )
    
    args = parser.parse_args()
    
    # Set logging level
    logging.getLogger().setLevel(getattr(logging, args.log_level))
    
    if not OCR_AVAILABLE:
        print(json.dumps({
            "error": "OCR libraries not available. Install with: pip install pytesseract pillow",
            "ocr_text": "no_ocr_text_found",
            "keywords": [],
            "queries": [],
            "api_calls": [],
            "results": [],
            "hash_match": None
        }), file=sys.stderr)
        sys.exit(1)
    
    # Check if Tesseract is available
    try:
        pytesseract.get_tesseract_version()
    except Exception as e:
        error_msg = str(e)
        if "tesseract is not installed" in error_msg.lower() or "not in your path" in error_msg.lower():
            print(json.dumps({
                "error": "Tesseract OCR is not installed or not in PATH. See INSTALL_TESSERACT.md for installation instructions.",
                "ocr_text": "no_ocr_text_found",
                "keywords": [],
                "queries": [],
                "api_calls": [],
                "results": [],
                "hash_match": None,
                "installation_help": {
                    "windows": "choco install tesseract OR download from https://github.com/UB-Mannheim/tesseract/wiki",
                    "macos": "brew install tesseract",
                    "linux": "sudo apt-get install tesseract-ocr"
                }
            }), file=sys.stderr)
            sys.exit(1)
        else:
            logger.warning(f"Tesseract check warning: {e}")
    
    if not Path(args.image_path).exists():
        print(json.dumps({
            "error": f"Image file not found: {args.image_path}",
            "ocr_text": "no_ocr_text_found",
            "keywords": [],
            "queries": [],
            "api_calls": [],
            "results": [],
            "hash_match": None
        }), file=sys.stderr)
        sys.exit(1)
    
    # Initialize searcher
    searcher = OCRDiagramSearcher(
        serper_api_key=args.serper_key,
        google_cse_id=args.google_cse_id
    )
    
    # Perform search
    try:
        result = searcher.search_diagram(args.image_path)
        print(json.dumps(result, indent=2))
        sys.exit(0)
    except Exception as e:
        logger.error(f"Fatal error: {e}")
        import traceback
        logger.error(traceback.format_exc())
        print(json.dumps({
            "error": str(e),
            "ocr_text": "no_ocr_text_found"
        }), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()


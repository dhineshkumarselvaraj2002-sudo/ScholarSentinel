"""
Scholar Sentinel PDF Processing Microservice
Handles PDF text extraction, reference extraction, and figure/diagram extraction
"""

from fastapi import FastAPI, HTTPException, UploadFile, File, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from typing import Optional
from pydantic import BaseModel
from typing import List, Optional, Tuple, Dict, Any
import fitz  # PyMuPDF
import io
import os
import tempfile
from pathlib import Path
import imagehash
from PIL import Image
import json
import re
from pdfminer.high_level import extract_text as pdfminer_extract
from pdfminer.layout import LTTextContainer, LTFigure
import pdfplumber
import logging
import time
import google.generativeai as genai
from dotenv import load_dotenv

# Configure logging first
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load environment variables from .env file
# Look for .env in the parent directory (project root) first, then current directory
try:
    # Get the directory where this script is located
    script_dir = Path(__file__).resolve().parent
    # Look for .env in parent directory (project root)
    parent_env = script_dir.parent / '.env'
    # Also check current directory
    current_env = script_dir / '.env'
    
    if parent_env.exists():
        load_dotenv(parent_env)
        logger.info(f"✓ Loaded .env from project root: {parent_env}")
    elif current_env.exists():
        load_dotenv(current_env)
        logger.info(f"✓ Loaded .env from current directory: {current_env}")
    else:
        # Try loading from current working directory
        load_dotenv()
        logger.info("✓ Attempted to load .env from current working directory")
except Exception as e:
    logger.warning(f"Error loading .env file: {e}")
    # Fallback to default behavior
    load_dotenv()

# Initialize Gemini AI if API key is available
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if GEMINI_API_KEY:
    try:
        genai.configure(api_key=GEMINI_API_KEY)
        logger.info("Gemini AI configured successfully")
    except Exception as e:
        logger.warning(f"Failed to configure Gemini AI: {e}")
        GEMINI_API_KEY = None
else:
    logger.warning("GEMINI_API_KEY not found in environment variables")

app = FastAPI(title="Scholar Sentinel PDF Service", version="1.0.0")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Ensure uploads directory exists
UPLOADS_DIR = Path("uploads")
UPLOADS_DIR.mkdir(exist_ok=True)

class TextExtractionResponse(BaseModel):
    text: str
    pages: int
    metadata: Dict[str, Any]

class Reference(BaseModel):
    order: int
    raw_text: str
    normalized_title: Optional[str] = None
    normalized_authors: Optional[str] = None
    normalized_year: Optional[int] = None
    normalized_doi: Optional[str] = None
    normalized_venue: Optional[str] = None
    ai_extraction: Optional[Dict[str, Any]] = None  # AI extracted data from Gemini

class ReferenceExtractionResponse(BaseModel):
    references: List[Reference]
    count: int

class Figure(BaseModel):
    order: int
    page_number: int
    image_path: str
    perceptual_hash: Optional[str] = None
    width: Optional[int] = None
    height: Optional[int] = None
    caption: Optional[str] = None

class FigureExtractionResponse(BaseModel):
    figures: List[Figure]
    count: int

class ReferenceParser:
    """Enhanced reference parser with better multi-line support"""
    
    # Comprehensive regex patterns
    PATTERNS = {
        'title': {
            # Multi-line title in quotes (CRITICAL for your use case)
            'quoted_multiline': r'["""''](.{10,500}?)["""'']',
            # Single line quoted
            'quoted_single': r'["""'']([^"""''\n]{10,250})["""'']',
            # Title before year (capture everything between comma and year)
            'before_year': r',\s*([A-Z][^,]{15,250}?)\s*,?\s*(?:in|In|Proc\.|pp\.|vol\.|\d{4})',
            # Title after authors (full capture)
            'after_comma': r'(?:et\s+al\.|[A-Z][a-z]+)\s*,\s*([A-Z][^,]{15,250}?)\s*,',
        },
        'authors': {
            # Standard: "V. Banupriya et al."
            'initials': r'^(?:\[\d+\]\s*)?([A-Z]\.\s+[A-Z][a-z]+(?:\s+et\s+al\.)?)',
            # Multiple authors: "V. Banupriya, S. Smith, et al."
            'multiple': r'^(?:\[\d+\]\s*)?([A-Z]\.\s+[A-Z][a-z]+(?:\s*,\s*[A-Z]\.\s+[A-Z][a-z]+)*(?:\s+et\s+al\.)?)',
            # Full names: "John Smith, Jane Doe"
            'full_names': r'^(?:\[\d+\]\s*)?([A-Z][a-z]+\s+[A-Z][a-z]+(?:(?:\s*,\s*|\s+and\s+)[A-Z][a-z]+\s+[A-Z][a-z]+)*)',
            # Last, First: "Smith, J."
            'last_first': r'^(?:\[\d+\]\s*)?([A-Z][a-z]+,\s*[A-Z]\.(?:\s*,\s*[A-Z][a-z]+,\s*[A-Z]\.)*)',
        },
        'year': {
            'in_parens': r'\((\d{4})\)',
            'after_comma': r',\s*(\d{4})\b',
            'anywhere': r'\b((?:19|20)\d{2})\b',
        },
        'doi': {
            'with_prefix': r'doi:\s*(10\.\d{4,}/[^\s,)"]+)',
            'url': r'doi\.org/(10\.\d{4,}/[^\s,)"]+)',
            'standard': r'\b(10\.\d{4,}/[^\s,)"]+)',
        },
        'venue': {
            'conference': r'(?:in|In)\s+Proc\.\s+([^,]{10,150}?)(?:,|\(|\.)',
            'journal': r',\s*([A-Z][^,]{5,100}?),\s*vol\.',
            'after_in': r'\bin\s+([A-Z][^,]{10,100}?)(?:,|\.|\()',
        }
    }
    
    @staticmethod
    def preprocess_text(text: str, preserve_quotes: bool = False) -> str:
        """Preprocess reference text for better matching"""
        if preserve_quotes:
            # Preserve text within quotes but normalize outside
            parts = []
            in_quote = False
            current = []
            
            for char in text:
                if char in '"\'""''':
                    if in_quote:
                        # End quote - keep content as-is but replace newlines with spaces
                        parts.append(''.join(current))
                        current = []
                        in_quote = False
                    else:
                        # Start quote - normalize accumulated text
                        if current:
                            normalized = re.sub(r'\s+', ' ', ''.join(current))
                            parts.append(normalized)
                        current = []
                        in_quote = True
                    parts.append(char)
                elif in_quote:
                    # Inside quotes - keep as-is but replace newlines with spaces
                    if char == '\n':
                        current.append(' ')
                    else:
                        current.append(char)
                else:
                    current.append(char)
            
            # Handle remaining text
            if current:
                if in_quote:
                    parts.append(''.join(current))
                else:
                    normalized = re.sub(r'\s+', ' ', ''.join(current))
                    parts.append(normalized)
            
            return ''.join(parts)
        else:
            # Simple normalization - replace all whitespace with single space
            return re.sub(r'\s+', ' ', text)
    
    @classmethod
    def extract_title(cls, text: str) -> Tuple[Optional[str], str]:
        """Extract title from reference text with confidence level"""
        if not text:
            return None, 'low'
        
        # CRITICAL: First preprocess text to handle line breaks in quotes
        preprocessed = cls.preprocess_text(text, preserve_quotes=True)
        
        logger.debug(f"Original text: {text[:100]}...")
        logger.debug(f"Preprocessed: {preprocessed[:100]}...")
        
        # Method 1: Title in quotes (HIGHEST CONFIDENCE)
        match = re.search(cls.PATTERNS['title']['quoted_multiline'], preprocessed, re.DOTALL)
        if match:
            title = match.group(1).strip()
            title = cls._clean_title(title)
            if cls._is_valid_title(title):
                logger.info(f"✓ Extracted title (quoted, high confidence): {title[:80]}...")
                return title, 'high'
        
        # Method 2: Title before year
        match = re.search(cls.PATTERNS['title']['before_year'], preprocessed, re.IGNORECASE)
        if match:
            title = match.group(1).strip()
            title = cls._clean_title(title)
            if cls._is_valid_title(title):
                logger.info(f"✓ Extracted title (before year, medium confidence): {title[:80]}...")
                return title, 'medium'
        
        # Method 3: Title after comma (after authors)
        match = re.search(cls.PATTERNS['title']['after_comma'], preprocessed, re.IGNORECASE)
        if match:
            title = match.group(1).strip()
            title = cls._clean_title(title)
            if cls._is_valid_title(title):
                logger.info(f"✓ Extracted title (after comma, medium confidence): {title[:80]}...")
                return title, 'medium'
        
        # Method 4: Fallback - find longest meaningful phrase
        phrases = re.split(r'[.,;]', preprocessed)
        candidates = []
        
        for phrase in phrases:
            phrase = phrase.strip()
            if (len(phrase) > 20 and 
                phrase[0].isupper() and 
                not re.match(r'^\d+$', phrase) and
                not re.match(r'^[A-Z]\.\s+[A-Z][a-z]+', phrase)):
                candidates.append(phrase)
        
        if candidates:
            title = max(candidates, key=len)
            title = cls._clean_title(title)
            if cls._is_valid_title(title):
                logger.info(f"✓ Extracted title (fallback, low confidence): {title[:80]}...")
                return title, 'low'
        
        logger.warning(f"✗ Could not extract title from: {text[:100]}...")
        return None, 'low'
    
    @staticmethod
    def _clean_title(title: str) -> str:
        """Clean extracted title"""
        if not title:
            return title
        
        # Remove author names that might be included
        title = re.sub(r'^([A-Z]\.\s+[A-Z][a-z]+(?:\s+et\s+al\.)?),\s*', '', title)
        title = re.sub(r'^([A-Z]\.\s+[A-Z][a-z]+(?:\s*,\s*[A-Z]\.\s+[A-Z][a-z]+)*),\s*', '', title)
        title = re.sub(r'\s+', ' ', title)
        title = re.sub(r'[,;:]+\s*$', '', title)
        
        if len(title) > 300:
            title = title[:300].rsplit(' ', 1)[0]
        
        return title.strip()
    
    @staticmethod
    def _is_valid_title(title: str) -> bool:
        """Check if extracted title is valid"""
        if not title or len(title) < 10:
            return False
        if re.match(r'^[A-Z]\.\s+[A-Z][a-z]+(\s+et\s+al\.)?$', title):
            return False
        if re.match(r'^[\d\s.,;:]+$', title):
            return False
        if len(re.findall(r'[a-zA-Z]', title)) < 5:
            return False
        return True
    
    @classmethod
    def extract_authors(cls, text: str) -> Tuple[Optional[str], str]:
        """Extract authors from reference text"""
        if not text:
            return None, 'low'
        
        clean_text = re.sub(r'^\[\d+\]\s*', '', text)
        
        patterns = [
            (cls.PATTERNS['authors']['multiple'], 'high'),
            (cls.PATTERNS['authors']['initials'], 'high'),
            (cls.PATTERNS['authors']['full_names'], 'medium'),
            (cls.PATTERNS['authors']['last_first'], 'medium'),
        ]
        
        for pattern, confidence in patterns:
            match = re.match(pattern, clean_text)
            if match:
                authors = match.group(1).strip()
                logger.debug(f"Extracted authors ({confidence}): {authors}")
                return authors, confidence
        
        match = re.match(r'^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)', clean_text)
        if match:
            return match.group(1).strip(), 'low'
        
        return None, 'low'
    
    @classmethod
    def extract_year(cls, text: str) -> Tuple[Optional[int], str]:
        """Extract publication year"""
        if not text:
            return None, 'low'
        
        patterns = [
            (cls.PATTERNS['year']['in_parens'], 'high'),
            (cls.PATTERNS['year']['after_comma'], 'medium'),
            (cls.PATTERNS['year']['anywhere'], 'low'),
        ]
        
        for pattern, confidence in patterns:
            match = re.search(pattern, text)
            if match:
                year = int(match.group(1))
                if 1900 <= year <= 2030:
                    return year, confidence
        
        return None, 'low'
    
    @classmethod
    def extract_doi(cls, text: str) -> Optional[str]:
        """Extract DOI"""
        if not text:
            return None
        
        for pattern in ['with_prefix', 'url', 'standard']:
            match = re.search(cls.PATTERNS['doi'][pattern], text, re.IGNORECASE)
            if match:
                return match.group(1)
        
        return None
    
    @classmethod
    def extract_venue(cls, text: str) -> Optional[str]:
        """Extract venue (journal/conference)"""
        if not text:
            return None
        
        for pattern_name in ['conference', 'journal', 'after_in']:
            match = re.search(cls.PATTERNS['venue'][pattern_name], text, re.IGNORECASE)
            if match:
                venue = match.group(1).strip()
                venue = re.sub(r'\s+', ' ', venue)
                return venue
        
        return None

def parse_reference_text(text: str, order: int) -> Reference:
    """
    Parse a reference text string to extract structured information.
    Uses ONLY Gemini AI for title, authors, and year extraction.
    """
    # Extract DOI and venue using regex (these are structured and reliable)
    parser = ReferenceParser()
    doi = parser.extract_doi(text)
    venue = parser.extract_venue(text)
    
    # USE ONLY GEMINI AI for title, authors, and year
    title = None
    authors = None
    year = None
    ai_extraction = None
    
    if GEMINI_API_KEY:
        try:
            ai_data = extract_with_gemini(text)
            if ai_data:
                ai_extraction = {
                    'title': ai_data.get('title'),
                    'authors': ai_data.get('authors', []),
                    'year': ai_data.get('year'),
                }
                
                # Use AI data exclusively
                title = ai_data.get('title')
                if ai_data.get('authors'):
                    authors = ', '.join(ai_data.get('authors', []))
                year = ai_data.get('year')
                
                logger.info(f"✓ AI extracted reference #{order}: title={title[:60] if title else 'N/A'}..., authors={authors or 'N/A'}, year={year or 'N/A'}")
        except Exception as e:
            logger.error(f"Error in AI extraction for reference #{order}: {e}")
    else:
        logger.error(f"GEMINI_API_KEY not configured - cannot extract reference #{order}")
    
    # Create Reference object with AI extraction data
    ref = Reference(
        order=order,
        raw_text=text,
        normalized_title=title,
        normalized_authors=authors,
        normalized_year=year,
        normalized_doi=doi,
        normalized_venue=venue,
        ai_extraction=ai_extraction
    )
    
    return ref

def split_multiple_papers_in_reference(ref_text: str, ref_num: int) -> List[str]:
    """
    Split a reference text that contains multiple papers by the same author.
    Example: "P. Roemmich et al., 'Paper 1', Journal1, 2009. 'Paper 2', Journal2, 2010."
    Returns list of individual paper texts, or empty list if not multiple papers.
    """
    # Pattern to detect multiple papers:
    # 1. Multiple quoted titles (at least 2 quoted strings)
    # 2. Multiple "vol." patterns (indicates multiple journal entries)
    # 3. Pattern: author, "title1", journal1, year. "title2", journal2, year
    
    # Count quoted titles
    quoted_titles = re.findall(r'["""'']([^"""'']{10,200})["""'']', ref_text)
    
    # Count "vol." patterns (journal indicators)
    vol_patterns = len(re.findall(r'\bvol\.', ref_text, re.IGNORECASE))
    
    # Count years (4-digit years)
    years = len(re.findall(r'\b(19|20)\d{2}\b', ref_text))
    
    # If we have 2+ quoted titles AND 2+ vol. patterns OR 2+ years, likely multiple papers
    if len(quoted_titles) >= 2 and (vol_patterns >= 2 or years >= 2):
        logger.debug(f"Reference [{ref_num}] appears to contain multiple papers: {len(quoted_titles)} titles, {vol_patterns} volumes, {years} years")
        
        # Try to split by pattern: quoted title followed by journal/venue info ending with year and period
        # Pattern: "Title", Journal/Conference, vol. X, pp. Y, Year.
        # Match quotes: single quote, double quote, or triple quotes
        # Use triple-quoted raw string to avoid escape sequence warnings
        paper_pattern = r'''[""'\']([^""'\']{10,200})[""'\']\s*,\s*([^,]{5,100}?),\s*(?:vol\.\s*\d+[^.]*?\.|pp\.\s*[^.]*?\.|(?:19|20)\d{2}\.)'''
        
        papers = []
        matches = list(re.finditer(paper_pattern, ref_text, re.DOTALL | re.IGNORECASE))
        
        if len(matches) >= 2:
            # Extract author from beginning of reference
            author_match = re.match(r'^([A-Z]\.\s+[A-Z][a-z]+(?:\s+et\s+al\.)?(?:\s*,\s*[A-Z]\.\s+[A-Z][a-z]+)*)', ref_text)
            author_prefix = author_match.group(1) if author_match else ""
            
            # Split into individual papers
            for i, match in enumerate(matches):
                start_pos = match.start()
                # End position is start of next match, or end of text
                end_pos = matches[i + 1].start() if i + 1 < len(matches) else len(ref_text)
                
                paper_text = ref_text[start_pos:end_pos].strip()
                # Remove trailing period if it's followed by next paper
                if paper_text.endswith('.') and i < len(matches) - 1:
                    paper_text = paper_text[:-1]
                
                # Prepend author if this is not the first paper
                if i > 0 and author_prefix:
                    paper_text = f"{author_prefix}, {paper_text}"
                
                papers.append(paper_text)
            
            if papers:
                logger.info(f"Split reference [{ref_num}] into {len(papers)} papers")
                return papers
    
    return []  # Not multiple papers, return empty list

def extract_references_from_text(text: str) -> List[Reference]:
    """
    Extract references from PDF text using pattern matching.
    Handles cases where multiple papers by the same author are in one section.
    """
    references = []
    
    # Common reference patterns
    # Pattern 1: Numbered references [1], [2], etc. - improved to capture all
    # Match the number and the content until next number or end
    numbered_pattern = r'\[(\d+)\]\s+(.+?)(?=\[\d+\]|$)'
    
    # Pattern 2: Author (Year) format
    author_year_pattern = r'([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s*\((\d{4})\)\s*(.+?)(?=[A-Z][a-z]+\s*\(\d{4}\)|$)'
    
    # Try numbered references first
    # Use DOTALL flag to match across newlines and capture full reference text
    matches = list(re.finditer(numbered_pattern, text, re.DOTALL | re.MULTILINE))
    logger.info(f"Found {len(matches)} potential numbered references in text")
    
    for match in matches:
        ref_num = int(match.group(1))  # Get actual reference number [1], [2], etc.
        ref_text = match.group(2).strip()
        
        # Don't truncate - use full text (minimum length check)
        if len(ref_text) > 15:  # Reduced threshold to catch shorter references
            # Check if this reference contains multiple papers by the same author
            # Pattern: Author et al., "Paper 1", ... "Paper 2", ...
            # Look for multiple quoted titles or multiple "vol." patterns
            multiple_papers = split_multiple_papers_in_reference(ref_text, ref_num)
            
            if multiple_papers:
                # This reference contains multiple papers - add them all
                logger.info(f"Reference [{ref_num}] contains {len(multiple_papers)} papers by same author")
                for idx, paper_text in enumerate(multiple_papers):
                    # Use ref_num for first paper, then ref_num.1, ref_num.2, etc.
                    order = ref_num if idx == 0 else ref_num + (idx * 0.1)
                    ref = parse_reference_text(paper_text, int(order) if order == int(order) else order)
                    references.append(ref)
            else:
                # Single paper reference
                ref = parse_reference_text(ref_text, ref_num)  # Use actual number
                references.append(ref)
        else:
            logger.debug(f"Skipping reference [{ref_num}] - too short: {len(ref_text)} chars")
    
    # Sort by order to ensure correct sequence
    references.sort(key=lambda x: x.order)
    logger.info(f"Extracted {len(references)} references from numbered pattern")
    
    # If no numbered references found, try author-year pattern
    if not references:
        matches = re.finditer(author_year_pattern, text, re.DOTALL | re.MULTILINE)
        for idx, match in enumerate(matches, 1):
            author = match.group(1)
            year = int(match.group(2))
            rest = match.group(3).strip()
            ref_text = f"{author} ({year}) {rest}"
            
            ref = Reference(
                order=idx,
                raw_text=ref_text,
                normalized_authors=author,
                normalized_year=year
            )
            references.append(ref)
    
    return references

def extract_title(text: str) -> Optional[str]:
    """Extract title from first page - improved to capture full multi-line titles"""
    lines = [line.strip() for line in text.split('\n') if line.strip()]
    
    # Skip header/footer lines
    skip_patterns = [
        r'XXX|©|IEEE|ACM|Springer',
        r'^\d+\s*$',  # Page numbers
        r'^Abstract|^Keywords|^Introduction',
        r'@.*\.(edu|com|org)',  # Email addresses
        r'http[s]?://',  # URLs
    ]
    
    title_lines = []
    found_title_start = False
    
    for i, line in enumerate(lines):
        # Skip lines matching skip patterns
        if any(re.search(pattern, line, re.IGNORECASE) for pattern in skip_patterns):
            continue
        
        # Look for potential title line (long enough, not author name pattern)
        is_potential_title = (
            len(line) > 15 and 
            not re.match(r'^[A-Z][a-z]+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?$', line) and  # Not just author name
            not re.match(r'^[A-Z][a-z]+\s+[A-Z]\.\s+[A-Z][a-z]+$', line) and  # Not "First M. Last"
            not re.search(r'\d{4}|\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}', line)  # Not dates
        )
        
        if is_potential_title:
            if not found_title_start:
                found_title_start = True
                title_lines = [line]
            else:
                # Continue collecting title lines
                # Stop if we hit author pattern, email, or affiliation
                if (re.match(r'^[A-Z][a-z]+\s+[A-Z]', line) or 
                    '@' in line or 
                    'University' in line or 
                    'College' in line or
                    'Department' in line):
                    break
                title_lines.append(line)
        
        # If we've found title and hit a blank line or author pattern, stop
        elif found_title_start:
            if not line or re.match(r'^[A-Z][a-z]+\s+[A-Z]', line):
                break
            # Continue if line looks like continuation of title
            if len(line) > 10 and not re.search(r'@|http|doi', line, re.IGNORECASE):
                title_lines.append(line)
            else:
                break
    
    if title_lines:
        title = ' '.join(title_lines).strip()
        # Clean up title (remove extra spaces, fix punctuation)
        title = re.sub(r'\s+', ' ', title)
        # Remove trailing punctuation that might be from line breaks
        title = re.sub(r'[.,;:]+\s*$', '', title)
        # Limit to reasonable length (titles are usually < 300 chars)
        if len(title) > 300:
            title = title[:300].rsplit(' ', 1)[0]  # Cut at last word boundary
        return title if len(title) > 10 else None
    
    return None

def extract_authors(text: str) -> List[str]:
    """Extract author names"""
    lines = text.split('\n')
    authors = []
    
    for line in lines:
        # Match author pattern: FirstName LastName or FirstName MiddleInitial LastName
        if re.match(r'^[A-Z][a-z]+\s+[A-Z][\w]*$', line.strip()):
            authors.append(line.strip())
        # Stop at institutional affiliations or emails
        if '@' in line or 'Engineering' in line:
            break
            
    return authors[:10]  # Limit to reasonable number

def extract_year(text: str) -> Optional[int]:
    """Extract publication year"""
    # Look for dates in format: Month DD, YYYY
    date_match = re.search(r'\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},\s+(20\d{2})\b', text)
    if date_match:
        return int(date_match.group(2))
    
    # Look for any 4-digit year
    year_match = re.search(r'\b(20\d{2})\b', text)
    return int(year_match.group(1)) if year_match else None

def extract_with_gemini(text: str, api_key: Optional[str] = None) -> Dict[str, Any]:
    """Extract title, authors, and year from a reference text using ONLY Gemini AI"""
    # Use provided API key or fall back to global GEMINI_API_KEY
    gemini_key = api_key or GEMINI_API_KEY
    if not gemini_key:
        logger.debug("GEMINI_API_KEY not available, skipping AI extraction")
        return {}
    
    # Use fastest model only for maximum speed
    # gemini-2.5-flash is the fastest model available
    model_name = 'gemini-2.5-flash'
    
    model = None
    model_name_used = None
    response = None
    last_error = None
    
    # Create prompt for individual reference extraction
    # Optimize: Reduce text sample for faster processing (3000 chars is usually enough for a single reference)
    text_sample = text[:3000]
    
    # Generation config optimized for speed
    generation_config = {
        'temperature': 0.1,  # Lower temperature for faster, more deterministic responses
        'top_p': 0.95,       # Faster sampling
        'top_k': 40,         # Limit candidate tokens for speed
        'max_output_tokens': 1024,  # Limit output for faster responses
    }
    prompt = f"""Analyze the following research paper reference text and extract bibliographic information.

Text:
{text_sample}

Return a valid JSON object with these exact keys: title, authors (as a list of strings), year (as integer).

Required JSON structure:
{{
    "title": "exact paper title",
    "authors": ["First Author Name", "Second Author Name"],
    "year": 2024
}}

Important:
- Extract the COMPLETE title, even if it spans multiple lines or contains special characters
- Extract ALL author names as a list (handle "et al." appropriately)
- Extract the publication year (not creation date or submission date)
- Keep titles exactly as written
- Return valid JSON only, no extra text, no markdown formatting"""
    
    # Configure Gemini with the API key
    try:
        genai.configure(api_key=gemini_key)
    except Exception as e:
        logger.warning(f"Failed to configure Gemini AI with provided key: {e}")
        return {}
    
    # Use fastest model with speed-optimized config
    try:
        model = genai.GenerativeModel(
            model_name,
            generation_config=generation_config
        )
        logger.debug(f"Using high-speed Gemini model: {model_name}")
        
        # Generate content with timing for performance monitoring
        start_time = time.time()
        response = model.generate_content(prompt)
        elapsed_time = time.time() - start_time
        model_name_used = model_name
        logger.info(f"✓ Successfully used Gemini model: {model_name} (took {elapsed_time:.2f}s)")
    except Exception as e:
        logger.warning(f"High-speed model {model_name} failed: {str(e)[:100]}, trying fallback...")
        last_error = e
        # Fallback to gemini-2.0-flash if 2.5-flash fails
        try:
            model_name = 'gemini-2.0-flash'
            model = genai.GenerativeModel(
                model_name,
                generation_config=generation_config
            )
            start_time = time.time()
            response = model.generate_content(prompt)
            elapsed_time = time.time() - start_time
            model_name_used = model_name
            logger.info(f"✓ Using fallback model: {model_name} (took {elapsed_time:.2f}s)")
        except Exception as e2:
            logger.error(f"All Gemini models failed. Last error: {e2}")
            return {}
    
    if model is None or response is None:
        logger.error(f"Failed to generate content. Last error: {last_error}")
        return {}
    
    try:
        # Response already generated during model selection above
        response_text = response.text.strip()
        
        # Clean up response (remove markdown code blocks if present)
        if response_text.startswith("```json"):
            response_text = response_text[7:]
        if response_text.startswith("```"):
            response_text = response_text[3:]
        if response_text.endswith("```"):
            response_text = response_text[:-3]
        response_text = response_text.strip()
        
        # Parse JSON response
        gemini_data = json.loads(response_text)
        
        logger.debug(f"Gemini AI extracted: title={gemini_data.get('title')}, authors={len(gemini_data.get('authors', []))} authors, year={gemini_data.get('year')}")
        
        return {
            'title': gemini_data.get('title'),
            'authors': gemini_data.get('authors', []),
            'year': gemini_data.get('year')
        }
    except json.JSONDecodeError as e:
        logger.warning(f"Failed to parse Gemini AI JSON response: {e}")
        logger.debug(f"Response was: {response_text[:200] if 'response_text' in locals() else 'N/A'}")
        return {}
    except Exception as e:
        logger.warning(f"Error using Gemini AI for extraction: {str(e)}")
        return {}

def extract_references_with_gemini(full_text: str, doc=None, api_key: Optional[str] = None) -> List[Reference]:
    """
    Extract all references from PDF using Gemini AI.
    If doc is provided, extracts text only from the references page(s).
    """
    # Use provided API key or fall back to global GEMINI_API_KEY
    gemini_key = api_key or GEMINI_API_KEY
    if not gemini_key:
        logger.warning("GEMINI_API_KEY not available, cannot use AI for reference extraction")
        return []
    
    # Use fastest model only for maximum speed
    # gemini-2.5-flash is the fastest model available
    model_name = 'gemini-2.5-flash'
    
    model = None
    response = None
    last_error = None
    
    # Generation config optimized for speed
    generation_config = {
        'temperature': 0.1,  # Lower temperature for faster, more deterministic responses
        'top_p': 0.95,       # Faster sampling
        'top_k': 40,         # Limit candidate tokens for speed
        'max_output_tokens': 8192,  # Higher limit for multiple references, but still bounded
    }
    
    # If doc is provided, extract only the references page(s)
    ref_section = ""
    if doc is not None:
        logger.info("Extracting text only from references page(s)...")
        page_count = len(doc)
        references_pages_text = ""
        references_start_page = None
        
        # Find the page(s) that contain "References" or "Bibliography"
        pages_processed = set()  # Track which pages we've already processed
        
        for page_num in range(page_count):
            # Skip if we've already processed this page
            if page_num in pages_processed:
                continue
                
            page = doc[page_num]
            page_text = page.get_text("text", flags=11)
            
            # Check if this page contains references header
            if re.search(r'References?|Bibliography|Works\s+Cited', page_text, re.IGNORECASE):
                if references_start_page is None:
                    references_start_page = page_num
                    logger.info(f"Found references starting at page {page_num + 1}")
                
                # Add this page
                references_pages_text += page_text
                pages_processed.add(page_num)
                logger.debug(f"Added page {page_num + 1} to references text ({len(page_text)} chars)")
                
                # Check the next page to see if references continue
                if page_num + 1 < page_count and (page_num + 1) not in pages_processed:
                    next_page = doc[page_num + 1]
                    next_page_text = next_page.get_text("text", flags=11)
                    # Check if next page has reference-like content (numbered references, author names, etc.)
                    # Look for patterns like [1], [2] or numbered references at the start
                    if re.search(r'\[\d+\]|^\d+\.\s+[A-Z]', next_page_text[:500], re.MULTILINE):
                        references_pages_text += next_page_text
                        pages_processed.add(page_num + 1)
                        logger.info(f"References continue on page {page_num + 2}, added to extraction")
                        logger.debug(f"Added page {page_num + 2} to references text ({len(next_page_text)} chars)")
                        
                        # Continue checking subsequent pages (up to 2 more pages) to see if references continue
                        for next_page_num in range(page_num + 2, min(page_num + 4, page_count)):
                            if next_page_num in pages_processed:
                                continue
                            next_page = doc[next_page_num]
                            next_page_text = next_page.get_text("text", flags=11)
                            # Check if this page looks like it contains references
                            if re.search(r'\[\d+\]|^\d+\.\s+[A-Z]|et al\.', next_page_text[:500], re.MULTILINE):
                                references_pages_text += next_page_text
                                pages_processed.add(next_page_num)
                                logger.debug(f"Added page {next_page_num + 1} to references text ({len(next_page_text)} chars)")
                            else:
                                # Stop if we hit a page that doesn't look like references
                                break
        
        if references_pages_text:
            ref_section = references_pages_text
            logger.info(f"✓ Extracted {len(ref_section)} chars from references page(s) (starting from page {references_start_page + 1 if references_start_page is not None else 'unknown'})")
        else:
            # Fallback: use last 3 pages if no references header found
            logger.warning("No references header found, using last 3 pages")
            for page_num in range(max(0, page_count - 3), page_count):
                page = doc[page_num]
                ref_section += page.get_text("text", flags=11)
            logger.info(f"Extracted {len(ref_section)} chars from last 3 pages")
    
    # If no doc provided or extraction failed, fall back to text-based extraction
    if not ref_section:
        logger.info("Falling back to text-based references section extraction")
        ref_section_patterns = [
            r'References?\s*\n(.+)',
            r'Bibliography\s*\n(.+)',
            r'Works\s+Cited\s*\n(.+)',
        ]
        
        for pattern in ref_section_patterns:
            match = re.search(pattern, full_text, re.IGNORECASE | re.DOTALL)
            if match:
                ref_section = match.group(1)
                logger.info(f"Found references section using pattern: {pattern[:30]}...")
            break
    
        # If still no references section found, use last 60% of text
        if not ref_section:
            ref_section = full_text[-int(len(full_text) * 0.6):]
            logger.info(f"No references section header found, using last 60% of text ({len(ref_section)} chars)")
    
    if not ref_section:
        logger.error("Could not extract references section from PDF")
        return []
    
    # Use references section - CRITICAL: Use ALL of it, don't truncate from the end
    # References are on the last pages, so we MUST include all content from those pages
    # Only limit if it's extremely long (over 50000 chars), otherwise use all of it
    if ref_section:
        # Use all of ref_section unless it's extremely long
        if len(ref_section) > 50000:
            logger.warning(f"Reference section is very long ({len(ref_section)} chars), using last 50000 chars")
            text_sample = ref_section[-50000:]  # Take from the END to ensure we get last pages
        else:
            text_sample = ref_section  # Use ALL of it
            logger.info(f"Using full reference section: {len(text_sample)} chars")
    else:
        # Fallback: use last 50000 chars from full text to ensure we get last pages
        text_sample = full_text[-50000:] if len(full_text) > 50000 else full_text
        logger.info(f"Using last {len(text_sample)} chars from full text (last pages)")
    
    logger.info(f"Using text sample of {len(text_sample)} chars for AI extraction (from {len(ref_section) if ref_section else len(full_text)} total chars, full text is {len(full_text)} chars)")
    
    # Log a preview of the text sample to help debug
    if len(text_sample) > 500:
        logger.debug(f"Text sample preview (first 500 chars): {text_sample[:500]}...")
        logger.debug(f"Text sample preview (last 500 chars): ...{text_sample[-500:]}")
    
    prompt = f"""Analyze the following research paper text and extract ALL references.

Text:

{text_sample}

Return a JSON array containing ALL references found in the text.

Required JSON structure:

{{
  "references": [
    {{
      "title": "exact paper title",
      "authors": "all authors, comma-separated",
      "year": "publication year",
      "conference": "conference name (if conference paper, otherwise null)",
      "journal": "journal name (if journal paper, otherwise null)",
      "type": "journal | conference | book | thesis | report | dataset | website | standard | other"
    }}
  ]
}}

Extraction Rules (IMPORTANT):
- Extract EVERY reference that appears in the text (journal, conference, book, thesis, report, dataset, website, standard, etc.)
- If references are numbered [1] through [20] (or more), you MUST extract ALL of them.
- DO NOT skip any reference for any reason.

Title extraction:
- Capture the COMPLETE title exactly as written.
- Titles may span multiple lines; include all lines until the ending quote.
- Do not rewrite, shorten, or correct titles.

Author extraction:
- Extract ALL authors exactly as written, in the same order.

Publication year:
- Extract the 4-digit year that belongs to the reference.

Conference extraction:
- If the reference contains "in Proc.", "Proceedings", "Conference", "Symposium", etc., extract the full conference name.
- If not a conference paper, set `"conference": null`.

Journal extraction:
- If the reference contains a journal name (e.g., IEEE Transactions…, Nature…, Marine Science…), extract it fully.
- If not a journal paper, set `"journal": null`.

Reference type classification:
- Determine the type strictly based on the content:
  - "journal" → peer-reviewed journal
  - "conference" → conference/workshop/symposium proceedings
  - "book" → books, book chapters, or edited volumes
  - "thesis" → master's thesis or Ph.D. dissertation
  - "report" → technical reports, government reports, institutional papers
  - "dataset" → dataset papers, repositories, releases
  - "website" → URLs, online sources
  - "standard" → IEEE standards, ISO standards, RFCs
  - "other" → anything that does not match above categories

Output rules:
- Return ONLY valid JSON
- No markdown, no explanations, no surrounding text

CRITICAL:
- Continue extracting references until you've captured EVERY numbered reference in the text.
- Do not stop early, even if references span multiple lines or use unusual formatting.
- This extraction must be exhaustive.

IMPORTANT - Multiple papers by same author in single reference:
- Sometimes a single reference entry contains multiple papers by the same author.
- Example: "P. Roemmich et al., 'The Argo Program: Observing the global ocean with profiling floats,' Oceanography, vol. 22, no. 2, pp. 34–43, 2009. 'Dynamic Spatial Transformer for Traffic Forecasting With Low-Rank Attention,' IEEE Transactions on Intelligent Transportation Systems, vol. 25, no. 11, pp. 16323..."
- In such cases, extract EACH paper as a SEPARATE reference entry in the JSON array.
- The author name may only appear once at the beginning, but you should extract each paper separately with the same author.
- Look for patterns like: multiple quoted titles, multiple "vol." indicators, or multiple years in a single reference entry.
- Each paper should have its own complete entry with title, authors, year, journal/conference, and type."""
    
    # Configure Gemini with the API key
    try:
        genai.configure(api_key=gemini_key)
    except Exception as e:
        logger.warning(f"Failed to configure Gemini AI with provided key: {e}")
        return []
    
    # Use fastest model with speed-optimized config
    try:
        model = genai.GenerativeModel(
            model_name,
            generation_config=generation_config
        )
        logger.debug(f"Using high-speed Gemini model for reference extraction: {model_name}")
        
        # Generate content with timing for performance monitoring
        start_time = time.time()
        response = model.generate_content(prompt)
        elapsed_time = time.time() - start_time
        logger.info(f"✓ Successfully used Gemini model for reference extraction: {model_name} (took {elapsed_time:.2f}s)")
    except Exception as e:
        logger.warning(f"High-speed model {model_name} failed: {str(e)[:100]}, trying fallback...")
        last_error = e
        # Fallback to gemini-2.0-flash if 2.5-flash fails
        try:
            model_name = 'gemini-2.0-flash'
            model = genai.GenerativeModel(
                model_name,
                generation_config=generation_config
            )
            start_time = time.time()
            response = model.generate_content(prompt)
            elapsed_time = time.time() - start_time
            logger.info(f"✓ Using fallback model for reference extraction: {model_name} (took {elapsed_time:.2f}s)")
        except Exception as e2:
            logger.error(f"All Gemini models failed for reference extraction. Last error: {e2}")
            return []
    
    if model is None or response is None:
        logger.error(f"Failed to generate content for reference extraction. Last error: {last_error}")
        return []
    
    try:
        # Parse response
        response_text = response.text.strip()
        
        # Clean up response (remove markdown code blocks if present)
        if response_text.startswith("```json"):
            response_text = response_text[7:]
        if response_text.startswith("```"):
            response_text = response_text[3:]
        if response_text.endswith("```"):
            response_text = response_text[:-3]
        response_text = response_text.strip()
        
        # Parse JSON response
        gemini_data = json.loads(response_text)
        
        # Convert to Reference objects
        references = []
        if gemini_data.get('references'):
            num_refs = len(gemini_data['references'])
            logger.info(f"AI returned {num_refs} references")
            
            # Check if we got fewer references than expected (warn if less than 15)
            if num_refs < 15:
                logger.warning(f"⚠ AI only returned {num_refs} references - this might be incomplete. Expected 20 references.")
            
            for idx, ref_data in enumerate(gemini_data['references'], 1):
                # Parse authors string to list
                authors_str = ref_data.get('authors', '')
                authors_list = [a.strip() for a in authors_str.split(',') if a.strip()] if authors_str else []
                
                # Convert year to int if it's a string
                year = ref_data.get('year')
                if isinstance(year, str):
                    try:
                        year = int(year)
                    except ValueError:
                        year = None
                elif year is not None:
                    try:
                        year = int(year)
                    except (ValueError, TypeError):
                        year = None
                
                # Get venue (conference or journal)
                venue = ref_data.get('conference') or ref_data.get('journal')
                
                # Get reference type
                ref_type = ref_data.get('type', 'other')
                
                ref = Reference(
                    order=idx,
                    raw_text=f"{ref_data.get('authors', '')} ({ref_data.get('year', '')}) {ref_data.get('title', '')}",
                    normalized_title=ref_data.get('title'),
                    normalized_authors=', '.join(authors_list) if authors_list else None,
                    normalized_year=year,
                    normalized_doi=None,
                    normalized_venue=venue,
                    ai_extraction={
                        'title': ref_data.get('title'),
                        'authors': authors_list,
                        'year': year,
                        'conference': ref_data.get('conference'),
                        'journal': ref_data.get('journal'),
                        'type': ref_type
                    }
                )
                references.append(ref)
            
            logger.info(f"✓ Successfully converted {len(references)} references from AI extraction")
        
        logger.info(f"✓ Gemini AI extracted {len(references)} total references")
        return references
        
    except json.JSONDecodeError as e:
        logger.warning(f"Failed to parse Gemini AI JSON response for references: {e}")
        logger.debug(f"Response was: {response_text[:200] if 'response_text' in locals() else 'N/A'}")
        return []
    except Exception as e:
        logger.warning(f"Error processing Gemini AI reference extraction: {str(e)}")
        return []

def robust_pdf_parser(pdf_path: str, api_key: Optional[str] = None) -> Dict[str, Any]:
    """Extract title, authors, and year using ONLY Gemini AI"""
    result = {
        'title': None,
        'authors': [],
        'year': None,
        'metadata': {},
        'ai_extraction': None  # Store AI extraction data separately
    }
    
    # Use provided API key or fall back to global GEMINI_API_KEY
    gemini_key = api_key or GEMINI_API_KEY
    
    try:
        with pdfplumber.open(pdf_path) as pdf:
            if len(pdf.pages) > 0:
                first_page_text = pdf.pages[0].extract_text()
                if first_page_text:
                    # USE ONLY GEMINI AI - No manual extraction
                    if gemini_key:
                        try:
                            gemini_data = extract_with_gemini(first_page_text, api_key=gemini_key)
                            if gemini_data:
                                result['ai_extraction'] = gemini_data
                                
                                # Use Gemini AI results exclusively
                                if gemini_data.get('title'):
                                    result['title'] = gemini_data['title']
                                    logger.info(f"✓ Gemini AI extracted title: {result['title'][:80]}...")
                                
                                if gemini_data.get('authors'):
                                    result['authors'] = gemini_data['authors']
                                    logger.info(f"✓ Gemini AI extracted authors: {result['authors']}")
                                
                                if gemini_data.get('year'):
                                    result['year'] = gemini_data['year']
                                    logger.info(f"✓ Gemini AI extracted year: {result['year']}")
                        except Exception as e:
                            logger.error(f"Gemini AI extraction failed: {e}")
                            logger.warning("No fallback extraction - AI is required")
                    else:
                        logger.error("GEMINI_API_KEY not configured - AI extraction required")
            
            # Get PDF metadata (for reference only, not used for extraction)
            if pdf.metadata:
                result['metadata'] = {
                    'title': pdf.metadata.get('Title', ''),
                    'author': pdf.metadata.get('Author', ''),
                    'subject': pdf.metadata.get('Subject', ''),
                    'creator': pdf.metadata.get('Creator', ''),
                    'producer': pdf.metadata.get('Producer', ''),
                    'creationDate': str(pdf.metadata.get('CreationDate', '')),
                    'modDate': str(pdf.metadata.get('ModDate', '')),
                }
    except Exception as e:
        logger.warning(f"Error in robust_pdf_parser: {str(e)}")
    
    return result

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "pdf-processor"}

@app.post("/extract-text", response_model=TextExtractionResponse)
async def extract_text(
    file: UploadFile = File(...),
    x_gemini_api_key: Optional[str] = Header(None, alias="X-Gemini-API-Key")
):
    """
    Extract text from PDF file.
    Accepts optional X-Gemini-API-Key header for AI extraction.
    """
    doc = None
    temp_file = None
    try:
        # Read file content
        content = await file.read()
        # Ensure we have bytes
        if isinstance(content, str):
            content = content.encode('latin-1')
        
        # Use temporary file for more reliable PDF handling
        # PyMuPDF sometimes has issues with BytesIO streams
        with tempfile.NamedTemporaryFile(delete=False, suffix='.pdf') as temp_file:
            temp_file.write(content)
            temp_file_path = temp_file.name
        
        # Open PDF with PyMuPDF using file path
        doc = fitz.open(temp_file_path)
        
        # Extract text from all pages
        full_text = ""
        page_count = len(doc)
        for page_num in range(page_count):
            page = doc[page_num]
            full_text += page.get_text()
        
        # Get metadata
        metadata = doc.metadata
        
        # Use robust PDF parser to extract title, authors, year from first page
        # Pass API key from header if provided, otherwise use env variable
        api_key = x_gemini_api_key or GEMINI_API_KEY
        robust_data = robust_pdf_parser(temp_file_path, api_key=api_key)
        
        # Combine PyMuPDF metadata with robust extraction (prioritize AI extraction)
        combined_metadata = {
            "title": robust_data.get('title') or metadata.get("title", ""),
                "author": metadata.get("author", ""),
            "authors": robust_data.get('authors', []),
            "year": robust_data.get('year'),
                "subject": metadata.get("subject", ""),
                "creator": metadata.get("creator", ""),
                "producer": metadata.get("producer", ""),
                "creationDate": metadata.get("creationDate", ""),
                "modDate": metadata.get("modDate", ""),
            "ai_extraction": robust_data.get('ai_extraction'),  # Include AI extraction data
        }
        
        # Get page count before closing
        result = TextExtractionResponse(
            text=full_text,
            pages=page_count,
            metadata=combined_metadata
        )
        
        return result
    except Exception as e:
        logger.error(f"Error extracting text: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error extracting text: {str(e)}")
    finally:
        if doc:
            doc.close()
        # Clean up temporary file
        if 'temp_file_path' in locals() and os.path.exists(temp_file_path):
            try:
                os.unlink(temp_file_path)
            except Exception as e:
                logger.warning(f"Failed to delete temp file: {e}")

@app.post("/extract-references", response_model=ReferenceExtractionResponse)
async def extract_references(
    file: UploadFile = File(...),
    x_gemini_api_key: Optional[str] = Header(None, alias="X-Gemini-API-Key")
):
    """
    Extract references from PDF file.
    Accepts optional X-Gemini-API-Key header for AI extraction.
    """
    doc = None
    temp_file_path = None
    try:
        # Read file content
        content = await file.read()
        # Ensure we have bytes
        if isinstance(content, str):
            content = content.encode('latin-1')
        
        # Use temporary file for more reliable PDF handling
        with tempfile.NamedTemporaryFile(delete=False, suffix='.pdf') as temp_file:
            temp_file.write(content)
            temp_file_path = temp_file.name
        
        # Open PDF with PyMuPDF using file path
        doc = fitz.open(temp_file_path)
        
        # Extract text from all pages
        # Use get_text with flags to preserve formatting and get full text
        full_text = ""
        page_count = len(doc)
        logger.info(f"PDF has {page_count} pages")
        
        # Extract text from all pages
        for page_num in range(page_count):
            page = doc[page_num]
            # flags=11 preserves layout and ensures full text extraction
            page_text = page.get_text("text", flags=11)
            full_text += page_text
            # Log last few pages to ensure we're getting them
            if page_num >= page_count - 3:
                logger.debug(f"Page {page_num + 1} text length: {len(page_text)} chars")
        
        logger.info(f"Total extracted text length: {len(full_text)} characters")
        
        references = []
        
        # Use API key from header if provided, otherwise use env variable
        api_key = x_gemini_api_key or GEMINI_API_KEY
        
        # Try AI extraction first if available (uses the new prompt)
        # Optimize: Only use AI if we have a good references section, otherwise skip to regex
        if api_key:
            try:
                # Quick check: if text is too short, skip AI and use regex
                if len(full_text) > 1000:  # Only use AI for substantial papers
                    logger.info("Attempting to extract references using Gemini AI...")
                    logger.info(f"Full text length: {len(full_text)} characters")
                    # Pass the doc object and API key so we can extract only the references page(s)
                    ai_references = extract_references_with_gemini(full_text, doc=doc, api_key=api_key)
                    if ai_references and len(ai_references) > 0:
                        references = ai_references
                        logger.info(f"✓ Successfully extracted {len(references)} references using Gemini AI")
                        # Only use regex fallback if we get less than 10 references (minimum threshold)
                        if len(references) < 10:
                            logger.warning(f"⚠ Only {len(references)} references extracted - minimum expected is 10. Falling back to regex extraction.")
                            references = []  # Clear and use regex fallback
                        else:
                            logger.info(f"✓ Extracted {len(references)} references (meets minimum threshold of 10)")
                    else:
                        logger.info("AI extraction returned no references, falling back to regex extraction")
                else:
                    logger.debug("Text too short, skipping AI extraction")
            except Exception as e:
                logger.warning(f"AI reference extraction failed: {e}, falling back to regex extraction")
        
        # Fallback to regex-based extraction if AI didn't work or not available
        if not references:
            # Look for references section
            # References are usually at the end
            ref_section_patterns = [
                r'References?\s*\n(.+)',
                r'Bibliography\s*\n(.+)',
                r'Works\s+Cited\s*\n(.+)',
            ]
            
            ref_section = ""
            for pattern in ref_section_patterns:
                match = re.search(pattern, full_text, re.IGNORECASE | re.DOTALL)
                if match:
                    ref_section = match.group(1)
                    break
            
            # If no references section found, try last 60% of text (increased to catch all references from last pages)
            if not ref_section:
                ref_section = full_text[-int(len(full_text) * 0.6):]
                logger.info(f"No references section header found in regex fallback, using last 60% of text")
                logger.info(f"This ensures we capture content from the last pages where references are located")
            
            # Log reference section extraction for debugging
            logger.info(f"Extracting references from text using regex (length: {len(ref_section)})")
            if ref_section:
                logger.info(f"Reference section preview: {ref_section[:200]}...")
            
            # Extract references from text using regex
            references = extract_references_from_text(ref_section)
            logger.info(f"Extracted {len(references)} references using regex")
        
        return ReferenceExtractionResponse(
            references=references,
            count=len(references)
        )
    except Exception as e:
        logger.error(f"Error extracting references: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error extracting references: {str(e)}")
    finally:
        if doc:
            doc.close()
        # Clean up temporary file
        if temp_file_path and os.path.exists(temp_file_path):
            try:
                os.unlink(temp_file_path)
            except Exception as e:
                logger.warning(f"Failed to delete temp file: {e}")

@app.post("/extract-figures", response_model=FigureExtractionResponse)
async def extract_figures(file: UploadFile = File(...)):
    """
    Extract figures/images from PDF file and generate perceptual hashes.
    """
    doc = None
    temp_file_path = None
    try:
        # Read file content
        content = await file.read()
        # Ensure we have bytes
        if isinstance(content, str):
            content = content.encode('latin-1')
        
        # Use temporary file for more reliable PDF handling
        with tempfile.NamedTemporaryFile(delete=False, suffix='.pdf') as temp_file:
            temp_file.write(content)
            temp_file_path = temp_file.name
        
        # Open PDF with PyMuPDF using file path
        doc = fitz.open(temp_file_path)
        
        figures = []
        figure_counter = 0
        
        # Create figures directory for this PDF
        pdf_id = file.filename.replace(".pdf", "").replace(" ", "_") if file.filename else "unknown"
        figures_dir = UPLOADS_DIR / "figures" / pdf_id
        figures_dir.mkdir(parents=True, exist_ok=True)
        
        page_count = len(doc)
        for page_num in range(page_count):
            page = doc[page_num]
            
            # Get images on this page
            image_list = page.get_images()
            
            for img_idx, img in enumerate(image_list):
                try:
                    # Get image data
                    xref = img[0]
                    base_image = doc.extract_image(xref)
                    image_bytes = base_image["image"]
                    image_ext = base_image["ext"]
                    
                    # Save image
                    image_filename = f"page_{page_num+1}_img_{img_idx+1}.{image_ext}"
                    image_path = figures_dir / image_filename
                    
                    with open(image_path, "wb") as img_file:
                        img_file.write(image_bytes)
                    
                    # Generate perceptual hash
                    try:
                        pil_image = Image.open(io.BytesIO(image_bytes))
                        phash = str(imagehash.phash(pil_image))
                    except Exception as e:
                        logger.warning(f"Could not generate hash for image: {e}")
                        phash = None
                    
                    # Get image dimensions
                    width = base_image.get("width")
                    height = base_image.get("height")
                    
                    # Try to find caption (look for "Figure X" or "Fig. X" near the image)
                    caption = None
                    # This is a simplified approach - can be enhanced
                    
                    figure = Figure(
                        order=figure_counter + 1,
                        page_number=page_num + 1,
                        image_path=str(image_path.relative_to(UPLOADS_DIR)),
                        perceptual_hash=phash,
                        width=width,
                        height=height,
                        caption=caption
                    )
                    
                    figures.append(figure)
                    figure_counter += 1
                    
                except Exception as e:
                    logger.warning(f"Error processing image {img_idx} on page {page_num}: {e}")
                    continue
        
        return FigureExtractionResponse(
            figures=figures,
            count=len(figures)
        )
    except Exception as e:
        logger.error(f"Error extracting figures: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error extracting figures: {str(e)}")
    finally:
        if doc:
            doc.close()
        # Clean up temporary file
        if temp_file_path and os.path.exists(temp_file_path):
            try:
                os.unlink(temp_file_path)
            except Exception as e:
                logger.warning(f"Failed to delete temp file: {e}")

if __name__ == "__main__":
    import uvicorn
    import sys
    from pathlib import Path
    
    # Ensure we can import main module regardless of where script is run from
    current_dir = Path(__file__).parent.absolute()
    
    # Add current directory to Python path
    if str(current_dir) not in sys.path:
        sys.path.insert(0, str(current_dir))
    
    # Change to the script's directory to ensure relative imports work
    original_cwd = Path.cwd()
    try:
        os.chdir(current_dir)
        
        # Verify app is available
        if not hasattr(sys.modules[__name__], 'app'):
            raise ImportError("Could not find 'app' in main module")
        logger.info("✓ App object is available")
        
        try:
            uvicorn.run(
                app,  # Use app object directly for better reliability
                host="0.0.0.0",
                port=8000,
                reload=False,
                log_level="info"
            )
        except KeyboardInterrupt:
            logger.info("Server stopped by user")
        except Exception as e:
            logger.error(f"Server error: {e}")
            raise
    finally:
        # Restore original working directory
        os.chdir(original_cwd)


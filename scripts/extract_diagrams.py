"""
Diagram Extraction Script for PDF Processing
Extracts embedded images and renders vector diagrams from PDFs,
computes perceptual hashes (pHash), and detects duplicates.
"""

import sys
import json
import os
import argparse
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple
import fitz  # PyMuPDF
from PIL import Image
import imagehash
import io
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class DiagramExtractor:
    """Extracts diagrams/images from PDFs and computes perceptual hashes"""
    
    def __init__(self, pdf_path: str, output_dir: str, job_id: str):
        """
        Initialize the diagram extractor.
        
        Args:
            pdf_path: Path to the input PDF file
            output_dir: Base directory for output (will create subdirectory for job_id)
            job_id: Unique identifier for this extraction job
        """
        self.pdf_path = Path(pdf_path)
        self.job_id = job_id
        self.output_dir = Path(output_dir) / job_id
        self.output_dir.mkdir(parents=True, exist_ok=True)
        
        if not self.pdf_path.exists():
            raise FileNotFoundError(f"PDF file not found: {pdf_path}")
    
    def _find_references_page(self, doc: fitz.Document) -> int:
        """
        Find the page number where references section starts.
        Returns the page index (0-based) or -1 if not found.
        """
        reference_keywords = [
            'references',
            'bibliography',
            'works cited',
            'literature cited',
            'citations',
            'reference list',
            'bibliographic references'
        ]
        
        # Start checking from page 2 (index 1) since we skip page 1 anyway
        for page_num in range(1, len(doc)):
            page = doc[page_num]
            text = page.get_text().lower()
            
            # Check if any reference keyword appears in the first few lines
            first_lines = '\n'.join(text.split('\n')[:5])
            
            for keyword in reference_keywords:
                if keyword in first_lines:
                    lines = text.split('\n')[:10]
                    for line in lines:
                        if keyword in line.lower():
                            line_clean = line.strip()
                            if len(line_clean) < 100 or any(char.isdigit() for char in line_clean):
                                logger.info(f"Found references section starting at page {page_num + 1}")
                                return page_num
            
        logger.info("No references section detected, extracting from all pages")
        return -1
    
    def extract_images(self) -> List[Dict[str, Any]]:
        """
        Extract all images from the PDF (both embedded and rendered vector graphics).
        Stops extraction when references section is detected.
        
        Returns:
            List of dictionaries containing image metadata
        """
        images = []
        doc = None
        
        try:
            # Open PDF with PyMuPDF
            doc = fitz.open(str(self.pdf_path))
            page_count = len(doc)
            
            # Find references page
            references_page = self._find_references_page(doc)
            
            # Determine last page to process
            # Extract only until references page (stop at references page, don't process it)
            last_page = page_count
            if references_page >= 0:
                # Stop at references page (don't process references page itself)
                last_page = min(references_page, page_count)
                logger.info(f"Processing PDF pages 2-{last_page} (stopping at references page {references_page + 1}, not processing it)")
            else:
                logger.info(f"Processing PDF with {page_count} pages (starting from page 2, no references section detected)")
            
            image_counter = 0
            
            # Start from page 2 (index 1), skip first page, stop at references page (don't process references)
            for page_num in range(1, last_page):
                page = doc[page_num]
                
                # Method 1: Extract embedded images only
                # No rendered pages - only embedded images
                embedded_images = self._extract_embedded_images(
                    doc, page, page_num, image_counter
                )
                images.extend(embedded_images)
                image_counter += len(embedded_images)
            
            logger.info(f"Extracted {len(images)} total images/diagrams")
            return images
            
        except Exception as e:
            logger.error(f"Error extracting images: {e}")
            raise
        finally:
            if doc:
                doc.close()
    
    def _extract_embedded_images(
        self, doc: fitz.Document, page: fitz.Page, page_num: int, start_counter: int
    ) -> List[Dict[str, Any]]:
        """Extract embedded images from a PDF page"""
        images = []
        
        try:
            # Get list of images on this page
            image_list = page.get_images()
            
            for img_idx, img in enumerate(image_list):
                try:
                    # Extract image data
                    xref = img[0]
                    base_image = doc.extract_image(xref)
                    image_bytes = base_image["image"]
                    image_ext = base_image.get("ext", "png").lower()
                    
                    # Only extract JPEG and PNG images
                    if image_ext not in ['jpg', 'jpeg', 'png']:
                        logger.debug(f"Skipping image on page {page_num + 1} (format not supported: {image_ext})")
                        continue
                    
                    # Skip very small images (likely icons or decorations)
                    width = base_image.get("width", 0)
                    height = base_image.get("height", 0)
                    if width < 50 or height < 50:
                        logger.debug(f"Skipping small image on page {page_num + 1}: {width}x{height}")
                        continue
                    
                    # Skip exact dimension 260×128px (specific filter)
                    if (int(width) == 260 and int(height) == 128) or \
                       (int(width) == 128 and int(height) == 260):
                        logger.debug(f"Skipping image on page {page_num + 1} with exact dimension 260×128px")
                        continue
                    
                    # Generate filename
                    filename = f"page_{page_num + 1}_img_{img_idx + 1}.{image_ext}"
                    image_path = self.output_dir / filename
                    
                    # Save image
                    with open(image_path, "wb") as img_file:
                        img_file.write(image_bytes)
                    
                    # Compute perceptual hash
                    phash = self._compute_perceptual_hash(image_bytes)
                    
                    images.append({
                        "filename": filename,
                        "path": str(image_path),
                        "hash": phash,
                        "page": page_num + 1,
                        "width": width,
                        "height": height,
                        "type": "embedded"
                    })
                    
                    logger.debug(f"Extracted embedded image: {filename} ({width}x{height})")
                    
                except Exception as e:
                    logger.warning(f"Error processing embedded image {img_idx} on page {page_num + 1}: {e}")
                    continue
        
        except Exception as e:
            logger.warning(f"Error extracting embedded images from page {page_num + 1}: {e}")
        
        return images
    
    def _render_page_as_image(
        self, page: fitz.Page, page_num: int, counter: int
    ) -> Optional[Dict[str, Any]]:
        """
        Render the entire page as an image to capture vector graphics.
        This is useful for diagrams drawn with vector graphics rather than embedded images.
        
        Note: This captures the entire page, so it may include text and other elements.
        For production use, you might want to detect and crop diagram regions.
        """
        try:
            # Render page at 2x resolution for better quality
            mat = fitz.Matrix(2.0, 2.0)  # 2x zoom
            pix = page.get_pixmap(matrix=mat)
            
            # Convert to PIL Image
            img_data = pix.tobytes("png")
            pil_image = Image.open(io.BytesIO(img_data))
            
            # Skip if image is too small
            width, height = pil_image.size
            if width < 200 or height < 200:
                return None
            
            # Generate filename
            filename = f"page_{page_num + 1}_rendered.png"
            image_path = self.output_dir / filename
            
            # Save rendered image
            pil_image.save(image_path, "PNG")
            
            # Compute perceptual hash
            phash = self._compute_perceptual_hash_from_pil(pil_image)
            
            return {
                "filename": filename,
                "path": str(image_path),
                "hash": phash,
                "page": page_num + 1,
                "width": width,
                "height": height,
                "type": "rendered"
            }
            
        except Exception as e:
            logger.warning(f"Error rendering page {page_num + 1} as image: {e}")
            return None
    
    def _compute_perceptual_hash(self, image_bytes: bytes) -> str:
        """Compute perceptual hash from image bytes"""
        try:
            pil_image = Image.open(io.BytesIO(image_bytes))
            return self._compute_perceptual_hash_from_pil(pil_image)
        except Exception as e:
            logger.warning(f"Error computing hash from bytes: {e}")
            return ""
    
    def _compute_perceptual_hash_from_pil(self, pil_image: Image.Image) -> str:
        """Compute perceptual hash from PIL Image"""
        try:
            # Convert to RGB if necessary
            if pil_image.mode != 'RGB':
                pil_image = pil_image.convert('RGB')
            
            # Compute perceptual hash (pHash)
            # Using hash_size=16 for good balance between accuracy and performance
            phash = imagehash.phash(pil_image, hash_size=16)
            return str(phash)
        except Exception as e:
            logger.warning(f"Error computing perceptual hash: {e}")
            return ""
    
    def detect_duplicates(self, images: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Detect duplicate images based on perceptual hash.
        
        Args:
            images: List of image dictionaries with 'hash' field
            
        Returns:
            List of duplicate groups, each containing hash and list of filenames
        """
        # Group images by hash
        hash_groups: Dict[str, List[str]] = {}
        
        for img in images:
            hash_value = img.get("hash", "")
            if not hash_value:
                continue
            
            filename = img.get("filename", "")
            if hash_value not in hash_groups:
                hash_groups[hash_value] = []
            hash_groups[hash_value].append(filename)
        
        # Find duplicates (hashes with more than one image)
        duplicates = []
        for hash_value, filenames in hash_groups.items():
            if len(filenames) > 1:
                duplicates.append({
                    "hash": hash_value,
                    "files": filenames,
                    "count": len(filenames)
                })
        
        logger.info(f"Found {len(duplicates)} duplicate groups")
        return duplicates
    
    def process(self) -> Dict[str, Any]:
        """
        Main processing method: extract images, compute hashes, detect duplicates.
        
        Returns:
            Dictionary with images and duplicates information
        """
        logger.info(f"Starting diagram extraction for PDF: {self.pdf_path}")
        
        # Extract images
        images = self.extract_images()
        
        # Detect duplicates
        duplicates = self.detect_duplicates(images)
        
        # Mark images that are duplicates
        duplicate_hashes = {dup["hash"] for dup in duplicates}
        for img in images:
            img["is_duplicate"] = img.get("hash", "") in duplicate_hashes
        
        # Prepare response
        result = {
            "job_id": self.job_id,
            "images": [
                {
                    "filename": img["filename"],
                    "hash": img["hash"],
                    "path": img["path"],
                    "page": img.get("page", 0),
                    "width": img.get("width", 0),
                    "height": img.get("height", 0),
                    "type": img.get("type", "unknown"),
                    "is_duplicate": img.get("is_duplicate", False)
                }
                for img in images
            ],
            "duplicates": duplicates,
            "total_images": len(images),
            "unique_images": len(images) - sum(dup["count"] - 1 for dup in duplicates)
        }
        
        logger.info(f"Extraction complete: {result['total_images']} images, {result['unique_images']} unique")
        return result


def main():
    """Main entry point for the script"""
    parser = argparse.ArgumentParser(
        description="Extract diagrams/images from PDF and compute perceptual hashes"
    )
    parser.add_argument("pdf_path", help="Path to input PDF file")
    parser.add_argument("output_dir", help="Base output directory for extracted images")
    parser.add_argument("job_id", help="Unique job identifier")
    
    args = parser.parse_args()
    
    try:
        # Create extractor and process PDF
        extractor = DiagramExtractor(args.pdf_path, args.output_dir, args.job_id)
        result = extractor.process()
        
        # Output JSON result
        print(json.dumps(result, indent=2))
        
    except Exception as e:
        logger.error(f"Fatal error: {e}")
        error_result = {
            "error": str(e),
            "job_id": args.job_id
        }
        print(json.dumps(error_result, indent=2))
        sys.exit(1)


if __name__ == "__main__":
    main()


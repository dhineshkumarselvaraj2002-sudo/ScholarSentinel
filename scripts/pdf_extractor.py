"""
PDF Diagram Extractor for Forensics
Extracts diagrams from multi-page PDFs using PyMuPDF and pdf2image fallback.
Saves diagrams as PNG files with structured naming.
"""

import sys
import os
import argparse
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple
import fitz  # PyMuPDF
from PIL import Image
import io
import logging

# Try to import pdf2image (optional fallback)
try:
    from pdf2image import convert_from_path
    PDF2IMAGE_AVAILABLE = True
except ImportError:
    PDF2IMAGE_AVAILABLE = False
    logging.warning("pdf2image not available, will use PyMuPDF only")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class PDFDiagramExtractor:
    """Extracts diagrams from PDFs using multiple strategies"""
    
    def __init__(self, pdf_path: str, output_base_dir: str):
        """
        Initialize the PDF diagram extractor.
        
        Args:
            pdf_path: Path to input PDF file
            output_base_dir: Base directory for output (will create subdirectory for PDF name)
        """
        self.pdf_path = Path(pdf_path)
        if not self.pdf_path.exists():
            raise FileNotFoundError(f"PDF file not found: {pdf_path}")
        
        # Create output directory structure: /public/diagrams/extracted/<pdfName>/
        pdf_name = self.pdf_path.stem.replace(' ', '_').replace('.', '_')
        self.output_dir = Path(output_base_dir) / "extracted" / pdf_name
        self.output_dir.mkdir(parents=True, exist_ok=True)
        
        logger.info(f"Initialized extractor for: {self.pdf_path.name}")
        logger.info(f"Output directory: {self.output_dir}")
    
    def _find_references_page(self, doc: fitz.Document) -> int:
        """
        Find the page number where references section starts.
        Returns the page index (0-based) or -1 if not found.
        
        Args:
            doc: PyMuPDF document object
        
        Returns:
            Page index (0-based) where references start, or -1 if not found
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
            # (references section usually starts at the top of a page)
            first_lines = '\n'.join(text.split('\n')[:5])
            
            for keyword in reference_keywords:
                if keyword in first_lines:
                    # Additional check: make sure it's likely a section header
                    # Look for the keyword near the start, possibly with numbers or formatting
                    lines = text.split('\n')[:10]
                    for line in lines:
                        if keyword in line.lower():
                            # Check if line is short (likely a header) or contains numbers (reference list)
                            line_clean = line.strip()
                            if len(line_clean) < 100 or any(char.isdigit() for char in line_clean):
                                logger.info(f"Found references section starting at page {page_num + 1}")
                                return page_num
            
        logger.info("No references section detected, extracting from all pages")
        return -1
    
    def extract_diagrams(self) -> List[str]:
        """
        Main extraction function.
        Extracts diagrams using multiple strategies and returns list of file paths.
        Stops extraction when references section is detected.
        
        Returns:
            List of absolute paths to extracted diagram PNG files
        """
        extracted_paths = []
        
        try:
            # Open document to find references page
            doc = fitz.open(str(self.pdf_path))
            references_page = self._find_references_page(doc)
            doc.close()
            
            # Strategy 1: Extract embedded images using PyMuPDF only
            # No rendered pages - only embedded images
            embedded_paths = self._extract_embedded_images(references_page)
            extracted_paths.extend(embedded_paths)
            
            # Strategy 3: Fallback to pdf2image if available
            if PDF2IMAGE_AVAILABLE and len(extracted_paths) == 0:
                logger.info("No diagrams found with PyMuPDF, trying pdf2image fallback...")
                fallback_paths = self._extract_with_pdf2image()
                extracted_paths.extend(fallback_paths)
            
            # Remove duplicates (same file path)
            extracted_paths = list(set(extracted_paths))
            
            logger.info(f"Extracted {len(extracted_paths)} unique diagrams")
            return extracted_paths
            
        except Exception as e:
            logger.error(f"Error during extraction: {e}")
            raise
    
    def _extract_embedded_images(self, stop_at_page: int = -1) -> List[str]:
        """
        Extract embedded raster images from PDF.
        Uses image positions to extract only the diagram region, not the full page.
        Stops extraction when references section is reached.
        
        Args:
            stop_at_page: Page index (0-based) to stop at (references page). -1 means no stop.
        """
        extracted_paths = []
        doc = None
        
        try:
            doc = fitz.open(str(self.pdf_path))
            page_count = len(doc)
            
            # Determine last page to process
            # Extract only until references page (stop at references page, don't process it)
            last_page = page_count
            if stop_at_page >= 0:
                # Stop at references page (don't process references page itself)
                last_page = min(stop_at_page, page_count)
                logger.info(f"Processing pages 2-{last_page} for embedded images (stopping at references page {stop_at_page + 1}, not processing it)")
            else:
                logger.info(f"Processing pages 2-{page_count} for embedded images (no references section detected)")
            
            # Start from page 2 (index 1), skip first page, stop at references page (don't process references)
            for page_num in range(1, last_page):
                page = doc[page_num]
                image_list = page.get_images()
                
                for img_idx, img in enumerate(image_list):
                    try:
                        xref = img[0]
                        
                        # Check image format - only extract JPEG
                        # We need to extract the image to check its format
                        try:
                            base_image = doc.extract_image(xref)
                            image_ext = base_image.get("ext", "png").lower()
                            
                            # Only extract JPEG and PNG images
                            if image_ext not in ['jpg', 'jpeg', 'png']:
                                logger.debug(f"Skipping image {img_idx} on page {page_num + 1} (format not supported: {image_ext})")
                                continue
                        except Exception as e:
                            logger.debug(f"Could not check image format for image {img_idx} on page {page_num + 1}: {e}")
                            continue
                        
                        # Get image position on page (this is the key!)
                        image_rects = page.get_image_rects(xref)
                        
                        if not image_rects:
                            # If we can't get position, skip this image
                            # We don't want to extract full images without knowing their position
                            logger.debug(f"Skipping image {img_idx} on page {page_num + 1}: no position data available")
                            continue
                        
                        # Extract image using its position on page
                        for rect_idx, image_rect in enumerate(image_rects):
                            # Check if this is a reasonable diagram size (not full page)
                            page_rect = page.rect
                            page_area = page_rect.get_area()
                            image_area = image_rect.get_area()
                            
                            # Skip if image is too large (likely full page background)
                            # Use stricter threshold: must be less than 60% of page area
                            if image_area > page_area * 0.6:
                                logger.debug(f"Skipping large image on page {page_num + 1} (area: {image_area:.0f} vs page: {page_area:.0f}, {image_area/page_area*100:.1f}%)")
                                continue
                            
                            # Skip if image spans most of page dimensions
                            # Use stricter threshold: must be less than 75% of page width/height
                            if (image_rect.width > page_rect.width * 0.75 or 
                                image_rect.height > page_rect.height * 0.75):
                                logger.debug(f"Skipping full-page image on page {page_num + 1} (size: {image_rect.width:.0f}x{image_rect.height:.0f} vs page: {page_rect.width:.0f}x{page_rect.height:.0f})")
                                continue
                            
                            # Only extract if reasonably sized (diagram-sized, not tiny icons)
                            if image_rect.width < 100 or image_rect.height < 100:
                                logger.debug(f"Skipping small image on page {page_num + 1} (size: {image_rect.width:.0f}x{image_rect.height:.0f})")
                                continue
                            
                            # Skip exact dimension 260×128px (specific filter)
                            if (int(image_rect.width) == 260 and int(image_rect.height) == 128) or \
                               (int(image_rect.width) == 128 and int(image_rect.height) == 260):
                                logger.debug(f"Skipping image on page {page_num + 1} with exact dimension 260×128px")
                                continue
                            
                            # Additional check: ensure image is not positioned at page edges (likely background)
                            # Diagrams are usually centered or positioned away from edges
                            margin_threshold = 0.05  # 5% margin
                            if (image_rect.x0 < page_rect.width * margin_threshold and 
                                image_rect.y0 < page_rect.height * margin_threshold and
                                image_rect.x1 > page_rect.width * (1 - margin_threshold) and
                                image_rect.y1 > page_rect.height * (1 - margin_threshold)):
                                logger.debug(f"Skipping edge-to-edge image on page {page_num + 1} (likely background)")
                                continue
                            
                            # Extract the region using the image rectangle
                            diagram_path = self._extract_region(
                                page, 
                                page_num, 
                                image_rect, 
                                img_idx * 100 + rect_idx  # Unique index
                            )
                            
                            if diagram_path:
                                extracted_paths.append(diagram_path)
                        
                    except Exception as e:
                        logger.warning(f"Error processing image {img_idx} on page {page_num + 1}: {e}")
                        continue
        
        except Exception as e:
            logger.error(f"Error extracting embedded images: {e}")
        finally:
            if doc:
                doc.close()
        
        return extracted_paths
    
    def _render_vector_diagrams(self, stop_at_page: int = -1) -> List[str]:
        """
        Detect and extract diagram regions from pages (not entire pages).
        Uses image positions and bounding boxes to crop only diagram areas.
        Stops extraction when references section is reached.
        
        Args:
            stop_at_page: Page index (0-based) to stop at (references page). -1 means no stop.
        """
        extracted_paths = []
        doc = None
        
        try:
            doc = fitz.open(str(self.pdf_path))
            page_count = len(doc)
            
            # Determine last page to process
            # Extract only until references page (stop at references page, don't process it)
            last_page = page_count
            if stop_at_page >= 0:
                # Stop at references page (don't process references page itself)
                last_page = min(stop_at_page, page_count)
                logger.info(f"Detecting diagram regions on pages 2-{last_page} (stopping at references page {stop_at_page + 1}, not processing it)")
            else:
                logger.info(f"Detecting diagram regions on pages 2-{page_count} (no references section detected)")
            
            # Start from page 2 (index 1), skip first page, stop at references page (don't process references)
            for page_num in range(1, last_page):
                page = doc[page_num]
                
                # Get image positions on the page (only JPEG images)
                image_rects = self._get_image_rectangles(page, doc)
                
                # Get drawing regions (vector graphics)
                drawing_regions = self._get_drawing_regions(page)
                
                # Combine and merge overlapping regions
                all_regions = image_rects + drawing_regions
                merged_regions = self._merge_overlapping_regions(all_regions)
                
                # Extract each diagram region
                for region_idx, region in enumerate(merged_regions):
                    try:
                        # Crop and save the diagram region
                        diagram_path = self._extract_region(page, page_num, region, region_idx)
                        if diagram_path:
                            extracted_paths.append(diagram_path)
                    except Exception as e:
                        logger.warning(f"Error extracting region {region_idx} on page {page_num + 1}: {e}")
                        continue
        
        except Exception as e:
            logger.error(f"Error rendering vector diagrams: {e}")
        finally:
            if doc:
                doc.close()
        
        return extracted_paths
    
    def _get_image_rectangles(self, page: fitz.Page, doc: fitz.Document = None) -> List[fitz.Rect]:
        """
        Get bounding rectangles for all JPEG images on the page.
        
        Args:
            page: PyMuPDF page object
            doc: PyMuPDF document object (optional, for format checking)
        
        Returns:
            List of Rect objects representing JPEG image positions
        """
        image_rects = []
        
        try:
            # Get image list with positions
            image_list = page.get_images()
            
            # Get document if not provided (from page)
            if doc is None:
                doc = page.parent
            
            for img_idx, img in enumerate(image_list):
                try:
                    xref = img[0]
                    
                    # Check image format - only include JPEG
                    if doc:
                        try:
                            base_image = doc.extract_image(xref)
                            image_ext = base_image.get("ext", "png").lower()
                            
                            # Only include JPEG and PNG images
                            if image_ext not in ['jpg', 'jpeg', 'png']:
                                logger.debug(f"Skipping image {img_idx} (format not supported: {image_ext})")
                                continue
                        except Exception as e:
                            logger.debug(f"Could not check image format for image {img_idx}: {e}")
                            continue
                    
                    # Get image position on page
                    image_rects_found = page.get_image_rects(xref)
                    
                    for rect in image_rects_found:
                        # Only include if reasonably sized (likely a diagram, not icon)
                        if rect.width < 100 or rect.height < 100:
                            continue
                        
                        # Skip exact dimension 260×128px (specific filter)
                        if (int(rect.width) == 260 and int(rect.height) == 128) or \
                           (int(rect.width) == 128 and int(rect.height) == 260):
                            logger.debug(f"Skipping image {img_idx} with exact dimension 260×128px")
                            continue
                        
                        image_rects.append(rect)
                except Exception as e:
                    logger.debug(f"Could not get rectangle for image {img_idx}: {e}")
                    continue
        except Exception as e:
            logger.debug(f"Error getting image rectangles: {e}")
        
        return image_rects
    
    def _get_drawing_regions(self, page: fitz.Page) -> List[fitz.Rect]:
        """
        Detect diagram regions based on vector drawings and image positions.
        Uses a more sophisticated approach to identify actual diagram areas.
        
        Returns:
            List of Rect objects representing diagram regions
        """
        drawing_regions = []
        
        try:
            # Get all drawings on the page
            drawings = page.get_drawings()
            
            if len(drawings) == 0:
                return drawing_regions
            
            # Get text blocks to identify text-heavy areas
            text_blocks = page.get_text("blocks")
            text_rects = []
            for block in text_blocks:
                if len(block) >= 4:
                    try:
                        text_rects.append(fitz.Rect(block[:4]))
                    except:
                        continue
            
            # Collect drawing paths and their bounding boxes
            drawing_rects = []
            for drawing in drawings:
                try:
                    # Get the path items from drawing
                    items = drawing.get("items", [])
                    if not items:
                        continue
                    
                    # Calculate bounding box from path items
                    min_x = float('inf')
                    min_y = float('inf')
                    max_x = float('-inf')
                    max_y = float('-inf')
                    
                    for item in items:
                        if isinstance(item, (list, tuple)) and len(item) >= 2:
                            x, y = item[0], item[1]
                            min_x = min(min_x, x)
                            min_y = min(min_y, y)
                            max_x = max(max_x, x)
                            max_y = max(max_y, y)
                    
                    # If we found valid bounds, create a rect
                    if min_x < float('inf') and min_y < float('inf'):
                        rect = fitz.Rect(min_x, min_y, max_x, max_y)
                        if rect.width >= 50 and rect.height >= 50:
                            drawing_rects.append(rect)
                except Exception as e:
                    logger.debug(f"Error processing drawing: {e}")
                    continue
            
            # Alternative: Use page display list to find vector graphics regions
            # This is more reliable for detecting diagram areas
            try:
                # Get display list items
                display_list = page.get_displaylist()
                
                # Look for image insertions and vector paths
                for item in display_list:
                    try:
                        # Check for image insertions (these are often diagrams)
                        if hasattr(item, 'rect') and item.rect:
                            rect = item.rect
                            if rect.width >= 100 and rect.height >= 100:
                                # Check if this area has minimal text
                                text_overlap = sum(
                                    1 for text_rect in text_rects
                                    if rect.intersects(text_rect)
                                )
                                
                                # If less than 2 text blocks overlap, likely a diagram
                                if text_overlap < 2:
                                    drawing_rects.append(rect)
                    except:
                        continue
            except Exception as e:
                logger.debug(f"Error using display list: {e}")
            
            if len(drawing_rects) == 0:
                return drawing_regions
            
            # Merge nearby/overlapping rectangles
            merged = self._merge_overlapping_regions(drawing_rects)
            
            # Filter regions: exclude full-page regions and text-heavy areas
            page_area = page.rect.get_area()
            page_width = page.rect.width
            page_height = page.rect.height
            
            for region in merged:
                region_area = region.get_area()
                
                # Skip if region is too large (likely full page)
                # Use stricter threshold: must be less than 60% of page area
                if region_area > page_area * 0.6:
                    logger.debug(f"Skipping large drawing region (area: {region_area:.0f} vs page: {page_area:.0f}, {region_area/page_area*100:.1f}%)")
                    continue
                
                # Skip if region spans most of page width/height (likely full page)
                # Use stricter threshold: must be less than 75% of page dimensions
                if region.width > page_width * 0.75 or region.height > page_height * 0.75:
                    logger.debug(f"Skipping full-page drawing region (size: {region.width:.0f}x{region.height:.0f} vs page: {page_width:.0f}x{page_height:.0f})")
                    continue
                
                # Check if region is positioned at page edges (likely background)
                margin_threshold = 0.05  # 5% margin
                if (region.x0 < page_width * margin_threshold and 
                    region.y0 < page_height * margin_threshold and
                    region.x1 > page_width * (1 - margin_threshold) and
                    region.y1 > page_height * (1 - margin_threshold)):
                    logger.debug(f"Skipping edge-to-edge drawing region (likely background)")
                    continue
                
                # Check text density in this region
                text_in_region = sum(
                    1 for text_rect in text_rects
                    if region.intersects(text_rect)
                )
                
                # If too much text, skip (likely not a pure diagram)
                if text_in_region > 5:
                    logger.debug(f"Skipping text-heavy region ({text_in_region} text blocks)")
                    continue
                
                # Only include if reasonably sized (diagram-sized)
                if region.width >= 150 and region.height >= 150:
                    drawing_regions.append(region)
                else:
                    logger.debug(f"Skipping small drawing region (size: {region.width:.0f}x{region.height:.0f})")
        
        except Exception as e:
            logger.debug(f"Error getting drawing regions: {e}")
            import traceback
            logger.debug(traceback.format_exc())
        
        return drawing_regions
    
    def _merge_overlapping_regions(self, regions: List[fitz.Rect]) -> List[fitz.Rect]:
        """
        Merge overlapping or nearby rectangles into single regions.
        
        Args:
            regions: List of Rect objects
        
        Returns:
            List of merged Rect objects
        """
        if len(regions) == 0:
            return []
        
        merged = []
        used = [False] * len(regions)
        
        for i, rect1 in enumerate(regions):
            if used[i]:
                continue
            
            current = fitz.Rect(rect1)
            used[i] = True
            
            # Find all overlapping or nearby rectangles
            changed = True
            while changed:
                changed = False
                for j, rect2 in enumerate(regions):
                    if used[j]:
                        continue
                    
                    # Check if rectangles overlap or are close (within 50px)
                    distance = self._rect_distance(current, rect2)
                    if distance < 50 or current.intersects(rect2):
                        # Merge rectangles
                        current = fitz.Rect(
                            min(current.x0, rect2.x0),
                            min(current.y0, rect2.y0),
                            max(current.x1, rect2.x1),
                            max(current.y1, rect2.y1)
                        )
                        used[j] = True
                        changed = True
            
            merged.append(current)
        
        return merged
    
    def _rect_distance(self, rect1: fitz.Rect, rect2: fitz.Rect) -> float:
        """Calculate minimum distance between two rectangles"""
        # Horizontal distance
        h_dist = max(0, max(rect1.x0 - rect2.x1, rect2.x0 - rect1.x1))
        # Vertical distance
        v_dist = max(0, max(rect1.y0 - rect2.y1, rect2.y0 - rect1.y1))
        # Euclidean distance
        return (h_dist ** 2 + v_dist ** 2) ** 0.5
    
    def _extract_region(
        self, 
        page: fitz.Page, 
        page_num: int, 
        region: fitz.Rect, 
        region_idx: int
    ) -> Optional[str]:
        """
        Extract a specific region from a page as a diagram.
        
        Args:
            page: PyMuPDF page object
            page_num: Page number (0-indexed)
            region: Rectangle defining the region to extract
            region_idx: Index of region on this page
        
        Returns:
            Path to extracted diagram file, or None if extraction failed
        """
        try:
            # Ensure region is within page bounds
            page_rect = page.rect
            region = fitz.Rect(
                max(0, min(region.x0, page_rect.width)),
                max(0, min(region.y0, page_rect.height)),
                max(region.x0, min(region.x1, page_rect.width)),
                max(region.y0, min(region.y1, page_rect.height))
            )
            
            # Skip if region is too small
            if region.width < 100 or region.height < 100:
                return None
            
            # Render only the region at 2x resolution
            mat = fitz.Matrix(2.0, 2.0)
            
            # Create a clip for the region
            clip_rect = fitz.Rect(region)
            
            # Render the clipped region
            pix = page.get_pixmap(
                matrix=mat,
                clip=clip_rect
            )
            
            # Convert to PIL Image
            img_data = pix.tobytes("png")
            pil_image = Image.open(io.BytesIO(img_data))
            
            width, height = pil_image.size
            
            # Only save if reasonable size
            if width >= 150 and height >= 150:
                filename = f"{page_num + 1}-diagram-{region_idx + 1}.png"
                file_path = self.output_dir / filename
                pil_image.save(file_path, "PNG")
                
                logger.debug(f"Extracted diagram region: {filename} ({width}x{height}) from region {region}")
                return str(file_path)
            
            return None
            
        except Exception as e:
            logger.warning(f"Error extracting region: {e}")
            return None
    
    def _extract_with_pdf2image(self) -> List[str]:
        """Fallback extraction using pdf2image"""
        extracted_paths = []
        
        if not PDF2IMAGE_AVAILABLE:
            return extracted_paths
        
        try:
            # Convert PDF pages to images
            images = convert_from_path(str(self.pdf_path), dpi=200)
            
            for page_num, pil_image in enumerate(images):
                width, height = pil_image.size
                
                # Only save if reasonable size
                if width >= 150 and height >= 150:
                    filename = f"{page_num + 1}-rendered.png"
                    file_path = self.output_dir / filename
                    pil_image.save(file_path, "PNG")
                    
                    extracted_paths.append(str(file_path))
                    logger.debug(f"Extracted with pdf2image: {filename} ({width}x{height})")
        
        except Exception as e:
            logger.error(f"Error with pdf2image extraction: {e}")
        
        return extracted_paths


def extract_diagrams(pdf_path: str, output_base_dir: str = None) -> List[str]:
    """
    Callable function to extract diagrams from PDF.
    
    Args:
        pdf_path: Path to PDF file
        output_base_dir: Base directory for output (default: ./public/diagrams)
    
    Returns:
        List of file paths to extracted diagrams
    """
    if output_base_dir is None:
        # Default to public/diagrams relative to script location
        script_dir = Path(__file__).parent.parent
        output_base_dir = script_dir / "public" / "diagrams"
    
    extractor = PDFDiagramExtractor(pdf_path, str(output_base_dir))
    return extractor.extract_diagrams()


def main():
    """CLI entry point"""
    parser = argparse.ArgumentParser(
        description="Extract diagrams from PDF files"
    )
    parser.add_argument("pdf_path", help="Path to input PDF file")
    parser.add_argument(
        "--output-dir",
        default=None,
        help="Base output directory (default: ./public/diagrams)"
    )
    
    args = parser.parse_args()
    
    try:
        paths = extract_diagrams(args.pdf_path, args.output_dir)
        
        print(f"Extracted {len(paths)} diagrams:")
        for path in paths:
            print(f"  - {path}")
        
        # Return exit code 0 for success
        sys.exit(0)
        
    except Exception as e:
        logger.error(f"Fatal error: {e}")
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()


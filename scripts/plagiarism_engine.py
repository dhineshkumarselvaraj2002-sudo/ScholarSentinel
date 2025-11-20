"""
Master Plagiarism Detection Pipeline
Orchestrates all forensics modules to generate comprehensive plagiarism reports.
"""

import sys
import json
import argparse
import time
from pathlib import Path
from typing import Dict, List, Any
import logging

# Import our modules
import sys
from pathlib import Path

# Add scripts directory to path
scripts_dir = Path(__file__).parent
if str(scripts_dir) not in sys.path:
    sys.path.insert(0, str(scripts_dir))

from pdf_extractor import extract_diagrams
from image_hashing import ImageHasher

# Optional imports (may not be available)
try:
    from opencv_compare import OpenCVComparator
    OPENCV_AVAILABLE = True
except ImportError:
    OPENCV_AVAILABLE = False
    OpenCVComparator = None

try:
    from auto_reverse_search import ReverseImageSearcher
    SELENIUM_AVAILABLE = True
except ImportError:
    SELENIUM_AVAILABLE = False
    ReverseImageSearcher = None

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class PlagiarismEngine:
    """Master engine for diagram plagiarism detection"""
    
    def __init__(self, reference_dir: str = None):
        """
        Initialize the plagiarism engine.
        
        Args:
            reference_dir: Directory containing reference diagrams for comparison
        """
        self.reference_dir = Path(reference_dir) if reference_dir else None
        self.hasher = ImageHasher()
        self.comparator = OpenCVComparator() if OPENCV_AVAILABLE else None
        self.searcher = ReverseImageSearcher(headless=True) if SELENIUM_AVAILABLE else None
    
    def analyze_pdf(self, pdf_path: str, job_id: str = None) -> Dict[str, Any]:
        """
        Complete plagiarism analysis pipeline for a PDF.
        
        Args:
            pdf_path: Path to PDF file
            job_id: Optional job identifier
        
        Returns:
            Comprehensive plagiarism report
        """
        logger.info(f"Starting plagiarism analysis for: {pdf_path}")
        
        if job_id is None:
            job_id = f"job_{Path(pdf_path).stem}_{int(time.time())}"
        
        # Step 1: Extract diagrams
        logger.info("Step 1: Extracting diagrams from PDF...")
        output_base = Path(__file__).parent.parent / "public" / "diagrams"
        extracted_paths = extract_diagrams(pdf_path, str(output_base))
        
        if len(extracted_paths) == 0:
            return {
                'jobId': job_id,
                'pdfPath': pdf_path,
                'error': 'No diagrams found in PDF',
                'diagrams': []
            }
        
        logger.info(f"Extracted {len(extracted_paths)} diagrams")
        
        # Step 2: Analyze each diagram
        diagram_reports = []
        
        for idx, diagram_path in enumerate(extracted_paths):
            logger.info(f"Analyzing diagram {idx + 1}/{len(extracted_paths)}: {diagram_path}")
            
            diagram_report = self._analyze_diagram(diagram_path, idx + 1)
            diagram_reports.append(diagram_report)
        
        # Step 3: Generate final report
        final_report = {
            'jobId': job_id,
            'pdfPath': pdf_path,
            'totalDiagrams': len(extracted_paths),
            'diagrams': diagram_reports,
            'summary': self._generate_summary(diagram_reports),
            'timestamp': time.time()
        }
        
        logger.info("Plagiarism analysis complete")
        return final_report
    
    def _analyze_diagram(self, diagram_path: str, diagram_index: int) -> Dict[str, Any]:
        """
        Analyze a single diagram for plagiarism indicators.
        
        Args:
            diagram_path: Path to diagram image
            diagram_index: Index of diagram in PDF
        
        Returns:
            Analysis report for the diagram
        """
        report = {
            'diagram': diagram_path,
            'index': diagram_index,
            'localSimilarity': None,
            'reverseImageSearch': None,
            'hashMatches': None,
            'decision': 'original',
            'confidence': 0.0,
            'indicators': []
        }
        
        try:
            # 2a. Generate hashes and check for matches
            logger.info(f"  Computing hashes for {diagram_path}...")
            hashes = self.hasher.compute_hashes(diagram_path)
            self.hasher.store_hashes(diagram_path, hashes)
            
            # Find similar images in database
            similar_images = self.hasher.find_similar(diagram_path, threshold=0.8)
            
            if similar_images:
                report['hashMatches'] = {
                    'count': len(similar_images),
                    'matches': similar_images[:5],  # Top 5
                    'highestSimilarity': similar_images[0]['similarity'] if similar_images else 0.0
                }
                
                # Check hash distance threshold
                if similar_images[0]['similarity'] > 0.9:  # Hash distance < 10 equivalent
                    report['indicators'].append('Strong hash match detected')
                    report['confidence'] += 0.3
            
            # 2b. Compare with reference directory (if provided)
            if self.reference_dir and self.reference_dir.exists() and self.comparator:
                logger.info(f"  Comparing with reference directory...")
                comparison = self.comparator.compare_with_directory(
                    diagram_path,
                    str(self.reference_dir),
                    threshold=0.35
                )
                
                report['localSimilarity'] = comparison
                
                # Check OpenCV thresholds
                if comparison['bestMatch']:
                    best_score = comparison['bestMatch']['score'] / 100.0
                    ssim_score = comparison['bestMatch'].get('ssim', 0)
                    
                    if ssim_score > 0.75:
                        report['indicators'].append(f'High SSIM similarity: {ssim_score:.2f}')
                        report['confidence'] += 0.4
                    
                    if best_score > 0.35:
                        report['indicators'].append(f'ORB match percentage: {best_score:.2%}')
                        report['confidence'] += 0.2
            
            # 2c. Perform reverse image search (Google)
            if self.searcher:
                logger.info(f"  Performing reverse image search...")
                try:
                    reverse_results = self.searcher.search_google(diagram_path)
                    report['reverseImageSearch'] = {
                        'engine': 'google',
                        'bestGuess': reverse_results.get('bestGuess'),
                        'similarImagesCount': len(reverse_results.get('similarImages', [])),
                        'matchingPagesCount': len(reverse_results.get('matchingPages', [])),
                        'resultUrl': reverse_results.get('resultUrl'),
                        'hasResults': len(reverse_results.get('similarImages', [])) > 0
                    }
                    
                    # Check if visually similar images found
                    if report['reverseImageSearch']['hasResults']:
                        report['indicators'].append('Visually similar images found on Google')
                        report['confidence'] += 0.3
                except Exception as e:
                    logger.warning(f"  Reverse search failed: {e}")
                    report['reverseImageSearch'] = {
                        'error': str(e)
                    }
            else:
                logger.info("  Reverse search skipped (Selenium not available)")
                report['reverseImageSearch'] = {
                    'skipped': 'Selenium not available'
                }
            
            # 2d. Make final decision
            report['decision'] = self._make_decision(report)
            
        except Exception as e:
            logger.error(f"Error analyzing diagram {diagram_path}: {e}")
            report['error'] = str(e)
        
        return report
    
    def _make_decision(self, report: Dict[str, Any]) -> str:
        """
        Make plagiarism decision based on all indicators.
        
        Args:
            report: Diagram analysis report
        
        Returns:
            Decision: 'original', 'partially plagiarized', or 'heavily plagiarized'
        """
        confidence = report['confidence']
        indicators = report['indicators']
        
        # Decision rules
        if confidence >= 0.7:
            return 'heavily plagiarized'
        elif confidence >= 0.4:
            return 'partially plagiarized'
        else:
            return 'original'
    
    def _generate_summary(self, diagram_reports: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Generate summary statistics"""
        total = len(diagram_reports)
        original = sum(1 for r in diagram_reports if r['decision'] == 'original')
        partial = sum(1 for r in diagram_reports if r['decision'] == 'partially plagiarized')
        heavy = sum(1 for r in diagram_reports if r['decision'] == 'heavily plagiarized')
        
        avg_confidence = sum(r['confidence'] for r in diagram_reports) / total if total > 0 else 0.0
        
        return {
            'total': total,
            'original': original,
            'partiallyPlagiarized': partial,
            'heavilyPlagiarized': heavy,
            'averageConfidence': avg_confidence,
            'riskLevel': (
                'high' if heavy > 0 or partial > total * 0.5 else
                'medium' if partial > 0 else
                'low'
            )
        }


def main():
    """CLI entry point"""
    parser = argparse.ArgumentParser(
        description="Diagram Plagiarism Detection Engine"
    )
    parser.add_argument("pdf_path", help="Path to PDF file")
    parser.add_argument(
        "--reference-dir",
        help="Directory containing reference diagrams for comparison"
    )
    parser.add_argument(
        "--job-id",
        help="Job identifier"
    )
    
    args = parser.parse_args()
    
    engine = PlagiarismEngine(reference_dir=args.reference_dir)
    
    try:
        report = engine.analyze_pdf(args.pdf_path, args.job_id)
        print(json.dumps(report, indent=2))
        sys.exit(0)
    except Exception as e:
        logger.error(f"Fatal error: {e}")
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)
    finally:
        if engine.searcher:
            engine.searcher.close()


if __name__ == "__main__":
    import time
    main()


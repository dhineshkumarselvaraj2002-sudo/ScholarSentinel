"""
OpenCV-based Diagram Similarity Detection
Uses ORB feature detection, BFMatcher/FLANN, and SSIM for advanced comparison.
"""

import sys
import json
import argparse
from pathlib import Path
from typing import Dict, Optional
import cv2
import numpy as np
from skimage.metrics import structural_similarity as ssim
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class OpenCVComparator:
    """Advanced image comparison using OpenCV"""
    
    def __init__(self):
        """Initialize the comparator"""
        # Initialize ORB detector
        self.orb = cv2.ORB_create(nfeatures=1000)
        
        # Initialize matchers
        self.bf_matcher = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=False)
        
        # FLANN matcher (for better performance with many features)
        FLANN_INDEX_LSH = 6
        index_params = dict(
            algorithm=FLANN_INDEX_LSH,
            table_number=6,
            key_size=12,
            multi_probe_level=1
        )
        search_params = dict(checks=50)
        try:
            self.flann_matcher = cv2.FlannBasedMatcher(index_params, search_params)
        except:
            logger.warning("FLANN matcher not available, using BFMatcher only")
            self.flann_matcher = None
    
    def compare_images(self, image1_path: str, image2_path: str) -> Dict[str, float]:
        """
        Compare two images using multiple methods.
        
        Args:
            image1_path: Path to first image
            image2_path: Path to second image
        
        Returns:
            Dictionary with comparison scores
        """
        try:
            # Load images
            img1 = cv2.imread(image1_path, cv2.IMREAD_GRAYSCALE)
            img2 = cv2.imread(image2_path, cv2.IMREAD_GRAYSCALE)
            
            if img1 is None or img2 is None:
                raise ValueError(f"Could not load images: {image1_path}, {image2_path}")
            
            # Resize images to same size for SSIM
            h1, w1 = img1.shape
            h2, w2 = img2.shape
            
            # Resize to common size (use smaller dimensions)
            target_h = min(h1, h2)
            target_w = min(w1, w2)
            
            img1_resized = cv2.resize(img1, (target_w, target_h))
            img2_resized = cv2.resize(img2, (target_w, target_h))
            
            # Compute ORB features and matches
            orb_score = self._compute_orb_similarity(img1, img2)
            
            # Compute SSIM
            ssim_score = self._compute_ssim(img1_resized, img2_resized)
            
            # Compute match percentage (combination of ORB and SSIM)
            match_percentage = (orb_score * 0.4 + ssim_score * 0.6) * 100
            
            return {
                'orbScore': orb_score,
                'ssim': ssim_score,
                'matchPercentage': match_percentage
            }
            
        except Exception as e:
            logger.error(f"Error comparing images: {e}")
            raise
    
    def _compute_orb_similarity(self, img1: np.ndarray, img2: np.ndarray) -> float:
        """Compute similarity using ORB feature detection"""
        try:
            # Detect keypoints and descriptors
            kp1, des1 = self.orb.detectAndCompute(img1, None)
            kp2, des2 = self.orb.detectAndCompute(img2, None)
            
            if des1 is None or des2 is None:
                return 0.0
            
            if len(des1) == 0 or len(des2) == 0:
                return 0.0
            
            # Match descriptors
            matches = self.bf_matcher.knnMatch(des1, des2, k=2)
            
            # Apply ratio test (Lowe's ratio test)
            good_matches = []
            for match_pair in matches:
                if len(match_pair) == 2:
                    m, n = match_pair
                    if m.distance < 0.75 * n.distance:
                        good_matches.append(m)
            
            # Calculate match ratio
            if len(matches) > 0:
                match_ratio = len(good_matches) / len(matches)
            else:
                match_ratio = 0.0
            
            return match_ratio
            
        except Exception as e:
            logger.warning(f"Error in ORB computation: {e}")
            return 0.0
    
    def _compute_ssim(self, img1: np.ndarray, img2: np.ndarray) -> float:
        """Compute Structural Similarity Index"""
        try:
            # SSIM requires images to be the same size (already resized)
            score = ssim(img1, img2, data_range=255)
            return float(score)
        except Exception as e:
            logger.warning(f"Error in SSIM computation: {e}")
            return 0.0
    
    def is_likely_copied(self, image1_path: str, image2_path: str) -> Dict[str, any]:
        """
        Determine if images are likely copied based on thresholds.
        
        Args:
            image1_path: Path to first image
            image2_path: Path to second image
        
        Returns:
            Dictionary with comparison results and decision
        """
        comparison = self.compare_images(image1_path, image2_path)
        
        # Threshold logic
        orb_threshold = 0.35  # 35% ORB matches
        ssim_threshold = 0.65  # SSIM > 0.65
        
        is_copied = (
            comparison['orbScore'] > orb_threshold or
            comparison['ssim'] > ssim_threshold
        )
        
        return {
            **comparison,
            'likelyCopied': is_copied,
            'reason': (
                'ORB matches > 35%' if comparison['orbScore'] > orb_threshold else
                'SSIM > 0.65' if comparison['ssim'] > ssim_threshold else
                'Below thresholds'
            )
        }
    
    def compare_with_directory(
        self,
        query_image: str,
        reference_dir: str,
        threshold: float = 0.35
    ) -> Dict[str, any]:
        """
        Compare query image with all images in a directory.
        
        Args:
            query_image: Path to query image
            reference_dir: Directory containing reference images
            threshold: Minimum match percentage threshold
        
        Returns:
            Dictionary with best match and all matches
        """
        ref_dir = Path(reference_dir)
        if not ref_dir.exists():
            raise ValueError(f"Reference directory not found: {reference_dir}")
        
        # Get all image files in directory
        image_extensions = {'.png', '.jpg', '.jpeg', '.gif', '.bmp'}
        image_files = [
            f for f in ref_dir.iterdir()
            if f.suffix.lower() in image_extensions and f.is_file()
        ]
        
        if len(image_files) == 0:
            return {
                'bestMatch': None,
                'bestScore': 0.0,
                'matches': [],
                'totalCompared': 0
            }
        
        # Compare with each image
        matches = []
        for ref_image in image_files:
            try:
                comparison = self.compare_images(query_image, str(ref_image))
                match_percentage = comparison['matchPercentage']
                
                if match_percentage >= threshold * 100:
                    matches.append({
                        'image': str(ref_image.relative_to(ref_dir.parent)),
                        'score': match_percentage,
                        'orbScore': comparison['orbScore'],
                        'ssim': comparison['ssim']
                    })
            except Exception as e:
                logger.warning(f"Error comparing with {ref_image}: {e}")
                continue
        
        # Sort by score (highest first)
        matches.sort(key=lambda x: x['score'], reverse=True)
        
        best_match = matches[0] if matches else None
        
        return {
            'bestMatch': best_match,
            'bestScore': best_match['score'] if best_match else 0.0,
            'matches': matches,
            'totalCompared': len(image_files)
        }


def main():
    """CLI entry point"""
    parser = argparse.ArgumentParser(
        description="Compare images using OpenCV"
    )
    parser.add_argument("image1", help="Path to first image")
    parser.add_argument("image2", nargs='?', help="Path to second image (optional)")
    parser.add_argument(
        "--reference-dir",
        help="Compare image1 with all images in this directory"
    )
    parser.add_argument(
        "--threshold",
        type=float,
        default=0.35,
        help="Minimum match percentage threshold (default: 0.35)"
    )
    
    args = parser.parse_args()
    
    comparator = OpenCVComparator()
    
    try:
        if args.reference_dir:
            # Compare with directory
            result = comparator.compare_with_directory(
                args.image1,
                args.reference_dir,
                args.threshold
            )
            print(json.dumps(result, indent=2))
        elif args.image2:
            # Compare two images
            result = comparator.is_likely_copied(args.image1, args.image2)
            print(json.dumps(result, indent=2))
        else:
            print("Error: Either image2 or --reference-dir must be provided", file=sys.stderr)
            sys.exit(1)
        
        sys.exit(0)
        
    except Exception as e:
        logger.error(f"Fatal error: {e}")
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()


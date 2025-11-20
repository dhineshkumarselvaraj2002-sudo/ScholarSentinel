"""
Image Hashing and Fingerprinting Module
Generates multiple hash types (pHash, dHash, aHash) and stores in SQLite DB.
"""

import sys
import sqlite3
import json
import argparse
from pathlib import Path
from typing import Dict, Optional, Tuple, List
from datetime import datetime
from PIL import Image
import imagehash
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class ImageHasher:
    """Handles image hashing and database storage"""
    
    def __init__(self, db_path: str = None):
        """
        Initialize the image hasher.
        
        Args:
            db_path: Path to SQLite database (default: ./data/diagram_hashes.db)
        """
        if db_path is None:
            script_dir = Path(__file__).parent.parent
            db_path = script_dir / "data" / "diagram_hashes.db"
        
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Initialize database
        self._init_database()
    
    def _init_database(self):
        """Create database table if it doesn't exist"""
        conn = sqlite3.connect(str(self.db_path))
        cursor = conn.cursor()
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS diagram_hashes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                filePath TEXT NOT NULL UNIQUE,
                pHash TEXT,
                dHash TEXT,
                aHash TEXT,
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        # Create index on filePath for faster lookups
        cursor.execute('''
            CREATE INDEX IF NOT EXISTS idx_filePath ON diagram_hashes(filePath)
        ''')
        
        conn.commit()
        conn.close()
        logger.info(f"Database initialized at: {self.db_path}")
    
    def compute_hashes(self, image_path: str) -> Dict[str, str]:
        """
        Compute all hash types for an image.
        
        Args:
            image_path: Path to image file
        
        Returns:
            Dictionary with pHash, dHash, aHash
        """
        try:
            pil_image = Image.open(image_path)
            
            # Convert to RGB if necessary
            if pil_image.mode != 'RGB':
                pil_image = pil_image.convert('RGB')
            
            # Compute hashes
            phash = str(imagehash.phash(pil_image, hash_size=16))
            dhash = str(imagehash.dhash(pil_image, hash_size=16))
            ahash = str(imagehash.average_hash(pil_image, hash_size=16))
            
            return {
                'pHash': phash,
                'dHash': dhash,
                'aHash': ahash
            }
        except Exception as e:
            logger.error(f"Error computing hashes for {image_path}: {e}")
            raise
    
    def store_hashes(self, image_path: str, hashes: Dict[str, str]) -> bool:
        """
        Store hashes in database.
        
        Args:
            image_path: Path to image file (will be stored as-is)
            hashes: Dictionary with pHash, dHash, aHash
        
        Returns:
            True if successful
        """
        conn = sqlite3.connect(str(self.db_path))
        cursor = conn.cursor()
        
        try:
            # Use INSERT OR REPLACE to handle duplicates
            cursor.execute('''
                INSERT OR REPLACE INTO diagram_hashes 
                (filePath, pHash, dHash, aHash, createdAt)
                VALUES (?, ?, ?, ?, ?)
            ''', (
                image_path,
                hashes.get('pHash', ''),
                hashes.get('dHash', ''),
                hashes.get('aHash', ''),
                datetime.now().isoformat()
            ))
            
            conn.commit()
            logger.info(f"Stored hashes for: {image_path}")
            return True
        except Exception as e:
            logger.error(f"Error storing hashes: {e}")
            conn.rollback()
            return False
        finally:
            conn.close()
    
    def compare_hashes(self, hash1: str, hash2: str, hash_type: str = 'pHash') -> float:
        """
        Compare two hashes and return similarity score (0-1).
        
        Args:
            hash1: First hash string
            hash2: Second hash string
            hash_type: Type of hash ('pHash', 'dHash', 'aHash')
        
        Returns:
            Similarity score between 0 (different) and 1 (identical)
        """
        try:
            # Convert string hashes to imagehash objects
            hash_obj1 = imagehash.hex_to_hash(hash1)
            hash_obj2 = imagehash.hex_to_hash(hash2)
            
            # Calculate Hamming distance
            distance = hash_obj1 - hash_obj2
            
            # Maximum possible distance for hash_size=16 is 256
            max_distance = 256.0
            
            # Convert to similarity score (0-1)
            similarity = 1.0 - (distance / max_distance)
            
            return max(0.0, min(1.0, similarity))
        except Exception as e:
            logger.error(f"Error comparing hashes: {e}")
            return 0.0
    
    def find_similar(self, image_path: str, threshold: float = 0.8) -> List[Dict]:
        """
        Find similar images in database based on hash comparison.
        
        Args:
            image_path: Path to query image
            threshold: Minimum similarity score (0-1)
        
        Returns:
            List of similar images with scores
        """
        # Compute hashes for query image
        query_hashes = self.compute_hashes(image_path)
        
        # Get all stored images
        conn = sqlite3.connect(str(self.db_path))
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT filePath, pHash, dHash, aHash
            FROM diagram_hashes
            WHERE filePath != ?
        ''', (image_path,))
        
        similar_images = []
        
        for row in cursor.fetchall():
            stored_path, stored_phash, stored_dhash, stored_ahash = row
            
            # Compare using pHash (most reliable)
            if stored_phash:
                similarity = self.compare_hashes(
                    query_hashes['pHash'],
                    stored_phash,
                    'pHash'
                )
                
                if similarity >= threshold:
                    similar_images.append({
                        'filePath': stored_path,
                        'similarity': similarity,
                        'hash_type': 'pHash'
                    })
        
        conn.close()
        
        # Sort by similarity (highest first)
        similar_images.sort(key=lambda x: x['similarity'], reverse=True)
        
        return similar_images


def main():
    """CLI entry point"""
    parser = argparse.ArgumentParser(
        description="Compute and store image hashes"
    )
    parser.add_argument("image_path", help="Path to image file")
    parser.add_argument(
        "--db-path",
        default=None,
        help="Path to SQLite database (default: ./data/diagram_hashes.db)"
    )
    parser.add_argument(
        "--compare",
        help="Compare with another image path"
    )
    parser.add_argument(
        "--find-similar",
        action="store_true",
        help="Find similar images in database"
    )
    
    args = parser.parse_args()
    
    hasher = ImageHasher(args.db_path)
    
    try:
        if args.compare:
            # Compare two images
            hashes1 = hasher.compute_hashes(args.image_path)
            hashes2 = hasher.compute_hashes(args.compare)
            
            similarity = hasher.compare_hashes(hashes1['pHash'], hashes2['pHash'])
            
            result = {
                'image1': args.image_path,
                'image2': args.compare,
                'similarity': similarity,
                'hashes1': hashes1,
                'hashes2': hashes2
            }
            
            print(json.dumps(result, indent=2))
        
        elif args.find_similar:
            # Find similar images
            similar = hasher.find_similar(args.image_path, threshold=0.8)
            result = {
                'query_image': args.image_path,
                'similar_images': similar,
                'count': len(similar)
            }
            print(json.dumps(result, indent=2))
        
        else:
            # Compute and store hashes
            hashes = hasher.compute_hashes(args.image_path)
            hasher.store_hashes(args.image_path, hashes)
            
            result = {
                'image_path': args.image_path,
                'hashes': hashes,
                'stored': True
            }
            
            print(json.dumps(result, indent=2))
        
        sys.exit(0)
        
    except Exception as e:
        logger.error(f"Fatal error: {e}")
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()


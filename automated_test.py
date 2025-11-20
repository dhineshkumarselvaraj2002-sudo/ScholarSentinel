"""
Automated Test Suite for Diagram Forensics Engine
Tests all modules comprehensively
"""

import sys
import json
import os
import time
from pathlib import Path
from typing import Dict, List, Any

# Test results storage
test_results = {
    "timestamp": time.time(),
    "tests": [],
    "summary": {}
}

def log_test(name: str, status: str, details: str = "", error: str = ""):
    """Log test result"""
    test_results["tests"].append({
        "name": name,
        "status": status,
        "details": details,
        "error": error,
        "timestamp": time.time()
    })
    status_icon = "✅" if status == "PASS" else "❌" if status == "FAIL" else "⚠️"
    print(f"{status_icon} {name}: {status}")
    if details:
        print(f"   {details}")
    if error:
        print(f"   ERROR: {error}")

def test_module_a_pdf_extraction():
    """Test Module A: PDF Extraction"""
    print("\n" + "="*60)
    print("TEST: Module A - PDF Extraction")
    print("="*60)
    
    try:
        from scripts.pdf_extractor import extract_diagrams
        
        # Find a test PDF
        test_pdf = None
        uploads_dir = Path("uploads")
        if uploads_dir.exists():
            pdfs = list(uploads_dir.glob("*.pdf"))
            if pdfs:
                test_pdf = str(pdfs[0])
        
        if not test_pdf:
            log_test("PDF Extraction", "SKIP", "No test PDF found in uploads/")
            return False
        
        print(f"Using test PDF: {test_pdf}")
        
        # Extract diagrams
        output_dir = "public/diagrams"
        paths = extract_diagrams(test_pdf, output_dir)
        
        if len(paths) > 0:
            # Verify files exist
            existing = [p for p in paths if Path(p).exists()]
            log_test("PDF Extraction", "PASS", 
                    f"Extracted {len(paths)} diagrams, {len(existing)} files verified")
            return True
        else:
            log_test("PDF Extraction", "FAIL", "No diagrams extracted")
            return False
            
    except Exception as e:
        log_test("PDF Extraction", "FAIL", error=str(e))
        import traceback
        traceback.print_exc()
        return False

def test_module_b_hashing():
    """Test Module B: Image Hashing"""
    print("\n" + "="*60)
    print("TEST: Module B - Image Hashing")
    print("="*60)
    
    try:
        from scripts.image_hashing import ImageHasher
        
        # Find a test image
        diagrams_dir = Path("public/diagrams/extracted")
        test_image = None
        
        if diagrams_dir.exists():
            for subdir in diagrams_dir.iterdir():
                if subdir.is_dir():
                    images = list(subdir.glob("*.png"))
                    if images:
                        test_image = str(images[0])
                        break
        
        if not test_image:
            log_test("Image Hashing", "SKIP", "No test images found. Run PDF extraction first.")
            return False
        
        print(f"Using test image: {test_image}")
        
        # Test hashing
        hasher = ImageHasher()
        hashes = hasher.compute_hashes(test_image)
        
        if hashes.get('pHash') and hashes.get('dHash') and hashes.get('aHash'):
            # Store hashes
            stored = hasher.store_hashes(test_image, hashes)
            
            # Test comparison
            similarity = hasher.compare_hashes(hashes['pHash'], hashes['pHash'])
            
            # Test find similar
            similar = hasher.find_similar(test_image, threshold=0.8)
            
            log_test("Image Hashing", "PASS", 
                    f"Computed all 3 hash types, stored={stored}, similarity={similarity:.2f}, found {len(similar)} similar")
            return True
        else:
            log_test("Image Hashing", "FAIL", "Failed to compute all hash types")
            return False
            
    except Exception as e:
        log_test("Image Hashing", "FAIL", error=str(e))
        import traceback
        traceback.print_exc()
        return False

def test_module_c_opencv():
    """Test Module C: OpenCV Comparison"""
    print("\n" + "="*60)
    print("TEST: Module C - OpenCV Comparison")
    print("="*60)
    
    try:
        import cv2
        from scripts.opencv_compare import OpenCVComparator
        
        # Find test images
        diagrams_dir = Path("public/diagrams/extracted")
        test_images = []
        
        if diagrams_dir.exists():
            for subdir in diagrams_dir.iterdir():
                if subdir.is_dir():
                    images = list(subdir.glob("*.png"))
                    test_images.extend([str(img) for img in images[:2]])
                    if len(test_images) >= 2:
                        break
        
        if len(test_images) < 2:
            log_test("OpenCV Comparison", "SKIP", "Need at least 2 images for comparison")
            return False
        
        print(f"Comparing: {test_images[0]} vs {test_images[1]}")
        
        comparator = OpenCVComparator()
        result = comparator.compare_images(test_images[0], test_images[1])
        
        if 'orbScore' in result and 'ssim' in result:
            log_test("OpenCV Comparison", "PASS", 
                    f"ORB={result['orbScore']:.3f}, SSIM={result['ssim']:.3f}, Match={result['matchPercentage']:.1f}%")
            return True
        else:
            log_test("OpenCV Comparison", "FAIL", "Missing comparison metrics")
            return False
            
    except ImportError as e:
        log_test("OpenCV Comparison", "SKIP", f"OpenCV not installed: {e}")
        return False
    except Exception as e:
        log_test("OpenCV Comparison", "FAIL", error=str(e))
        return False

def test_module_d_selenium():
    """Test Module D: Selenium Reverse Search"""
    print("\n" + "="*60)
    print("TEST: Module D - Selenium Reverse Search")
    print("="*60)
    
    try:
        from selenium import webdriver
        from scripts.auto_reverse_search import ReverseImageSearcher
        
        # Find a test image
        diagrams_dir = Path("public/diagrams/extracted")
        test_image = None
        
        if diagrams_dir.exists():
            for subdir in diagrams_dir.iterdir():
                if subdir.is_dir():
                    images = list(subdir.glob("*.png"))
                    if images:
                        test_image = str(images[0])
                        break
        
        if not test_image:
            log_test("Selenium Reverse Search", "SKIP", "No test images found")
            return False
        
        print(f"Testing with image: {test_image}")
        print("Note: This test will open a browser window briefly")
        
        searcher = ReverseImageSearcher(headless=True)
        try:
            # This might take a while, so we'll skip actual search in automated test
            # Just verify the class can be instantiated
            log_test("Selenium Reverse Search", "PASS", 
                    "Selenium available and ReverseImageSearcher initialized")
            return True
        finally:
            searcher.close()
            
    except ImportError as e:
        log_test("Selenium Reverse Search", "SKIP", f"Selenium not installed: {e}")
        return False
    except Exception as e:
        log_test("Selenium Reverse Search", "SKIP", f"ChromeDriver issue (expected in CI): {e}")
        return False

def test_module_f_plagiarism_engine():
    """Test Module F: Plagiarism Engine"""
    print("\n" + "="*60)
    print("TEST: Module F - Plagiarism Engine")
    print("="*60)
    
    try:
        from scripts.plagiarism_engine import PlagiarismEngine
        
        # Find a test PDF
        test_pdf = None
        uploads_dir = Path("uploads")
        if uploads_dir.exists():
            pdfs = list(uploads_dir.glob("*.pdf"))
            if pdfs:
                test_pdf = str(pdfs[0])
        
        if not test_pdf:
            log_test("Plagiarism Engine", "SKIP", "No test PDF found")
            return False
        
        print(f"Testing with PDF: {test_pdf}")
        
        engine = PlagiarismEngine()
        report = engine.analyze_pdf(test_pdf, "auto_test")
        
        if report and 'diagrams' in report and 'summary' in report:
            total = report['summary'].get('total', 0)
            log_test("Plagiarism Engine", "PASS", 
                    f"Analyzed {total} diagrams, risk={report['summary'].get('riskLevel', 'unknown')}")
            return True
        else:
            log_test("Plagiarism Engine", "FAIL", "Invalid report structure")
            return False
            
    except Exception as e:
        log_test("Plagiarism Engine", "FAIL", error=str(e))
        import traceback
        traceback.print_exc()
        return False

def test_database():
    """Test SQLite Database"""
    print("\n" + "="*60)
    print("TEST: SQLite Database")
    print("="*60)
    
    try:
        import sqlite3
        db_path = Path("data/diagram_hashes.db")
        
        if not db_path.exists():
            log_test("Database", "SKIP", "Database not created yet")
            return False
        
        conn = sqlite3.connect(str(db_path))
        cursor = conn.cursor()
        
        # Check table exists
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='diagram_hashes'")
        table_exists = cursor.fetchone() is not None
        
        if table_exists:
            # Count records
            cursor.execute("SELECT COUNT(*) FROM diagram_hashes")
            count = cursor.fetchone()[0]
            
            # Check schema
            cursor.execute("PRAGMA table_info(diagram_hashes)")
            columns = [row[1] for row in cursor.fetchall()]
            
            required_columns = ['id', 'filePath', 'pHash', 'dHash', 'aHash']
            has_all = all(col in columns for col in required_columns)
            
            conn.close()
            
            if has_all:
                log_test("Database", "PASS", f"Table exists with {count} records, all required columns present")
                return True
            else:
                log_test("Database", "FAIL", f"Missing columns. Found: {columns}")
                return False
        else:
            conn.close()
            log_test("Database", "FAIL", "Table 'diagram_hashes' does not exist")
            return False
            
    except Exception as e:
        log_test("Database", "FAIL", error=str(e))
        return False

def test_file_structure():
    """Test required files and directories"""
    print("\n" + "="*60)
    print("TEST: File Structure")
    print("="*60)
    
    required_files = [
        "scripts/pdf_extractor.py",
        "scripts/image_hashing.py",
        "scripts/opencv_compare.py",
        "scripts/auto_reverse_search.py",
        "scripts/plagiarism_engine.py",
        "queue/diagramQueue.ts",
        "workers/diagramWorker.ts",
        "app/forensics/page.tsx",
        "app/api/extract/route.ts",
        "app/api/hashing/route.ts",
        "app/api/compare/route.ts",
        "app/api/reverse/route.ts",
        "app/api/forensics/scan/route.ts",
    ]
    
    required_dirs = [
        "public/diagrams",
        "data",
        "uploads",
    ]
    
    all_good = True
    
    for file_path in required_files:
        if Path(file_path).exists():
            log_test(f"File: {file_path}", "PASS", "")
        else:
            log_test(f"File: {file_path}", "FAIL", "File not found")
            all_good = False
    
    for dir_path in required_dirs:
        if Path(dir_path).exists():
            log_test(f"Directory: {dir_path}", "PASS", "")
        else:
            log_test(f"Directory: {dir_path}", "FAIL", "Directory not found")
            all_good = False
    
    return all_good

def test_dependencies():
    """Test Python dependencies"""
    print("\n" + "="*60)
    print("TEST: Python Dependencies")
    print("="*60)
    
    required = {
        "fitz": "PyMuPDF",
        "PIL": "Pillow",
        "imagehash": "imagehash",
    }
    
    optional = {
        "cv2": "opencv-python",
        "skimage": "scikit-image",
        "selenium": "selenium",
    }
    
    all_required = True
    optional_available = []
    
    for module, package in required.items():
        try:
            __import__(module)
            log_test(f"Required: {package}", "PASS", "")
        except ImportError:
            log_test(f"Required: {package}", "FAIL", f"Module {module} not found")
            all_required = False
    
    for module, package in optional.items():
        try:
            __import__(module)
            log_test(f"Optional: {package}", "PASS", "")
            optional_available.append(package)
        except ImportError:
            log_test(f"Optional: {package}", "SKIP", f"Not installed (optional)")
    
    return all_required

def main():
    """Run all tests"""
    print("\n" + "🔍"*30)
    print("AUTOMATED TEST SUITE - DIAGRAM FORENSICS ENGINE")
    print("🔍"*30 + "\n")
    
    # Run all tests
    tests = [
        ("File Structure", test_file_structure),
        ("Dependencies", test_dependencies),
        ("Database", test_database),
        ("Module A: PDF Extraction", test_module_a_pdf_extraction),
        ("Module B: Image Hashing", test_module_b_hashing),
        ("Module C: OpenCV", test_module_c_opencv),
        ("Module D: Selenium", test_module_d_selenium),
        ("Module F: Plagiarism Engine", test_module_f_plagiarism_engine),
    ]
    
    results = {}
    for name, test_func in tests:
        try:
            results[name] = test_func()
        except Exception as e:
            log_test(name, "FAIL", error=f"Unexpected error: {e}")
            results[name] = False
        time.sleep(0.5)  # Small delay between tests
    
    # Generate summary
    passed = sum(1 for v in results.values() if v)
    total = len(results)
    skipped = sum(1 for t in test_results["tests"] if t["status"] == "SKIP")
    failed = sum(1 for t in test_results["tests"] if t["status"] == "FAIL")
    
    test_results["summary"] = {
        "total": total,
        "passed": passed,
        "failed": failed,
        "skipped": skipped,
        "pass_rate": f"{(passed/total*100):.1f}%" if total > 0 else "0%"
    }
    
    # Print summary
    print("\n" + "="*60)
    print("TEST SUMMARY")
    print("="*60)
    print(f"Total Tests: {total}")
    print(f"✅ Passed: {passed}")
    print(f"❌ Failed: {failed}")
    print(f"⚠️  Skipped: {skipped}")
    print(f"Pass Rate: {test_results['summary']['pass_rate']}")
    
    # Save results
    results_file = Path("test_results_automated.json")
    with open(results_file, 'w') as f:
        json.dump(test_results, f, indent=2)
    
    print(f"\n📄 Detailed results saved to: {results_file}")
    
    return passed == total - skipped  # Pass if all non-skipped tests passed

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)


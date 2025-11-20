"""
Test API Endpoints for Diagram Forensics Engine
"""

import requests
import json
import time
from pathlib import Path

BASE_URL = "http://localhost:3000"

def test_extract_api():
    """Test /api/extract endpoint"""
    print("\n" + "="*60)
    print("TEST: API /api/extract")
    print("="*60)
    
    try:
        # Find a test PDF
        test_pdf = None
        uploads_dir = Path("uploads")
        if uploads_dir.exists():
            pdfs = list(uploads_dir.glob("*.pdf"))
            if pdfs:
                test_pdf = pdfs[0]
        
        if not test_pdf:
            print("⚠️  No test PDF found")
            return False
        
        print(f"Testing with: {test_pdf.name}")
        
        with open(test_pdf, 'rb') as f:
            files = {'file': (test_pdf.name, f, 'application/pdf')}
            response = requests.post(f"{BASE_URL}/api/extract", files=files, timeout=60)
        
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Success: Extracted {data.get('count', 0)} diagrams")
            return True
        else:
            print(f"❌ Failed: {response.status_code} - {response.text}")
            return False
            
    except requests.exceptions.ConnectionError:
        print("⚠️  Next.js server not running. Start with: npm run dev")
        return False
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

def test_hashing_api():
    """Test /api/hashing endpoint"""
    print("\n" + "="*60)
    print("TEST: API /api/hashing")
    print("="*60)
    
    try:
        # Find a test image
        diagrams_dir = Path("public/diagrams/extracted")
        test_image = None
        
        if diagrams_dir.exists():
            for subdir in diagrams_dir.iterdir():
                if subdir.is_dir():
                    images = list(subdir.glob("*.png"))
                    if images:
                        # Convert to relative path
                        rel_path = images[0].relative_to(Path("public"))
                        test_image = str(rel_path).replace("\\", "/")
                        break
        
        if not test_image:
            print("⚠️  No test image found")
            return False
        
        print(f"Testing with: {test_image}")
        
        response = requests.post(
            f"{BASE_URL}/api/hashing",
            json={"imagePath": test_image},
            timeout=30
        )
        
        if response.status_code == 200:
            data = response.json()
            if data.get('success') and 'hashes' in data:
                print(f"✅ Success: Hashes computed")
                print(f"   pHash: {data['hashes']['pHash'][:32]}...")
                return True
            else:
                print(f"❌ Unexpected response: {data}")
                return False
        else:
            print(f"❌ Failed: {response.status_code} - {response.text}")
            return False
            
    except requests.exceptions.ConnectionError:
        print("⚠️  Next.js server not running")
        return False
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

def test_compare_api():
    """Test /api/compare endpoint"""
    print("\n" + "="*60)
    print("TEST: API /api/compare")
    print("="*60)
    
    try:
        # Find two test images
        diagrams_dir = Path("public/diagrams/extracted")
        test_images = []
        
        if diagrams_dir.exists():
            for subdir in diagrams_dir.iterdir():
                if subdir.is_dir():
                    images = list(subdir.glob("*.png"))
                    for img in images[:2]:
                        rel_path = img.relative_to(Path("public"))
                        test_images.append(str(rel_path).replace("\\", "/"))
                    if len(test_images) >= 2:
                        break
        
        if len(test_images) < 2:
            print("⚠️  Need at least 2 test images")
            return False
        
        print(f"Comparing: {test_images[0]} vs {test_images[1]}")
        
        response = requests.post(
            f"{BASE_URL}/api/compare",
            json={
                "image1Path": test_images[0],
                "image2Path": test_images[1]
            },
            timeout=30
        )
        
        if response.status_code == 200:
            data = response.json()
            if data.get('success') and 'comparison' in data:
                comp = data['comparison']
                print(f"✅ Success: ORB={comp.get('orbScore', 0):.3f}, SSIM={comp.get('ssim', 0):.3f}")
                return True
            else:
                print(f"❌ Unexpected response: {data}")
                return False
        else:
            print(f"❌ Failed: {response.status_code} - {response.text}")
            return False
            
    except requests.exceptions.ConnectionError:
        print("⚠️  Next.js server not running")
        return False
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

def main():
    """Run API tests"""
    print("\n" + "🌐"*30)
    print("API ENDPOINT TEST SUITE")
    print("🌐"*30)
    
    print("\n⚠️  Note: These tests require Next.js server to be running")
    print("   Start server with: npm run dev\n")
    
    results = {
        "Extract API": test_extract_api(),
        "Hashing API": test_hashing_api(),
        "Compare API": test_compare_api(),
    }
    
    print("\n" + "="*60)
    print("API TEST SUMMARY")
    print("="*60)
    
    for name, passed in results.items():
        status = "✅ PASS" if passed else "❌ FAIL / ⚠️  SKIP"
        print(f"{name:.<40} {status}")
    
    passed = sum(1 for v in results.values() if v)
    total = len(results)
    print(f"\nResults: {passed}/{total} API tests passed")

if __name__ == "__main__":
    try:
        import requests
    except ImportError:
        print("⚠️  'requests' library not installed. Install with: pip install requests")
        sys.exit(1)
    
    main()


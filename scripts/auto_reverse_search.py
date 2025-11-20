"""
Automated Reverse Image Search using Selenium
Supports Google Images and Bing Visual Search with anti-detection techniques.
"""

import sys
import json
import argparse
import time
from pathlib import Path
from typing import Dict, Optional, List
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from selenium.common.exceptions import TimeoutException, NoSuchElementException
import logging

# Try to import webdriver-manager for automatic ChromeDriver management
try:
    from webdriver_manager.chrome import ChromeDriverManager
    from selenium.webdriver.chrome.service import Service as ChromeService
    WEBDRIVER_MANAGER_AVAILABLE = True
except ImportError:
    WEBDRIVER_MANAGER_AVAILABLE = False
    ChromeDriverManager = None
    ChromeService = None

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class ReverseImageSearcher:
    """Automated reverse image search using Selenium"""
    
    def __init__(self, headless: bool = True, driver_path: str = None):
        """
        Initialize the reverse image searcher.
        
        Args:
            headless: Run browser in headless mode
            driver_path: Path to ChromeDriver (auto-detect if None)
        """
        self.headless = headless
        self.driver_path = driver_path
        self.driver = None
    
    def _setup_driver(self):
        """Setup Chrome WebDriver with anti-detection options"""
        chrome_options = Options()
        
        if self.headless:
            chrome_options.add_argument('--headless')
        
        # Anti-detection techniques
        chrome_options.add_argument('--no-sandbox')
        chrome_options.add_argument('--disable-dev-shm-usage')
        chrome_options.add_argument('--disable-blink-features=AutomationControlled')
        chrome_options.add_experimental_option("excludeSwitches", ["enable-automation"])
        chrome_options.add_experimental_option('useAutomationExtension', False)
        
        # User agent spoofing
        chrome_options.add_argument(
            'user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
            '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        )
        
        # Window size
        chrome_options.add_argument('--window-size=1920,1080')
        
        # Initialize driver
        if self.driver_path:
            service = Service(self.driver_path)
            self.driver = webdriver.Chrome(service=service, options=chrome_options)
        elif WEBDRIVER_MANAGER_AVAILABLE:
            # Use webdriver-manager to automatically download and manage ChromeDriver
            try:
                service = ChromeService(ChromeDriverManager().install())
                self.driver = webdriver.Chrome(service=service, options=chrome_options)
                logger.info("Using webdriver-manager for ChromeDriver")
            except Exception as e:
                logger.warning(f"webdriver-manager failed, trying default: {e}")
                self.driver = webdriver.Chrome(options=chrome_options)
        else:
            self.driver = webdriver.Chrome(options=chrome_options)
        
        # Execute script to remove webdriver property
        self.driver.execute_cdp_cmd('Page.addScriptToEvaluateOnNewDocument', {
            'source': '''
                Object.defineProperty(navigator, 'webdriver', {
                    get: () => undefined
                })
            '''
        })
        
        logger.info("ChromeDriver initialized")
    
    def _throttle(self, min_seconds: float = 1.0, max_seconds: float = 2.0):
        """Add random delay between actions"""
        import random
        delay = random.uniform(min_seconds, max_seconds)
        time.sleep(delay)
    
    def search_google(self, image_path: str) -> Dict[str, any]:
        """
        Perform reverse image search on Google Images.
        
        Args:
            image_path: Path to image file
        
        Returns:
            Dictionary with search results
        """
        if self.driver is None:
            self._setup_driver()
        
        try:
            # Navigate to Google Images
            self.driver.get('https://www.google.com/imghp')
            self._throttle(1, 2)
            
            # Click camera icon to upload image
            try:
                camera_button = WebDriverWait(self.driver, 10).until(
                    EC.element_to_be_clickable((By.CSS_SELECTOR, 'div[aria-label="Search by image"]'))
                )
                camera_button.click()
                self._throttle(1, 2)
            except TimeoutException:
                # Try alternative selector
                try:
                    camera_button = self.driver.find_element(By.CSS_SELECTOR, 'svg[data-svg="camera"]')
                    camera_button.click()
                    self._throttle(1, 2)
                except:
                    logger.warning("Could not find camera button, trying direct URL")
                    # Fallback: use direct URL
                    self.driver.get('https://www.google.com/searchbyimage/upload')
                    self._throttle(2, 3)
            
            # Upload image
            try:
                file_input = WebDriverWait(self.driver, 10).until(
                    EC.presence_of_element_located((By.CSS_SELECTOR, 'input[type="file"]'))
                )
                file_input.send_keys(str(Path(image_path).absolute()))
                logger.info("Image uploaded to Google Images")
            except TimeoutException:
                # Try alternative upload method
                try:
                    file_input = self.driver.find_element(By.NAME, 'encoded_image')
                    file_input.send_keys(str(Path(image_path).absolute()))
                except:
                    raise Exception("Could not find file input element")
            
            # Wait for results (5-8 seconds)
            self._throttle(5, 8)
            
            # Extract results
            results = {
                'searchEngine': 'google',
                'imagePath': image_path,
                'bestGuess': None,
                'similarImages': [],
                'matchingPages': [],
                'resultUrl': self.driver.current_url
            }
            
            # Extract best guess text
            try:
                best_guess_elements = self.driver.find_elements(
                    By.CSS_SELECTOR,
                    'div[data-attrid="kc:/visual:visual"] span, .g-blk span'
                )
                if best_guess_elements:
                    results['bestGuess'] = best_guess_elements[0].text
            except:
                pass
            
            # Extract similar image URLs
            try:
                similar_images = self.driver.find_elements(
                    By.CSS_SELECTOR,
                    'img[data-src], img[src]'
                )
                for img in similar_images[:10]:  # Limit to 10
                    img_url = img.get_attribute('src') or img.get_attribute('data-src')
                    if img_url and img_url.startswith('http'):
                        results['similarImages'].append(img_url)
            except:
                pass
            
            # Extract matching page URLs
            try:
                page_links = self.driver.find_elements(
                    By.CSS_SELECTOR,
                    'a[href*="http"]'
                )
                for link in page_links[:10]:  # Limit to 10
                    href = link.get_attribute('href')
                    if href and 'google.com' not in href:
                        results['matchingPages'].append(href)
            except:
                pass
            
            logger.info(f"Google search completed: {len(results['similarImages'])} similar images found")
            return results
            
        except Exception as e:
            logger.error(f"Error in Google search: {e}")
            return {
                'searchEngine': 'google',
                'imagePath': image_path,
                'error': str(e),
                'resultUrl': self.driver.current_url if self.driver else None
            }
    
    def search_bing(self, image_path: str) -> Dict[str, any]:
        """
        Perform reverse image search on Bing Visual Search.
        
        Args:
            image_path: Path to image file
        
        Returns:
            Dictionary with search results
        """
        if self.driver is None:
            self._setup_driver()
        
        try:
            # Navigate to Bing Visual Search
            self.driver.get('https://www.bing.com/images')
            self._throttle(1, 2)
            
            # Click camera icon
            try:
                camera_button = WebDriverWait(self.driver, 10).until(
                    EC.element_to_be_clickable((By.CSS_SELECTOR, 'label[for="sb_file"]'))
                )
                camera_button.click()
                self._throttle(1, 2)
            except TimeoutException:
                # Try alternative selector
                try:
                    camera_button = self.driver.find_element(By.ID, 'sb_file')
                    camera_button.click()
                except:
                    raise Exception("Could not find Bing camera button")
            
            # Upload image
            try:
                file_input = WebDriverWait(self.driver, 10).until(
                    EC.presence_of_element_located((By.ID, 'sb_file'))
                )
                file_input.send_keys(str(Path(image_path).absolute()))
                logger.info("Image uploaded to Bing Visual Search")
            except TimeoutException:
                raise Exception("Could not find Bing file input element")
            
            # Wait for results (5-8 seconds)
            self._throttle(5, 8)
            
            # Extract results
            results = {
                'searchEngine': 'bing',
                'imagePath': image_path,
                'bestGuess': None,
                'similarImages': [],
                'matchingPages': [],
                'resultUrl': self.driver.current_url
            }
            
            # Extract best guess
            try:
                best_guess = self.driver.find_element(By.CSS_SELECTOR, '.b_rich h2, .b_rich .b_caption')
                results['bestGuess'] = best_guess.text
            except:
                pass
            
            # Extract similar images
            try:
                similar_images = self.driver.find_elements(
                    By.CSS_SELECTOR,
                    'img[src*="bing"], img[data-src*="bing"]'
                )
                for img in similar_images[:10]:
                    img_url = img.get_attribute('src') or img.get_attribute('data-src')
                    if img_url:
                        results['similarImages'].append(img_url)
            except:
                pass
            
            # Extract matching pages
            try:
                page_links = self.driver.find_elements(
                    By.CSS_SELECTOR,
                    'a[href*="http"]'
                )
                for link in page_links[:10]:
                    href = link.get_attribute('href')
                    if href and 'bing.com' not in href:
                        results['matchingPages'].append(href)
            except:
                pass
            
            logger.info(f"Bing search completed: {len(results['similarImages'])} similar images found")
            return results
            
        except Exception as e:
            logger.error(f"Error in Bing search: {e}")
            return {
                'searchEngine': 'bing',
                'imagePath': image_path,
                'error': str(e),
                'resultUrl': self.driver.current_url if self.driver else None
            }
    
    def close(self):
        """Close the browser"""
        if self.driver:
            self.driver.quit()
            self.driver = None


def main():
    """CLI entry point"""
    parser = argparse.ArgumentParser(
        description="Automated reverse image search"
    )
    parser.add_argument("image_path", help="Path to image file")
    parser.add_argument(
        "--engine",
        choices=['google', 'bing', 'both'],
        default='google',
        help="Search engine to use"
    )
    parser.add_argument(
        "--headless",
        action="store_true",
        help="Run browser in headless mode"
    )
    parser.add_argument(
        "--driver-path",
        help="Path to ChromeDriver executable"
    )
    
    args = parser.parse_args()
    
    searcher = ReverseImageSearcher(
        headless=args.headless,
        driver_path=args.driver_path
    )
    
    try:
        results = {}
        
        if args.engine in ['google', 'both']:
            results['google'] = searcher.search_google(args.image_path)
        
        if args.engine in ['bing', 'both']:
            results['bing'] = searcher.search_bing(args.image_path)
        
        print(json.dumps(results, indent=2))
        
        sys.exit(0)
        
    except Exception as e:
        logger.error(f"Fatal error: {e}")
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)
    finally:
        searcher.close()


if __name__ == "__main__":
    main()


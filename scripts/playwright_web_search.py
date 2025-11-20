"""
Playwright-based Reverse Image Search - Optimized Version
Improved accuracy and speed for reverse image searching using Google Images.
"""

import sys
import json
import argparse
import time
import logging
import random
from pathlib import Path
from typing import Dict, List, Any, Optional
from urllib.parse import urlparse, quote
import asyncio

# Try to import playwright
try:
    from playwright.async_api import async_playwright, Browser, Page, TimeoutError as PlaywrightTimeout
    PLAYWRIGHT_AVAILABLE = True
except ImportError:
    PLAYWRIGHT_AVAILABLE = False
    print("ERROR: playwright not installed. Install with: pip install playwright && playwright install chromium", file=sys.stderr)
    sys.exit(1)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    stream=sys.stderr
)
logger = logging.getLogger(__name__)


class WebImageSearcher:
    """Search for images on the web using Playwright with async for better performance"""
    
    def __init__(self, headless: bool = True, timeout: int = 30000):
        """
        Initialize the web searcher.
        
        Args:
            headless: Run browser in headless mode
            timeout: Page timeout in milliseconds (default: 30 seconds - reduced from 60)
        """
        self.headless = headless
        self.timeout = timeout
        self.browser: Optional[Browser] = None
        self.playwright = None
    
    async def __aenter__(self):
        """Async context manager entry"""
        logger.info("Starting Playwright browser...")
        self.playwright = await async_playwright().start()
        
        # Enhanced anti-detection browser arguments
        browser_args = [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-blink-features=AutomationControlled',  # Critical for avoiding detection
            '--disable-features=IsolateOrigins,site-per-process',
            '--disable-site-isolation-trials',
            '--disable-web-security',
            '--disable-features=VizDisplayCompositor',
            '--disable-ipc-flooding-protection',
            '--disable-renderer-backgrounding',
            '--disable-backgrounding-occluded-windows',
            '--disable-component-extensions-with-background-pages',
            '--disable-default-apps',
            '--mute-audio',
            '--no-default-browser-check',
            '--no-first-run',
            '--no-pings',
            '--no-zygote',
            '--disable-extensions',
            '--disable-plugins',
            '--disable-background-networking',
            '--disable-sync',
            '--disable-translate',
            '--hide-scrollbars',
            '--metrics-recording-only',
            '--mute-audio',
            '--no-first-run',
            '--safebrowsing-disable-auto-update',
            '--ignore-ssl-errors',
            '--ignore-certificate-errors',
            '--ignore-certificate-errors-spki-list',
            '--ignore-ssl-errors',
            '--disable-infobars',
            '--window-size=1920,1080',
        ]
        
        self.browser = await self.playwright.chromium.launch(
            headless=self.headless,
            args=browser_args,
            slow_mo=random.randint(50, 150) if not self.headless else 0  # Random delay in visible mode
        )
        logger.info("Browser launched successfully")
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit"""
        if self.browser:
            await self.browser.close()
        if self.playwright:
            await self.playwright.stop()
    
    async def search_google_images(self, image_path: str) -> Dict[str, Any]:
        """
        Search Google Images for the given image using async for better performance.
        
        Args:
            image_path: Path to image file
            
        Returns:
            Dictionary with search results
        """
        if not Path(image_path).exists():
            return {
                'error': f'Image file not found: {image_path}',
                'found': False
            }
        
        try:
            # Create context with enhanced anti-detection settings
            logger.info("Creating browser context...")
            
            # Random user agent rotation (realistic Chrome versions)
            user_agents = [
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            ]
            
            context = await self.browser.new_context(
                user_agent=random.choice(user_agents),
                viewport={'width': 1920, 'height': 1080},
                locale='en-US',
                timezone_id='America/New_York',
                permissions=['geolocation'],
                geolocation={'latitude': 40.7128, 'longitude': -74.0060},  # New York
                color_scheme='light',
                ignore_https_errors=True,
                # Add extra HTTP headers to look more like a real browser
                extra_http_headers={
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'DNT': '1',
                    'Connection': 'keep-alive',
                    'Upgrade-Insecure-Requests': '1',
                    'Sec-Fetch-Dest': 'document',
                    'Sec-Fetch-Mode': 'navigate',
                    'Sec-Fetch-Site': 'none',
                    'Sec-Fetch-User': '?1',
                    'Cache-Control': 'max-age=0',
                }
            )
            
            # DO NOT block resources - this is a major detection flag
            # Google detects when resources are blocked
            
            page = await context.new_page()
            page.set_default_timeout(self.timeout)
            
            # Inject anti-detection JavaScript
            await page.add_init_script("""
                // Remove webdriver property
                Object.defineProperty(navigator, 'webdriver', {
                    get: () => undefined
                });
                
                // Override plugins
                Object.defineProperty(navigator, 'plugins', {
                    get: () => [1, 2, 3, 4, 5]
                });
                
                // Override languages
                Object.defineProperty(navigator, 'languages', {
                    get: () => ['en-US', 'en']
                });
                
                // Override permissions
                const originalQuery = window.navigator.permissions.query;
                window.navigator.permissions.query = (parameters) => (
                    parameters.name === 'notifications' ?
                        Promise.resolve({ state: Notification.permission }) :
                        originalQuery(parameters)
                );
                
                // Mock chrome object
                window.chrome = {
                    runtime: {}
                };
                
                // Override getBattery
                if (navigator.getBattery) {
                    navigator.getBattery = () => Promise.resolve({
                        charging: true,
                        chargingTime: 0,
                        dischargingTime: Infinity,
                        level: 1
                    });
                }
            """)
            
            # Add random delay before starting (mimic human behavior)
            await asyncio.sleep(random.uniform(1.0, 3.0))
            
            # Navigate directly to Google Lens upload URL (faster than clicking through UI)
            logger.info(f"Uploading image to Google Lens: {image_path}")
            
            # Method 1: Try direct upload via Google Lens API endpoint (fastest)
            try:
                result = await self._search_via_lens_upload(page, image_path)
                await context.close()
                return result
            except Exception as e:
                logger.warning(f"Direct Lens upload failed, falling back to UI method: {e}")
                # Fall back to UI method
                result = await self._search_via_ui(page, image_path)
                await context.close()
                return result
            
        except Exception as e:
            logger.error(f"Error in Google Images search: {e}")
            return {
                'error': str(e),
                'found': False
            }
    
    async def _search_via_lens_upload(self, page: Page, image_path: str) -> Dict[str, Any]:
        """
        Fast method: Upload directly to Google Lens endpoint.
        This bypasses the UI and is much faster.
        """
        logger.info("Using direct Lens upload method...")
        
        # Navigate to Google Lens with human-like behavior
        await page.goto('https://lens.google.com/upload?hl=en', wait_until='networkidle', timeout=30000)
        
        # Random delay to mimic human reading time
        await asyncio.sleep(random.uniform(1.5, 3.0))
        
        # Check if we hit CAPTCHA
        if 'sorry' in page.url.lower() or 'captcha' in page.url.lower():
            logger.warning("Detected CAPTCHA page, returning empty results")
            return {
                'found': False,
                'similarImages': [],
                'matchingPages': [],
                'bestGuess': None,
                'resultUrl': page.url,
                'count': 0,
                'error': 'CAPTCHA detected - Google blocked automated request'
            }
        
        # Wait for and find file input
        try:
            file_input = await page.wait_for_selector('input[type="file"]', timeout=10000)
            # Small delay before upload
            await asyncio.sleep(random.uniform(0.5, 1.5))
            await file_input.set_input_files(image_path)
            logger.info("Image uploaded to Google Lens")
        except PlaywrightTimeout:
            logger.warning("File input not found, may have hit CAPTCHA")
            return {
                'found': False,
                'similarImages': [],
                'matchingPages': [],
                'bestGuess': None,
                'resultUrl': page.url,
                'count': 0,
                'error': 'File input not found - possible CAPTCHA'
            }
        
        # Wait for results - Google Lens shows results faster than Images
        try:
            await page.wait_for_selector('div[role="link"], a[href*="/search"]', timeout=20000)
            await asyncio.sleep(random.uniform(2.0, 4.0))  # Random wait for results to stabilize
        except PlaywrightTimeout:
            logger.warning("Timeout waiting for Lens results")
        
        # Check again for CAPTCHA after upload
        if 'sorry' in page.url.lower() or 'captcha' in page.url.lower():
            logger.warning("Detected CAPTCHA after upload")
            return {
                'found': False,
                'similarImages': [],
                'matchingPages': [],
                'bestGuess': None,
                'resultUrl': page.url,
                'count': 0,
                'error': 'CAPTCHA detected after upload'
            }
        
        # Extract results
        return await self._extract_google_results(page)
    
    async def _search_via_ui(self, page: Page, image_path: str) -> Dict[str, Any]:
        """
        Fallback method: Use Google Images UI.
        Simplified selector strategy for speed.
        """
        logger.info("Using Google Images UI method...")
        
        await page.goto('https://www.google.com/imghp', wait_until='networkidle', timeout=30000)
        
        # Check for CAPTCHA immediately
        if 'sorry' in page.url.lower() or 'captcha' in page.url.lower():
            logger.warning("Detected CAPTCHA page on initial load")
            return {
                'found': False,
                'similarImages': [],
                'matchingPages': [],
                'bestGuess': None,
                'resultUrl': page.url,
                'count': 0,
                'error': 'CAPTCHA detected - Google blocked automated request'
            }
        
        # Random delay to mimic human behavior
        await asyncio.sleep(random.uniform(2.0, 4.0))
        
        # Simulate mouse movement (human-like behavior)
        await page.mouse.move(random.randint(100, 500), random.randint(100, 500))
        await asyncio.sleep(random.uniform(0.3, 0.8))
        
        # Optimized selector - try only the most reliable ones
        camera_selectors = [
            'div[aria-label="Search by image"]',
            'div[jsname="O1htCb"]',  # Google's internal element name
            'span.Gdd5U.mR2gOd.ITpyKd',  # Camera icon span
        ]
        
        clicked = False
        for selector in camera_selectors:
            try:
                camera = page.locator(selector).first
                if await camera.count() > 0:
                    # Move mouse to element before clicking (human-like)
                    box = await camera.bounding_box()
                    if box:
                        await page.mouse.move(box['x'] + box['width']/2, box['y'] + box['height']/2)
                        await asyncio.sleep(random.uniform(0.2, 0.5))
                    await camera.click(timeout=5000)
                    clicked = True
                    logger.info(f"Clicked camera icon: {selector}")
                    break
            except:
                continue
        
        if not clicked:
            # Check if CAPTCHA appeared
            if 'sorry' in page.url.lower() or 'captcha' in page.url.lower():
                logger.warning("CAPTCHA detected when trying to click camera")
                return {
                    'found': False,
                    'similarImages': [],
                    'matchingPages': [],
                    'bestGuess': None,
                    'resultUrl': page.url,
                    'count': 0,
                    'error': 'CAPTCHA detected'
                }
            raise Exception("Could not find camera icon")
        
        await asyncio.sleep(random.uniform(1.0, 2.0))
        
        # Upload image - simplified
        try:
            file_input = page.locator('input[type="file"]').first
            await file_input.set_input_files(image_path)
            logger.info("Image uploaded")
        except Exception as e:
            logger.error(f"Failed to upload image: {e}")
            if 'sorry' in page.url.lower() or 'captcha' in page.url.lower():
                return {
                    'found': False,
                    'similarImages': [],
                    'matchingPages': [],
                    'bestGuess': None,
                    'resultUrl': page.url,
                    'count': 0,
                    'error': 'CAPTCHA detected during upload'
                }
            raise
        
        # Wait for results with shorter timeout
        try:
            await page.wait_for_url("**/search?**", timeout=20000)
            await asyncio.sleep(random.uniform(2.0, 4.0))
        except PlaywrightTimeout:
            logger.warning("Timeout waiting for results URL")
        
        # Final CAPTCHA check
        if 'sorry' in page.url.lower() or 'captcha' in page.url.lower():
            logger.warning("CAPTCHA detected after search")
            return {
                'found': False,
                'similarImages': [],
                'matchingPages': [],
                'bestGuess': None,
                'resultUrl': page.url,
                'count': 0,
                'error': 'CAPTCHA detected after search'
            }
        
        return await self._extract_google_results(page)
    
    async def _extract_google_results(self, page: Page) -> Dict[str, Any]:
        """
        Extract search results from Google page.
        Optimized for speed with parallel extraction.
        """
        logger.info("Extracting results...")
        
        results = {
            'found': False,
            'similarImages': [],
            'matchingPages': [],
            'bestGuess': None,
            'resultUrl': page.url,
            'count': 0
        }
        
        try:
            # Extract all data in parallel for speed
            tasks = [
                self._get_best_guess(page),
                self._get_similar_images(page),
                self._get_matching_pages(page)
            ]
            
            best_guess, similar_images, matching_pages = await asyncio.gather(*tasks, return_exceptions=True)
            
            # Process results
            if not isinstance(best_guess, Exception) and best_guess:
                results['bestGuess'] = best_guess
                logger.info(f"Best guess: {best_guess}")
            
            if not isinstance(similar_images, Exception) and similar_images:
                results['similarImages'] = similar_images
                results['count'] = len(similar_images)
                results['found'] = True
                logger.info(f"Found {len(similar_images)} similar images")
            
            if not isinstance(matching_pages, Exception) and matching_pages:
                results['matchingPages'] = matching_pages
                results['found'] = True
                logger.info(f"Found {len(matching_pages)} matching pages")
            
        except Exception as e:
            logger.error(f"Error extracting results: {e}")
        
        return results
    
    async def _get_best_guess(self, page: Page) -> Optional[str]:
        """Extract best guess text"""
        try:
            # Multiple selectors for best guess
            selectors = [
                'div.UAiK1e',  # Google's class for best guess
                'a.fKDtNb',
                'div:has-text("Best guess")',
            ]
            
            for selector in selectors:
                try:
                    elem = page.locator(selector).first
                    if await elem.count() > 0:
                        text = await elem.text_content()
                        if text:
                            return text.replace('Best guess', '').strip()
                except:
                    continue
        except:
            pass
        return None
    
    async def _get_similar_images(self, page: Page) -> List[Dict[str, str]]:
        """Extract similar images"""
        try:
            # Optimized selectors
            selectors = [
                'div[data-lpage] img',
                'div[jsname] img[src*="http"]',
                'g-img img',
            ]
            
            for selector in selectors:
                try:
                    images = await page.locator(selector).all()
                    if len(images) > 0:
                        similar = []
                        # Process only first 15 images for speed
                        for img in images[:15]:
                            try:
                                src = await img.get_attribute('src')
                                if src and src.startswith('http'):
                                    similar.append({
                                        'url': src,
                                        'thumbnail': src
                                    })
                            except:
                                continue
                        if similar:
                            return similar
                except:
                    continue
        except:
            pass
        return []
    
    async def _get_matching_pages(self, page: Page) -> List[Dict[str, str]]:
        """Extract matching pages"""
        try:
            # Look for result links
            links = await page.locator('a[href*="http"]').all()
            matching = []
            
            for link in links[:20]:  # Check first 20 links
                try:
                    href = await link.get_attribute('href')
                    if not href:
                        continue
                    
                    # Filter out Google domains
                    parsed = urlparse(href)
                    if any(domain in parsed.netloc for domain in ['google.com', 'gstatic.com', 'ggpht.com']):
                        continue
                    
                    text = await link.text_content()
                    if text and len(text.strip()) > 3:
                        matching.append({
                            'url': href,
                            'title': text.strip()[:150]
                        })
                        
                        if len(matching) >= 10:  # Limit to 10 results
                            break
                except:
                    continue
            
            return matching
        except:
            pass
        return []
    
    async def search_bing_visual(self, image_path: str) -> Dict[str, Any]:
        """
        Search Bing Visual Search (async optimized).
        """
        if not Path(image_path).exists():
            return {
                'error': f'Image file not found: {image_path}',
                'found': False
            }
        
        try:
            context = await self.browser.new_context(
                user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            )
            page = await context.new_page()
            page.set_default_timeout(self.timeout)
            
            logger.info(f"Navigating to Bing Visual Search: {image_path}")
            await page.goto('https://www.bing.com/visualsearch', wait_until='domcontentloaded')
            
            # Find and click upload button
            try:
                # Bing has a simpler UI
                file_input = await page.wait_for_selector('input[type="file"]', timeout=10000)
                await file_input.set_input_files(image_path)
                logger.info("Image uploaded to Bing")
                
                # Wait for results
                await page.wait_for_selector('div.item', timeout=15000)
                await asyncio.sleep(2)
                
            except Exception as e:
                logger.error(f"Error with Bing upload: {e}")
                await context.close()
                return {'error': str(e), 'found': False}
            
            # Extract results
            results = await self._extract_bing_results(page)
            await context.close()
            
            return results
            
        except Exception as e:
            logger.error(f"Error in Bing Visual Search: {e}")
            return {'error': str(e), 'found': False}
    
    async def _extract_bing_results(self, page: Page) -> Dict[str, Any]:
        """Extract results from Bing (async)"""
        results = {
            'found': False,
            'similarImages': [],
            'matchingPages': [],
            'resultUrl': page.url,
            'count': 0
        }
        
        try:
            # Extract images
            images = await page.locator('img[src*="http"]').all()
            similar = []
            
            for img in images[:15]:
                try:
                    src = await img.get_attribute('src')
                    if src and 'bing.com' not in src:
                        similar.append({'url': src, 'thumbnail': src})
                except:
                    continue
            
            results['similarImages'] = similar
            results['count'] = len(similar)
            if similar:
                results['found'] = True
            
            # Extract pages
            links = await page.locator('a[href*="http"]').all()
            matching = []
            
            for link in links[:15]:
                try:
                    href = await link.get_attribute('href')
                    text = await link.text_content()
                    if href and text and 'bing.com' not in href:
                        matching.append({
                            'url': href,
                            'title': text.strip()[:150]
                        })
                        if len(matching) >= 10:
                            break
                except:
                    continue
            
            results['matchingPages'] = matching
            if matching:
                results['found'] = True
            
        except Exception as e:
            logger.error(f"Error extracting Bing results: {e}")
        
        return results


async def search_image_web_async(image_path: str, engine: str = 'google', headless: bool = True) -> Dict[str, Any]:
    """
    Async version of search_image_web for better performance.
    
    Args:
        image_path: Path to image file
        engine: Search engine ('google' or 'bing')
        headless: Run browser in headless mode
        
    Returns:
        Dictionary with search results
    """
    if not PLAYWRIGHT_AVAILABLE:
        return {'error': 'Playwright not available', 'found': False}
    
    async with WebImageSearcher(headless=headless) as searcher:
        if engine.lower() == 'google':
            return await searcher.search_google_images(image_path)
        elif engine.lower() == 'bing':
            return await searcher.search_bing_visual(image_path)
        else:
            return {'error': f'Unknown engine: {engine}', 'found': False}


def search_image_web(image_path: str, engine: str = 'google', headless: bool = True) -> Dict[str, Any]:
    """
    Synchronous wrapper for backward compatibility.
    """
    return asyncio.run(search_image_web_async(image_path, engine, headless))


def main():
    """CLI entry point"""
    parser = argparse.ArgumentParser(
        description="Fast reverse image search using Playwright"
    )
    parser.add_argument("image_path", help="Path to image file")
    parser.add_argument(
        "--engine",
        choices=['google', 'bing'],
        default='google',
        help="Search engine to use (default: google)"
    )
    parser.add_argument(
        "--visible",
        action='store_true',
        help="Run browser in visible mode"
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
    
    headless = not args.visible
    
    logger.info("=" * 60)
    logger.info("Playwright Reverse Image Search (Optimized)")
    logger.info("=" * 60)
    logger.info(f"Image: {args.image_path}")
    logger.info(f"Engine: {args.engine}")
    logger.info(f"Headless: {headless}")
    logger.info("=" * 60)
    
    try:
        start_time = time.time()
        result = search_image_web(args.image_path, args.engine, headless)
        elapsed = time.time() - start_time
        
        logger.info("=" * 60)
        logger.info(f"Search completed in {elapsed:.2f} seconds")
        logger.info("=" * 60)
        
        print(json.dumps(result, indent=2))
        sys.exit(0)
    except Exception as e:
        logger.error(f"Fatal error: {e}")
        import traceback
        logger.error(traceback.format_exc())
        print(json.dumps({'error': str(e), 'found': False}), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
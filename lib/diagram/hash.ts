/**
 * Diagram Hash Utilities
 * Utilities for working with perceptual hashes and duplicate detection
 */

/**
 * Compare two perceptual hashes to determine similarity
 * @param hash1 First perceptual hash string
 * @param hash2 Second perceptual hash string
 * @returns Hamming distance (lower = more similar, 0 = identical)
 */
export function compareHashes(hash1: string, hash2: string): number {
  if (!hash1 || !hash2 || hash1.length !== hash2.length) {
    return Infinity; // Cannot compare
  }

  let distance = 0;
  for (let i = 0; i < hash1.length; i++) {
    if (hash1[i] !== hash2[i]) {
      distance++;
    }
  }
  return distance;
}

/**
 * Check if two hashes are similar (within threshold)
 * @param hash1 First perceptual hash string
 * @param hash2 Second perceptual hash string
 * @param threshold Maximum Hamming distance to consider similar (default: 5)
 * @returns True if hashes are similar
 */
export function areHashesSimilar(
  hash1: string,
  hash2: string,
  threshold: number = 5
): boolean {
  const distance = compareHashes(hash1, hash2);
  return distance <= threshold;
}

/**
 * Format hash for display (truncate if too long)
 * @param hash Perceptual hash string
 * @param maxLength Maximum length to display (default: 16)
 * @returns Formatted hash string
 */
export function formatHash(hash: string, maxLength: number = 16): string {
  if (!hash) return "";
  if (hash.length <= maxLength) return hash;
  return `${hash.substring(0, maxLength)}...`;
}

/**
 * Generate Google Images reverse search URL
 * @param imageUrl Public URL to the image
 * @returns Google Images search URL
 */
export function getGoogleImagesUrl(imageUrl: string): string {
  return `https://www.google.com/searchbyimage?image_url=${encodeURIComponent(imageUrl)}`;
}

/**
 * Generate Bing Visual Search URL
 * @param imageUrl Public URL to the image
 * @returns Bing Visual Search URL
 */
export function getBingVisualSearchUrl(imageUrl: string): string {
  return `https://www.bing.com/images/search?view=detailv2&iss=sbi&form=SBIVSP&sbisrc=UrlPaste&q=imgurl:${encodeURIComponent(imageUrl)}`;
}


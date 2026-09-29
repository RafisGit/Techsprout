/**
 * Client-safe Cloudinary Delivery & URL Transformation Helpers
 *
 * NOTE: This module is client-compatible and contains NO API secrets.
 * All image and video delivery URLs use Cloudinary's public URL distribution schema.
 */

export interface ImageTransformOptions {
  width?: number;
  height?: number;
  crop?: 'fill' | 'fit' | 'limit' | 'pad' | 'scale' | 'thumb';
  quality?: 'auto' | number | string;
  format?: 'auto' | 'webp' | 'avif' | 'png' | 'jpg';
  gravity?: 'auto' | 'face' | 'center';
}

export interface VideoTransformOptions {
  width?: number;
  height?: number;
  quality?: 'auto' | number | string;
  format?: 'auto' | 'mp4' | 'webm';
}

/**
 * Checks whether a given string is a Cloudinary CDN delivery URL.
 */
export function isCloudinaryUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  return url.includes('res.cloudinary.com');
}

/**
 * Builds an optimized Cloudinary image delivery URL with automatic format and quality.
 * Safe fallback: If passed a local asset, data URI, or non-Cloudinary URL, returns the original source unchanged.
 */
export function getOptimizedImageUrl(src: string, options: ImageTransformOptions = {}): string {
  if (!src) return '';

  const { width, height, crop = 'fill', quality = 'auto', format = 'auto', gravity } = options;

  // Build transformation string (e.g., f_auto,q_auto,w_400,h_300,c_fill)
  const transformations: string[] = [];
  if (format) transformations.push(`f_${format}`);
  if (quality) transformations.push(`q_${quality}`);
  if (width) transformations.push(`w_${width}`);
  if (height) transformations.push(`h_${height}`);
  if (width || height) transformations.push(`c_${crop}`);
  if (gravity) transformations.push(`g_${gravity}`);

  const transformString = transformations.join(',');

  // Case 1: Already a full Cloudinary URL
  if (isCloudinaryUrl(src)) {
    const uploadIndex = src.indexOf('/upload/');
    if (uploadIndex === -1) return src;

    // Check if URL already has transformations directly after /upload/
    const prefix = src.substring(0, uploadIndex + 8);
    const suffix = src.substring(uploadIndex + 8);

    return `${prefix}${transformString}/${suffix}`;
  }

  // Case 2: Public ID passed directly
  if (!src.startsWith('http://') && !src.startsWith('https://') && !src.startsWith('/')) {
    const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || 'techsprout';
    return `https://res.cloudinary.com/${cloudName}/image/upload/${transformString}/${src}`;
  }

  // Case 3: Local or external non-Cloudinary URL — return untouched
  return src;
}

/**
 * Builds an optimized Cloudinary video delivery URL with automatic format and streaming optimizations.
 * Safe fallback: If passed a non-Cloudinary video URL (such as mock videos), returns it unchanged.
 */
export function getOptimizedVideoUrl(src: string, options: VideoTransformOptions = {}): string {
  if (!src) return '';

  const { width, height, quality = 'auto', format = 'auto' } = options;

  const transformations: string[] = [];
  if (format) transformations.push(`f_${format}`);
  if (quality) transformations.push(`q_${quality}`);
  if (width) transformations.push(`w_${width}`);
  if (height) transformations.push(`h_${height}`);

  const transformString = transformations.join(',');

  // Case 1: Already a full Cloudinary URL
  if (isCloudinaryUrl(src)) {
    const uploadIndex = src.indexOf('/upload/');
    if (uploadIndex === -1) return src;

    const prefix = src.substring(0, uploadIndex + 8);
    const suffix = src.substring(uploadIndex + 8);

    return `${prefix}${transformString}/${suffix}`;
  }

  // Case 2: Public ID passed directly
  if (!src.startsWith('http://') && !src.startsWith('https://') && !src.startsWith('/')) {
    const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || 'techsprout';
    return `https://res.cloudinary.com/${cloudName}/video/upload/${transformString}/${src}`;
  }

  // Case 3: External URL (e.g. mock w3schools mp4) — return untouched
  return src;
}

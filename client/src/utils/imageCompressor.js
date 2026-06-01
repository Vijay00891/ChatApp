/**
 * Browser-side image compression utility.
 * Compresses images before upload to reduce network payload by 70–95%.
 *
 * Target: 5–10MB image → 200–800KB compressed.
 */
import imageCompression from 'browser-image-compression';

/**
 * Compress an image file in the browser.
 * @param {File} file - The original image File object
 * @returns {Promise<{ compressedFile: File, stats: object }>}
 */
export async function compressImage(file) {
  const originalSize = file.size;

  const options = {
    maxSizeMB: 0.8,              // Target ≤ 800KB
    maxWidthOrHeight: 1600,      // Resize if any dimension > 1600px
    useWebWorker: true,          // Offload to Web Worker for non-blocking UI
    fileType: getOutputType(file.type),
    initialQuality: 0.8,        // JPEG/WebP quality 80%
    exifOrientation: -1,         // Strip EXIF metadata
    preserveExif: false,
  };

  const compressedFile = await imageCompression(file, options);
  const compressedSize = compressedFile.size;
  const ratio = ((1 - compressedSize / originalSize) * 100).toFixed(1);

  const stats = {
    originalSize,
    compressedSize,
    compressionRatio: `${ratio}%`,
    originalName: file.name,
  };

  console.log(
    `[Image Compression] ${file.name}: ${formatBytes(originalSize)} → ${formatBytes(compressedSize)} (${ratio}% reduction)`
  );

  return { compressedFile, stats };
}

/**
 * Determine output file type. Convert unsupported formats to JPEG.
 */
function getOutputType(mimeType) {
  const supported = ['image/jpeg', 'image/png', 'image/webp'];
  return supported.includes(mimeType) ? mimeType : 'image/jpeg';
}

/**
 * Format bytes into human-readable string.
 */
function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

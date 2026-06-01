/**
 * Media optimization utilities.
 * Image compression has been moved to the browser (client/src/utils/imageCompressor.js).
 * This module handles: video metadata, video compression (FFmpeg), thumbnail extraction,
 * and Cloudinary upload with local fallback.
 */
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const fs = require('fs');
const path = require('path');

ffmpeg.setFfmpegPath(ffmpegStatic);

// ── Cloudinary unsigned upload ────────────────────────────────────────────────
async function uploadToCloudinaryUnsigned(filePath, cloudName, uploadPreset) {
  const fileBuffer = fs.readFileSync(filePath);
  const blob = new Blob([fileBuffer]);

  const formData = new FormData();
  formData.append('file', blob, path.basename(filePath));
  formData.append('upload_preset', uploadPreset);

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`,
    { method: 'POST', body: formData }
  );

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error?.message || 'Cloudinary upload failed');
  }
  return data.secure_url;
}

// ── Upload helper with local storage fallback ────────────────────────────────
async function uploadFileHelper(filePath, filename, options = {}) {
  const cloudName = options.cloudName || process.env.CLOUDINARY_CLOUD_NAME || process.env.VITE_CLOUDINARY_CLOUD_NAME;
  const uploadPreset = options.uploadPreset || process.env.CLOUDINARY_UPLOAD_PRESET || process.env.VITE_CLOUDINARY_UPLOAD_PRESET;

  if (cloudName && uploadPreset) {
    try {
      console.log(`[Media Uploader] Uploading ${filename} to Cloudinary...`);
      const url = await uploadToCloudinaryUnsigned(filePath, cloudName, uploadPreset);
      console.log(`[Media Uploader] Cloudinary upload successful: ${url}`);
      return url;
    } catch (err) {
      console.error('[Media Uploader] Cloudinary upload failed, falling back to local storage:', err.message);
    }
  }

  // Local fallback
  const publicDir = path.join(__dirname, '../public/uploads');
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }
  const destPath = path.join(publicDir, filename);
  fs.copyFileSync(filePath, destPath);

  const serverUrl = process.env.SERVER_URL || `http://localhost:${process.env.PORT || 8000}`;
  console.log(`[Media Uploader] Local file stored at: ${destPath}`);
  return `${serverUrl}/uploads/${filename}`;
}

// ── Video metadata extraction via ffprobe ────────────────────────────────────
function getVideoMetadata(filePath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) return reject(err);
      const videoStream = metadata.streams.find(s => s.codec_type === 'video');
      const duration = parseFloat(metadata.format.duration) || 0;
      const resolution = videoStream ? `${videoStream.width}x${videoStream.height}` : '';
      const fps = videoStream && videoStream.r_frame_rate
        ? parseFloat(videoStream.r_frame_rate.split('/').reduce((a, b) => a / b))
        : 0;
      const bitrate = videoStream ? parseInt(videoStream.bit_rate) || 0 : 0;
      resolve({
        duration,
        resolution,
        fps,
        bitrate,
        width: videoStream?.width || 0,
        height: videoStream?.height || 0,
      });
    });
  });
}

// ── Video compression with progress callback ─────────────────────────────────
function compressVideo(inputPath, outputPath, metadata, onProgress) {
  return new Promise((resolve, reject) => {
    const { width, height } = metadata;
    let scaleFilter = '';
    let targetBitrate = '';

    const maxDimension = Math.max(width, height);
    if (maxDimension > 1920) {
      scaleFilter = width > height ? 'scale=1920:-2' : 'scale=-2:1920';
      targetBitrate = '4M';
    } else if (maxDimension > 1280) {
      scaleFilter = width > height ? 'scale=1280:-2' : 'scale=-2:1280';
      targetBitrate = '2M';
    } else if (maxDimension <= 854 && maxDimension > 0) {
      targetBitrate = '800k';
    } else {
      targetBitrate = '2M';
    }

    let command = ffmpeg(inputPath)
      .videoCodec('libx264')
      .audioCodec('aac')
      .audioBitrate('128k')
      .outputOptions('-preset', 'medium')
      .outputOptions('-crf', '28');

    if (scaleFilter) {
      command = command.videoFilters(scaleFilter);
    }
    if (targetBitrate) {
      command = command.videoBitrate(targetBitrate);
    }

    command
      .output(outputPath)
      .toFormat('mp4')
      .on('progress', (info) => {
        // info.percent may be available depending on input format
        if (typeof onProgress === 'function' && info.percent) {
          onProgress(Math.min(Math.round(info.percent), 99));
        }
      })
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .run();
  });
}

// ── Video thumbnail extraction at 5 seconds ──────────────────────────────────
function extractVideoThumbnail(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .screenshots({
        timestamps: [5],
        filename: path.basename(outputPath),
        folder: path.dirname(outputPath),
        size: '320x180',
      })
      .on('end', () => resolve())
      .on('error', (err) => reject(err));
  });
}

module.exports = {
  getVideoMetadata,
  compressVideo,
  extractVideoThumbnail,
  uploadFileHelper,
};

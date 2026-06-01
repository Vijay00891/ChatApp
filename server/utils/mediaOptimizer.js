const sharp = require('sharp');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const Message = require('../models/Message');

ffmpeg.setFfmpegPath(ffmpegStatic);

// Helper to upload file to Cloudinary unsigned
async function uploadToCloudinaryUnsigned(filePath, cloudName, uploadPreset) {
  const fileBuffer = fs.readFileSync(filePath);
  const blob = new Blob([fileBuffer]);
  
  const formData = new FormData();
  formData.append('file', blob, path.basename(filePath));
  formData.append('upload_preset', uploadPreset);
  
  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`,
    {
      method: 'POST',
      body: formData,
    }
  );
  
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error?.message || 'Cloudinary upload failed');
  }
  return data.secure_url;
}

// Upload helper with local storage fallback
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

// Image compression pipeline using Sharp
async function optimizeImage(filePath, filename, tempDir) {
  const originalSize = fs.statSync(filePath).size;
  const metadata = await sharp(filePath).metadata();
  
  let width = metadata.width;
  let height = metadata.height;
  let pipeline = sharp(filePath).rotate(); // Auto-rotate based on EXIF before removing metadata
  
  // Resize if exceeds 1600px on any side
  if (width > 1600 || height > 1600) {
    if (width > height) {
      height = Math.round((height * 1600) / width);
      width = 1600;
    } else {
      width = Math.round((width * 1600) / height);
      height = 1600;
    }
    pipeline = pipeline.resize(width, height);
  }
  
  // Convert formats if needed
  let format = metadata.format;
  if (!['jpeg', 'jpg', 'png', 'webp'].includes(format)) {
    format = 'jpeg';
  }
  
  const uniqueId = uuidv4();
  const optimizedFileName = `${uniqueId}.${format}`;
  const optimizedPath = path.join(tempDir, optimizedFileName);
  
  // Apply 80% compression (EXIF stripped by default)
  if (format === 'webp') {
    pipeline = pipeline.webp({ quality: 80 });
  } else if (format === 'png') {
    pipeline = pipeline.png({ quality: 80, compressionLevel: 8 });
  } else {
    pipeline = pipeline.jpeg({ quality: 80, mozjpeg: true });
  }
  
  await pipeline.toFile(optimizedPath);
  const compressedSize = fs.statSync(optimizedPath).size;
  const compressionRatio = ((1 - compressedSize / originalSize) * 100).toFixed(1) + '%';
  
  // Generate 300x300 thumbnail
  const thumbnailFileName = `${uniqueId}-thumb.${format}`;
  const thumbnailPath = path.join(tempDir, thumbnailFileName);
  await sharp(optimizedPath)
    .resize(300, 300, { fit: 'cover' })
    .toFile(thumbnailPath);
    
  return {
    optimizedPath,
    thumbnailPath,
    optimizedFileName,
    thumbnailFileName,
    width,
    height,
    originalSize,
    compressedSize,
    compressionRatio,
  };
}

// Video metadata extraction
function getVideoMetadata(filePath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) return reject(err);
      const videoStream = metadata.streams.find(s => s.codec_type === 'video');
      const duration = parseFloat(metadata.format.duration) || 0;
      const resolution = videoStream ? `${videoStream.width}x${videoStream.height}` : '';
      const fps = videoStream ? eval(videoStream.r_frame_rate) : 0;
      const bitrate = videoStream ? parseInt(videoStream.bit_rate) : 0;
      resolve({
        duration,
        resolution,
        fps,
        bitrate,
        width: videoStream?.width || 0,
        height: videoStream?.height || 0
      });
    });
  });
}

// Video compression pipeline using FFmpeg
function compressVideo(inputPath, outputPath, metadata) {
  return new Promise((resolve, reject) => {
    const { width, height } = metadata;
    let scaleFilter = '';
    let targetBitrate = '';
    
    const maxDimension = Math.max(width, height);
    if (maxDimension > 1920) {
      scaleFilter = width > height ? "scale=1920:-2" : "scale=-2:1920";
      targetBitrate = '4M'; // 1080p target
    } else if (maxDimension > 1280) {
      scaleFilter = width > height ? "scale=1280:-2" : "scale=-2:1280";
      targetBitrate = '2M'; // 720p target
    } else {
      if (maxDimension <= 854 && maxDimension > 0) {
        targetBitrate = '800k'; // 480p target
      } else if (maxDimension <= 1280 && maxDimension > 854) {
        targetBitrate = '2M'; // 720p target
      } else {
        targetBitrate = '4M'; // 1080p target
      }
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
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .run();
  });
}

// Video thumbnail extraction
function extractVideoThumbnail(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .screenshots({
        timestamps: [5],
        filename: path.basename(outputPath),
        folder: path.dirname(outputPath),
        size: '320x180'
      })
      .on('end', () => resolve())
      .on('error', (err) => reject(err));
  });
}

// Asynchronous background video worker
async function runBackgroundVideoCompression(tempInputPath, tempOutputPath, tempThumbPath, originalUrl, filename, thumbFilename, io, cloudOpts = {}) {
  try {
    const meta = await getVideoMetadata(tempInputPath);
    console.log(`[Media Worker] Starting background video compression for: ${filename}`);
    await compressVideo(tempInputPath, tempOutputPath, meta);
    console.log(`[Media Worker] Video compressed successfully. Uploading...`);
    
    const compressedUrl = await uploadFileHelper(tempOutputPath, filename, cloudOpts);
    
    // Update message matching original URL
    let retries = 10;
    while (retries > 0) {
      const msg = await Message.findOne({ content: originalUrl });
      if (msg) {
        msg.content = compressedUrl;
        await msg.save();
        console.log(`[Media Worker] Database updated. Emitting socket update to room ${msg.roomId}`);
        if (io) {
          io.to(msg.roomId.toString()).emit('message_updated', {
            messageId: msg._id,
            content: compressedUrl
          });
        }
        break;
      }
      retries--;
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  } catch (err) {
    console.error('[Media Worker] Background video compression error:', err);
  } finally {
    // Cleanup temporary files
    try {
      if (fs.existsSync(tempInputPath)) fs.unlinkSync(tempInputPath);
      if (fs.existsSync(tempOutputPath)) fs.unlinkSync(tempOutputPath);
      if (fs.existsSync(tempThumbPath)) fs.unlinkSync(tempThumbPath);
      console.log(`[Media Worker] Cleaned up temporary files.`);
    } catch (cleanupErr) {
      console.error('[Media Worker] Cleanup error:', cleanupErr);
    }
  }
}

module.exports = {
  optimizeImage,
  getVideoMetadata,
  compressVideo,
  extractVideoThumbnail,
  uploadFileHelper,
  runBackgroundVideoCompression
};

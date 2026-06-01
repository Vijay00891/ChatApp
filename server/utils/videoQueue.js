/**
 * In-process video compression job queue.
 * Provides BullMQ-like API surface without requiring Redis.
 *
 * Features:
 * - Status tracking (uploaded → processing → completed/failed)
 * - Progress percentage updates via FFmpeg
 * - Retry on failure (up to 3 attempts)
 * - Socket.io notifications for real-time client updates
 * - Automatic temp file cleanup
 */
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const Message = require('../models/Message');
const {
  getVideoMetadata,
  compressVideo,
  extractVideoThumbnail,
  uploadFileHelper,
} = require('./mediaOptimizer');

// In-memory job store: jobId → job data
const jobs = new Map();

const MAX_RETRIES = 3;
const tempDir = path.join(__dirname, '../temp');

/**
 * Create a new video processing job.
 * @returns {string} jobId
 */
function addJob({ messageId, inputPath, cloudOpts, io }) {
  const jobId = uuidv4();

  jobs.set(jobId, {
    jobId,
    messageId,
    inputPath,
    cloudOpts,
    status: 'uploaded',
    progress: 0,
    error: null,
    attempts: 0,
    createdAt: Date.now(),
  });

  // Start processing asynchronously (fire-and-forget)
  setImmediate(() => processJob(jobId, io));

  return jobId;
}

/**
 * Get the current status of a job.
 */
function getJobStatus(jobId) {
  const job = jobs.get(jobId);
  if (!job) return null;
  return {
    status: job.status,
    progress: job.progress,
    error: job.error,
  };
}

/**
 * Core processing pipeline. Runs FFmpeg compression, generates thumbnail,
 * uploads to Cloudinary, updates the database, and notifies via socket.
 */
async function processJob(jobId, io) {
  const job = jobs.get(jobId);
  if (!job) return;

  job.status = 'processing';
  job.attempts += 1;
  job.progress = 0;

  // Notify clients that processing has started
  emitStatus(io, job);

  const compressedFileName = `${uuidv4()}.mp4`;
  const compressedPath = path.join(tempDir, compressedFileName);
  const thumbFileName = `${uuidv4()}-thumb.jpg`;
  const thumbPath = path.join(tempDir, thumbFileName);

  try {
    // 1. Get video metadata
    const metadata = await getVideoMetadata(job.inputPath);
    console.log(`[VideoQueue] Job ${jobId}: Compressing video (attempt ${job.attempts}/${MAX_RETRIES})...`);

    // 2. Compress video with progress tracking
    await compressVideo(job.inputPath, compressedPath, metadata, (percent) => {
      job.progress = percent;
      // Throttle socket emissions to every 10%
      if (percent % 10 === 0) {
        emitStatus(io, job);
      }
    });

    job.progress = 90;
    emitStatus(io, job);
    console.log(`[VideoQueue] Job ${jobId}: Compression complete. Uploading...`);

    // 3. Generate thumbnail
    await extractVideoThumbnail(job.inputPath, thumbPath);
    const thumbnailUrl = await uploadFileHelper(thumbPath, thumbFileName, job.cloudOpts);

    // 4. Upload compressed video to Cloudinary
    const compressedUrl = await uploadFileHelper(compressedPath, compressedFileName, job.cloudOpts);

    // 5. Update database
    const msg = await Message.findById(job.messageId);
    if (msg) {
      msg.content = compressedUrl;
      msg.thumbnailUrl = thumbnailUrl;
      msg.mediaStatus = 'completed';
      await msg.save();
      console.log(`[VideoQueue] Job ${jobId}: DB updated. Room: ${msg.roomId}`);

      // 6. Notify all clients in the room
      if (io) {
        io.to(msg.roomId.toString()).emit('message_updated', {
          messageId: msg._id,
          content: compressedUrl,
          thumbnailUrl,
          mediaStatus: 'completed',
        });
      }
    }

    job.status = 'completed';
    job.progress = 100;
    emitStatus(io, job);
    console.log(`[VideoQueue] Job ${jobId}: ✅ Completed successfully.`);
  } catch (err) {
    console.error(`[VideoQueue] Job ${jobId}: Error (attempt ${job.attempts}):`, err.message);

    if (job.attempts < MAX_RETRIES) {
      console.log(`[VideoQueue] Job ${jobId}: Retrying...`);
      job.status = 'uploaded'; // reset for retry
      job.progress = 0;
      // Exponential backoff: 2s, 4s, 8s
      setTimeout(() => processJob(jobId, io), 2000 * Math.pow(2, job.attempts - 1));
      return; // Don't cleanup yet
    }

    // Max retries exhausted
    job.status = 'failed';
    job.error = err.message;
    emitStatus(io, job);

    // Update DB status to failed
    try {
      await Message.findByIdAndUpdate(job.messageId, { mediaStatus: 'failed' });
      if (io) {
        const msg = await Message.findById(job.messageId);
        if (msg) {
          io.to(msg.roomId.toString()).emit('message_updated', {
            messageId: msg._id,
            mediaStatus: 'failed',
          });
        }
      }
    } catch (dbErr) {
      console.error(`[VideoQueue] Job ${jobId}: Failed to update DB status:`, dbErr.message);
    }
  } finally {
    // Cleanup temp files only when job is completed or permanently failed
    if (job.status === 'completed' || job.status === 'failed') {
      cleanupFiles([job.inputPath, compressedPath, thumbPath]);

      // Remove job from memory after 30 minutes (keep for status polling)
      setTimeout(() => jobs.delete(jobId), 30 * 60 * 1000);
    }
  }
}

/**
 * Emit processing status update via socket.
 */
function emitStatus(io, job) {
  if (!io || !job.messageId) return;

  // We need the roomId to emit to the right room
  Message.findById(job.messageId)
    .select('roomId')
    .then((msg) => {
      if (msg) {
        io.to(msg.roomId.toString()).emit('media_processing_update', {
          messageId: job.messageId,
          jobId: job.jobId,
          status: job.status,
          progress: job.progress,
        });
      }
    })
    .catch(() => {});
}

/**
 * Safely delete temporary files.
 */
function cleanupFiles(paths) {
  for (const p of paths) {
    try {
      if (p && fs.existsSync(p)) {
        fs.unlinkSync(p);
      }
    } catch (e) {
      console.error(`[VideoQueue] Cleanup error for ${p}:`, e.message);
    }
  }
  console.log(`[VideoQueue] Cleaned up ${paths.length} temp files.`);
}

module.exports = { addJob, getJobStatus };

const express = require('express');
const Message = require('../models/Message');
const Room = require('../models/Room');
const authMiddleware = require('../middleware/authMiddleware');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const { uploadFileHelper } = require('../utils/mediaOptimizer');
const { addJob, getJobStatus } = require('../utils/videoQueue');

const tempDir = path.join(__dirname, '../temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, tempDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${uuidv4()}${path.extname(file.originalname)}`);
  }
});

// Support files up to 500MB
const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 },
});

const router = express.Router();

// GET /api/messages/:roomId?page=1&limit=20
router.get('/:roomId', authMiddleware, async (req, res) => {
  try {
    const { roomId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    // Verify user is in this room
    const room = await Room.findOne({ _id: roomId, members: req.user._id }).lean();
    if (!room) {
      return res.status(403).json({ message: 'Access denied.' });
    }

    // Run message fetch and count in parallel instead of sequentially
    const [messages, total] = await Promise.all([
      Message.find({ roomId })
        .populate('senderId', 'name avatar avatarColor')
        .populate({
          path: 'replyTo',
          select: 'content type senderId',
          populate: { path: 'senderId', select: 'name' }
        })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Message.countDocuments({ roomId }),
    ]);

    res.json({
      messages: messages.reverse(),
      pagination: {
        page,
        limit,
        total,
        hasMore: skip + limit < total,
      },
    });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
});

// PATCH /api/messages/read/:roomId — mark messages as read
router.patch('/read/:roomId', authMiddleware, async (req, res) => {
  try {
    const { roomId } = req.params;

    await Message.updateMany(
      {
        roomId,
        senderId: { $ne: req.user._id },
        readBy: { $ne: req.user._id },
      },
      {
        $addToSet: { readBy: req.user._id },
        $set: { status: 'read' },
      }
    );

    res.json({ message: 'Messages marked as read.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/messages/upload — Upload media files
//
// IMAGES: Images are now compressed in the browser and uploaded directly to
//         Cloudinary from the client. This endpoint is no longer used for images.
//
// VIDEOS: Upload original → save to Cloudinary immediately → queue background
//         compression → return response instantly (< 2 seconds after upload).
//
// FILES:  Non-media files are uploaded to Cloudinary directly.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/upload', authMiddleware, upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded.' });
  }

  const { path: tempFilePath, originalname } = req.file;
  const originalSize = req.file.size;
  const mimeType = req.file.mimetype;
  const fileExt = path.extname(originalname).toLowerCase();

  // Cloudinary credentials passed from the client
  const cloudOpts = {
    cloudName: req.body.cloudName,
    uploadPreset: req.body.uploadPreset,
  };

  try {
    const isVideo = mimeType.startsWith('video/');

    if (isVideo) {
      // ── VIDEO: Upload original immediately, compress in background ──────
      console.log(`[Upload] Video received: ${originalname} (${(originalSize / 1024 / 1024).toFixed(2)} MB)`);

      // 1. Upload the original video to Cloudinary right away
      const uniqueId = uuidv4();
      const originalUrl = await uploadFileHelper(tempFilePath, `${uniqueId}-orig${fileExt}`, cloudOpts);

      // 2. Return response immediately — client sees the message right away
      //    The jobId allows polling for compression status
      return res.json({
        url: originalUrl,
        type: 'video',
        mediaStatus: 'uploaded',
        originalSize,
      });
    }

    // ── NON-MEDIA FILES: Upload directly ─────────────────────────────────
    console.log(`[Upload] File received: ${originalname}`);
    const uniqueId = uuidv4();
    const finalFileName = `${uniqueId}${fileExt}`;
    const url = await uploadFileHelper(tempFilePath, finalFileName, cloudOpts);

    try {
      if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
    } catch (e) {}

    return res.json({
      url,
      originalSize,
    });

  } catch (err) {
    console.error('[Upload] Error:', err);
    try {
      if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
    } catch (e) {}
    res.status(500).json({ message: 'Upload failed.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/messages/upload/video-process — Start background video processing
// Called after the message has been saved to DB (we need the messageId)
// ─────────────────────────────────────────────────────────────────────────────
router.post('/upload/video-process', authMiddleware, async (req, res) => {
  try {
    const { messageId, cloudName, uploadPreset } = req.body;

    if (!messageId) {
      return res.status(400).json({ message: 'messageId is required.' });
    }

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ message: 'Message not found.' });
    }

    // Download the original video from Cloudinary to temp for processing
    const originalUrl = message.content;
    // We need the original file to process. Check if it still exists in temp.
    // If not, we download it from the URL.
    const uniqueId = uuidv4();
    const tempInputPath = path.join(tempDir, `${uniqueId}-input.mp4`);

    // Download the video from URL to temp
    const response = await fetch(originalUrl);
    if (!response.ok) throw new Error('Failed to download original video for processing');
    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(tempInputPath, buffer);

    const cloudOpts = { cloudName, uploadPreset };
    const io = req.app.get('io');

    // Update message status to processing
    message.mediaStatus = 'processing';
    const jobId = addJob({
      messageId: message._id.toString(),
      inputPath: tempInputPath,
      cloudOpts,
      io,
    });
    message.mediaJobId = jobId;
    await message.save();

    return res.json({
      jobId,
      status: 'processing',
    });
  } catch (err) {
    console.error('[VideoProcess] Error:', err);
    res.status(500).json({ message: 'Failed to start video processing.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/messages/media/:jobId/status — Poll job processing status
// ─────────────────────────────────────────────────────────────────────────────
router.get('/media/:jobId/status', authMiddleware, (req, res) => {
  const status = getJobStatus(req.params.jobId);
  if (!status) {
    return res.status(404).json({ message: 'Job not found.' });
  }
  res.json(status);
});

module.exports = router;

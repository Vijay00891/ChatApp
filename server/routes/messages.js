const express = require('express');
const Message = require('../models/Message');
const Room = require('../models/Room');
const authMiddleware = require('../middleware/authMiddleware');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const {
  optimizeImage,
  getVideoMetadata,
  compressVideo,
  extractVideoThumbnail,
  uploadFileHelper,
  runBackgroundVideoCompression
} = require('../utils/mediaOptimizer');

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

const upload = multer({ storage });

const router = express.Router();

// GET /api/messages/:roomId?page=1&limit=50
router.get('/:roomId', authMiddleware, async (req, res) => {
  try {
    const { roomId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    // Verify user is in this room
    const room = await Room.findOne({ _id: roomId, members: req.user._id });
    if (!room) {
      return res.status(403).json({ message: 'Access denied.' });
    }

    const messages = await Message.find({ roomId })
      .populate('senderId', 'name avatar avatarColor')
      .populate({
        path: 'replyTo',
        select: 'content type senderId',
        populate: { path: 'senderId', select: 'name' }
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Message.countDocuments({ roomId });

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
// POST /api/messages/upload — upload and compress media
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
    uploadPreset: req.body.uploadPreset
  };
  
  try {
    const isImage = mimeType.startsWith('image/');
    const isVideo = mimeType.startsWith('video/');

    if (isImage) {
      console.log(`[Upload Endpoint] Optimizing image: ${originalname}`);
      const result = await optimizeImage(tempFilePath, originalname, tempDir);
      
      const url = await uploadFileHelper(result.optimizedPath, result.optimizedFileName, cloudOpts);
      const thumbnailUrl = await uploadFileHelper(result.thumbnailPath, result.thumbnailFileName, cloudOpts);
      
      // Cleanup temp files
      try {
        if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
        if (fs.existsSync(result.optimizedPath)) fs.unlinkSync(result.optimizedPath);
        if (fs.existsSync(result.thumbnailPath)) fs.unlinkSync(result.thumbnailPath);
      } catch (e) {
        console.error('Error during image temp files cleanup:', e);
      }
      
      return res.json({
        url,
        thumbnailUrl,
        width: result.width,
        height: result.height,
        originalSize: result.originalSize,
        compressedSize: result.compressedSize,
        compressionRatio: result.compressionRatio
      });
    }

    if (isVideo) {
      console.log(`[Upload Endpoint] Analyzing video: ${originalname} (${(originalSize / 1024 / 1024).toFixed(2)} MB)`);
      const metadata = await getVideoMetadata(tempFilePath);
      
      const uniqueId = uuidv4();
      const compressedFileName = `${uniqueId}.mp4`;
      const compressedPath = path.join(tempDir, compressedFileName);
      
      const thumbFileName = `${uniqueId}-thumb.jpg`;
      const tempThumbPath = path.join(tempDir, thumbFileName);
      
      // Extract thumbnail at 5s (320x180)
      await extractVideoThumbnail(tempFilePath, tempThumbPath);
      const thumbnailUrl = await uploadFileHelper(tempThumbPath, thumbFileName, cloudOpts);
      
      const isAsync = originalSize > 50 * 1024 * 1024; // > 50 MB
      
      if (isAsync) {
        console.log(`[Upload Endpoint] Video size exceeds 50MB. Compressing asynchronously...`);
        // Upload original video to get temporary URL
        const originalUrl = await uploadFileHelper(tempFilePath, `${uniqueId}-orig${fileExt}`, cloudOpts);
        
        // Run background thread
        const io = req.app.get('io');
        runBackgroundVideoCompression(
          tempFilePath,
          compressedPath,
          tempThumbPath,
          originalUrl,
          compressedFileName,
          thumbFileName,
          io,
          cloudOpts
        );
        
        return res.json({
          videoUrl: originalUrl,
          thumbnailUrl,
          duration: metadata.duration,
          resolution: metadata.resolution,
          originalSize,
          compressedSize: originalSize, // same as original until compressed
          compressionRatio: '0.0% (Processing...)'
        });
      } else {
        console.log(`[Upload Endpoint] Compressing video synchronously...`);
        await compressVideo(tempFilePath, compressedPath, metadata);
        
        const compressedSize = fs.statSync(compressedPath).size;
        const compressionRatio = ((1 - compressedSize / originalSize) * 100).toFixed(1) + '%';
        
        const videoUrl = await uploadFileHelper(compressedPath, compressedFileName, cloudOpts);
        
        // Cleanup temp files
        try {
          if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
          if (fs.existsSync(compressedPath)) fs.unlinkSync(compressedPath);
          if (fs.existsSync(tempThumbPath)) fs.unlinkSync(tempThumbPath);
        } catch (e) {
          console.error('Error during video temp files cleanup:', e);
        }
        
        return res.json({
          videoUrl,
          thumbnailUrl,
          duration: metadata.duration,
          resolution: metadata.resolution,
          originalSize,
          compressedSize,
          compressionRatio
        });
      }
    }

    // Fallback for non-media files
    console.log(`[Upload Endpoint] Storing raw file: ${originalname}`);
    const uniqueId = uuidv4();
    const finalFileName = `${uniqueId}${fileExt}`;
    const url = await uploadFileHelper(tempFilePath, finalFileName, cloudOpts);
    
    try {
      if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
    } catch (e) {}
    
    return res.json({
      url,
      originalSize,
      compressedSize: originalSize,
      compressionRatio: '0.0%'
    });

  } catch (err) {
    console.error('[Upload Endpoint] Upload error:', err);
    // Cleanup on error
    try {
      if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
    } catch (e) {}
    res.status(500).json({ message: 'Media compression/upload failed.' });
  }
});

module.exports = router;

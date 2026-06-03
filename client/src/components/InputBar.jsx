import { useState, useRef, useCallback } from 'react';
import { Send, Smile, Paperclip, X, Loader2, Image as ImageIcon, FileText } from 'lucide-react';
import { useSocket } from '../context/SocketContext';
import { compressImage } from '../utils/imageCompressor';
import { useOffline } from '../context/OfflineContext';

const EMOJI_LIST = ['😀','😂','😍','🥺','😎','🤔','👍','❤️','🎉','🔥','✨','😢','🙏','😅','🤣','💯'];

export default function InputBar({ roomId, onSend, disabled, replyingTo, onCancelReply }) {
  const [text, setText] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [attachment, setAttachment] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState(''); // 'compressing', 'uploading', 'processing'
  const typingTimerRef = useRef(null);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const { emit } = useSocket();
  const { isOnline } = useOffline();

  const handleTyping = useCallback(() => {
    if (!isTyping) {
      setIsTyping(true);
      emit('typing_start', { roomId });
    }
    clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      setIsTyping(false);
      emit('typing_stop', { roomId });
    }, 2000);
  }, [isTyping, emit, roomId]);

  const handleChange = (e) => {
    setText(e.target.value);
    handleTyping();
    // Auto-resize textarea
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 120) + 'px';
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      const isImage = file.type.startsWith('image/');
      const isVideo = file.type.startsWith('video/');
      const previewUrl = (isImage || isVideo) ? URL.createObjectURL(file) : null;
      setAttachment({ file, previewUrl, isImage, isVideo, name: file.name });
    }
    e.target.value = ''; // Reset input
  };

  const removeAttachment = () => {
    if (attachment) URL.revokeObjectURL(attachment.previewUrl);
    setAttachment(null);
  };

  // ── Image path: Compress in browser → upload directly to Cloudinary ───────
  const uploadImageToCloudinary = async (file) => {
    setUploadStatus('compressing');
    setUploadProgress(10);

    // 1. Compress image in browser
    const { compressedFile } = await compressImage(file);

    setUploadStatus('uploading');
    setUploadProgress(30);

    // 2. Upload compressed image directly to Cloudinary (no server hop)
    const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
    const uploadPreset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

    if (!cloudName || !uploadPreset) {
      throw new Error('Cloudinary is not configured. Check your .env file.');
    }

    const formData = new FormData();
    formData.append('file', compressedFile);
    formData.append('upload_preset', uploadPreset);

    // Use XMLHttpRequest for upload progress tracking
    const url = await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`);

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          // Map upload progress to 30–95% range
          const pct = 30 + Math.round((e.loaded / e.total) * 65);
          setUploadProgress(pct);
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          const data = JSON.parse(xhr.responseText);
          resolve(data.secure_url);
        } else {
          try {
            const data = JSON.parse(xhr.responseText);
            reject(new Error(data.error?.message || 'Cloudinary upload failed'));
          } catch {
            reject(new Error('Upload failed'));
          }
        }
      };

      xhr.onerror = () => reject(new Error('Network error during upload'));
      xhr.send(formData);
    });

    setUploadProgress(100);
    return url;
  };

  // ── Video/file path: Upload to backend with progress tracking ─────────────
  const uploadToBackend = async (file) => {
    setUploadStatus('uploading');
    setUploadProgress(5);

    const formData = new FormData();
    formData.append('file', file);

    // Pass Cloudinary credentials
    const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
    const uploadPreset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;
    if (cloudName) formData.append('cloudName', cloudName);
    if (uploadPreset) formData.append('uploadPreset', uploadPreset);

    const token = localStorage.getItem('token');
    const baseUrl = import.meta.env.VITE_SERVER_URL || 'http://localhost:8000';

    // Use XMLHttpRequest for upload progress
    const data = await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${baseUrl}/api/messages/upload`);
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const pct = 5 + Math.round((e.loaded / e.total) * 90);
          setUploadProgress(pct);
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(JSON.parse(xhr.responseText));
        } else {
          try {
            const err = JSON.parse(xhr.responseText);
            reject(new Error(err.message || 'Upload failed'));
          } catch {
            reject(new Error('Upload failed'));
          }
        }
      };

      xhr.onerror = () => reject(new Error('Network error during upload'));
      xhr.send(formData);
    });

    setUploadProgress(100);
    return data;
  };

  // ── Trigger background video processing after message is saved ────────────
  const startVideoProcessing = async (messageId) => {
    try {
      const token = localStorage.getItem('token');
      const baseUrl = import.meta.env.VITE_SERVER_URL || 'http://localhost:8000';
      const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
      const uploadPreset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

      await fetch(`${baseUrl}/api/messages/upload/video-process`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ messageId, cloudName, uploadPreset }),
      });
    } catch (err) {
      console.error('[InputBar] Failed to start video processing:', err);
    }
  };

  const handleSend = useCallback(async () => {
    const trimmed = text.trim();
    if ((!trimmed && !attachment) || disabled || isUploading) return;

    try {
      if (attachment) {
        setIsUploading(true);
        setUploadProgress(0);

        if (attachment.isImage) {
          // ── IMAGE: Compress in browser → upload to Cloudinary → send ──
          const imageUrl = await uploadImageToCloudinary(attachment.file);
          const finalUrl = `${imageUrl}?filename=${encodeURIComponent(attachment.name)}`;
          onSend(finalUrl, 'image');
        } else if (attachment.isVideo) {
          // ── VIDEO: Upload original immediately → send → process in background
          const data = await uploadToBackend(attachment.file);
          const videoUrl = data.url;
          const finalUrl = `${videoUrl}?filename=${encodeURIComponent(attachment.name)}`;
          // Send the message with the original video URL right away
          // onSend will create the message via socket, and once we get the
          // message ID back, we trigger background processing
          onSend(finalUrl, 'video', {
            mediaStatus: 'uploaded',
            onMessageCreated: (messageId) => startVideoProcessing(messageId),
          });
        } else {
          // ── FILE: Upload to backend → send ────────────────────────────
          const data = await uploadToBackend(attachment.file);
          const finalUrl = `${data.url}?filename=${encodeURIComponent(attachment.name)}`;
          onSend(finalUrl, 'file');
        }

        removeAttachment();
      }

      if (trimmed) {
        onSend(trimmed, 'text');
      }

      setText('');
      setUploadStatus('');
      setUploadProgress(0);
      clearTimeout(typingTimerRef.current);
      if (isTyping) {
        setIsTyping(false);
        emit('typing_stop', { roomId });
      }
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
    } catch (error) {
      console.error('Send failed:', error);
      alert('Failed to send file: ' + error.message);
    } finally {
      setIsUploading(false);
      setUploadStatus('');
      setUploadProgress(0);
    }
  }, [text, attachment, disabled, onSend, isTyping, emit, roomId, isUploading]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const addEmoji = (emoji) => {
    setText((prev) => prev + emoji);
    setShowEmoji(false);
    textareaRef.current?.focus();
  };

  return (
    <div className="relative flex flex-col bg-surface border-t border-border-color">
      {/* Reply Banner */}
      {replyingTo && (
        <div className="px-4 pt-3 pb-1 relative animate-in slide-in-from-bottom-2 fade-in duration-200">
          <div className="relative flex items-center justify-between border-l-4 border-primary bg-background rounded-r-xl p-3 shadow-sm">
            <div className="flex flex-col min-w-0 pr-6">
              <span className="text-xs font-semibold text-primary">
                {replyingTo.senderId?.name || 'Someone'}
              </span>
              <span className="text-sm text-subtle-text truncate">
                {replyingTo.type === 'image' ? '📷 Photo' 
                  : replyingTo.type === 'video' ? '🎬 Video'
                  : replyingTo.type === 'file' ? '📄 Document' 
                  : replyingTo.content}
              </span>
            </div>
            <button 
              onClick={onCancelReply}
              className="p-1 hover:bg-hover-bg rounded-full text-subtle-text transition-colors shrink-0"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Attachment Preview Area */}
      {attachment && (
        <div className="px-4 pt-3 pb-1 relative">
          <div className="relative inline-block border border-border-color rounded-xl overflow-hidden bg-background p-1 shadow-sm">
            {attachment.isImage ? (
              <img 
                src={attachment.previewUrl} 
                alt="preview" 
                className="max-h-32 rounded-lg object-cover" 
              />
            ) : attachment.isVideo ? (
              <video 
                src={attachment.previewUrl} 
                className="max-h-32 rounded-lg object-cover" 
                muted
                controls={false}
              />
            ) : (
              <div className="flex items-center gap-2 p-3 pr-10 bg-background rounded-lg">
                <FileText size={24} className="text-primary shrink-0" />
                <span className="text-sm font-medium text-on-surface truncate max-w-[200px]">
                  {attachment.name}
                </span>
              </div>
            )}
            <button 
              onClick={removeAttachment}
              className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1 hover:bg-black/80 transition"
              disabled={isUploading}
            >
              <X size={16} />
            </button>

            {/* Upload Progress Bar */}
            {isUploading && (
              <div className="absolute bottom-0 left-0 right-0">
                <div className="h-1 bg-black/20 rounded-b-lg overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-300 ease-out"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
                <div className="absolute bottom-2 left-2 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded-md font-medium">
                  {uploadStatus === 'compressing' ? '🔄 Compressing...' 
                    : uploadStatus === 'uploading' ? `⬆️ ${uploadProgress}%` 
                    : '⏳ Processing...'}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex items-end gap-2 px-4 py-3 relative">
      {/* Emoji Picker */}
      {showEmoji && (
        <div
          className="absolute bottom-full left-4 mb-2 bg-surface rounded-card shadow-google-lg
                     border border-border-color p-3 grid grid-cols-8 gap-1 z-50 animate-pop-in"
          style={{ width: 264 }}
        >
          {EMOJI_LIST.map((emoji) => (
            <button
              key={emoji}
              onClick={() => addEmoji(emoji)}
              className="text-xl hover:bg-hover-bg rounded-lg p-1 transition-colors duration-100
                         cursor-pointer select-none"
              aria-label={`Insert ${emoji}`}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      {/* Hidden File Input */}
      <input 
        type="file" 
        accept="*/*" 
        className="hidden" 
        ref={fileInputRef} 
        onChange={handleFileSelect}
      />

      {/* Attachment button */}
      <button
        id="btn-attach"
        className="btn-icon shrink-0 mb-0.5"
        onClick={() => {
          if (!isOnline) {
            alert('File sharing is disabled while offline.');
            return;
          }
          fileInputRef.current?.click();
        }}
        aria-label="Attach file"
        title="Attach file"
        disabled={disabled || isUploading}
      >
        <Paperclip size={20} />
      </button>

      {/* Emoji toggle */}
      <button
        id="btn-emoji"
        className={`btn-icon shrink-0 mb-0.5 ${showEmoji ? 'text-primary bg-active-bg' : ''}`}
        onClick={() => setShowEmoji((v) => !v)}
        aria-label="Emoji"
        disabled={disabled}
      >
        <Smile size={20} />
      </button>

      {/* Text input */}
      <div className="flex-1 relative">
        <textarea
          ref={textareaRef}
          id="message-input"
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Message"
          rows={1}
          disabled={disabled}
          className="w-full resize-none bg-background border border-border-color rounded-pill
                     px-5 py-2.5 text-sm text-on-surface placeholder-subtle-text
                     focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20
                     transition-all duration-200 font-ui leading-relaxed"
          style={{ minHeight: 42, maxHeight: 120, overflowY: 'auto' }}
        />
      </div>

      {/* Send button */}
      <button
        id="btn-send"
        onClick={handleSend}
        disabled={(!text.trim() && !attachment) || disabled || isUploading}
        className={`shrink-0 mb-0.5 w-10 h-10 rounded-full flex items-center justify-center
                    transition-all duration-200 ripple-container
                    ${(text.trim() || attachment) && !disabled && !isUploading
                      ? 'bg-primary text-white shadow-google hover:bg-primary-dark active:scale-90'
                      : 'bg-hover-bg text-subtle-text cursor-not-allowed'
                    }`}
        aria-label="Send message"
      >
        {isUploading ? (
          <Loader2 size={18} className="animate-spin" />
        ) : (
          <Send size={18} style={{ marginLeft: 2 }} />
        )}
      </button>
    </div>
  </div>
  );
}

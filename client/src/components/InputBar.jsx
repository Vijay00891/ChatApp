import { useState, useRef, useCallback } from 'react';
import { Send, Smile, Paperclip, X, Loader2, Image as ImageIcon, FileText } from 'lucide-react';
import { useSocket } from '../context/SocketContext';

const EMOJI_LIST = ['😀','😂','😍','🥺','😎','🤔','👍','❤️','🎉','🔥','✨','😢','🙏','😅','🤣','💯'];

export default function InputBar({ roomId, onSend, disabled }) {
  const [text, setText] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [attachment, setAttachment] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const typingTimerRef = useRef(null);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const { emit } = useSocket();

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
      const previewUrl = isImage ? URL.createObjectURL(file) : null;
      setAttachment({ file, previewUrl, isImage, name: file.name });
    }
    e.target.value = ''; // Reset input
  };

  const removeAttachment = () => {
    if (attachment) URL.revokeObjectURL(attachment.previewUrl);
    setAttachment(null);
  };

  const uploadToCloudinary = async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET);
    
    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${import.meta.env.VITE_CLOUDINARY_CLOUD_NAME}/auto/upload`,
      { method: 'POST', body: formData }
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || 'Upload failed');
    return data.secure_url;
  };

  const handleSend = useCallback(async () => {
    const trimmed = text.trim();
    if ((!trimmed && !attachment) || disabled || isUploading) return;

    try {
      if (attachment) {
        setIsUploading(true);
        // If Cloudinary env vars are missing, we'll throw an error
        if (!import.meta.env.VITE_CLOUDINARY_CLOUD_NAME) {
          alert('Cloudinary is not configured! Check your .env file.');
          setIsUploading(false);
          return;
        }
        const fileUrl = await uploadToCloudinary(attachment.file);
        // Append filename to URL so the receiver can display it
        const finalUrl = `${fileUrl}?filename=${encodeURIComponent(attachment.name)}`;
        onSend(finalUrl, attachment.isImage ? 'image' : 'file');
        removeAttachment();
      }

      if (trimmed) {
        onSend(trimmed, 'text');
      }

      setText('');
      clearTimeout(typingTimerRef.current);
      if (isTyping) {
        setIsTyping(false);
        emit('typing_stop', { roomId });
      }
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
    } catch (error) {
      console.error('Send failed:', error);
      alert('Failed to send image: ' + error.message);
    } finally {
      setIsUploading(false);
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
        onClick={() => fileInputRef.current?.click()}
        aria-label="Attach image"
        title="Attach image"
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

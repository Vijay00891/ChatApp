import { useState, useRef, useCallback } from 'react';
import { Send, Smile, Paperclip } from 'lucide-react';
import { useSocket } from '../context/SocketContext';

const EMOJI_LIST = ['😀','😂','😍','🥺','😎','🤔','👍','❤️','🎉','🔥','✨','😢','🙏','😅','🤣','💯'];

export default function InputBar({ roomId, onSend, disabled }) {
  const [text, setText] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const typingTimerRef = useRef(null);
  const textareaRef = useRef(null);
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

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText('');
    clearTimeout(typingTimerRef.current);
    if (isTyping) {
      setIsTyping(false);
      emit('typing_stop', { roomId });
    }
    // Reset textarea height
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  }, [text, disabled, onSend, isTyping, emit, roomId]);

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
    <div className="relative flex items-end gap-2 px-4 py-3 bg-surface border-t border-border-color">
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

      {/* Attachment button */}
      <button
        id="btn-attach"
        className="btn-icon shrink-0 mb-0.5"
        aria-label="Attach file"
        title="Attach file (coming soon)"
        disabled={disabled}
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
        disabled={!text.trim() || disabled}
        className={`shrink-0 mb-0.5 w-10 h-10 rounded-full flex items-center justify-center
                    transition-all duration-200 ripple-container
                    ${text.trim() && !disabled
                      ? 'bg-primary text-white shadow-google hover:bg-primary-dark active:scale-90'
                      : 'bg-hover-bg text-subtle-text cursor-not-allowed'
                    }`}
        aria-label="Send message"
      >
        <Send size={18} style={{ marginLeft: 2 }} />
      </button>
    </div>
  );
}

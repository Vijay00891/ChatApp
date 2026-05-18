import { useState, useRef, useEffect } from 'react';
import { Check, CheckCheck, FileText, X, ChevronDown, Copy, Reply, Smile } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

function formatTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function ReadReceipt({ status }) {
  if (status === 'read') return <CheckCheck size={14} className="text-primary" />;
  if (status === 'delivered') return <CheckCheck size={14} className="text-subtle-text" />;
  return <Check size={14} className="text-subtle-text" />;
}

export default function MessageBubble({ message, prevMessage, onReply }) {
  const { user } = useAuth();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef(null);
  const isMine = message.senderId?._id === user?._id || message.senderId === user?._id;

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setShowMenu(false);
      }
    };
    if (showMenu) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMenu]);

  const handleCopy = () => {
    if (message.type === 'text') {
      navigator.clipboard.writeText(message.content);
    } else {
      navigator.clipboard.writeText(message.content); // copies the URL
    }
    setShowMenu(false);
  };

  const senderName =
    typeof message.senderId === 'object'
      ? message.senderId?.name
      : null;

  // Group consecutive messages from same sender
  const prevSenderId =
    typeof prevMessage?.senderId === 'object'
      ? prevMessage?.senderId?._id
      : prevMessage?.senderId;
  const thisSenderId =
    typeof message.senderId === 'object' ? message.senderId?._id : message.senderId;
  const isFirst = prevSenderId !== thisSenderId;

  const getFileName = (url) => {
    try {
      const urlObj = new URL(url);
      const params = new URLSearchParams(urlObj.search);
      if (params.has('filename')) return params.get('filename');
      return url.split('/').pop().split('?')[0];
    } catch {
      return 'Document';
    }
  };

  return (
    <div
      className={`flex ${isMine ? 'justify-end' : 'justify-start'} px-4 message-bubble
                  ${isFirst ? 'mt-3' : 'mt-0.5'}`}
    >
      <div
        className={`relative max-w-[85%] md:max-w-[72%] flex flex-col min-w-0
          ${isMine ? 'items-end' : 'items-start'}`}
      >
        {/* Sender name for group-first messages (not mine) */}
        {!isMine && isFirst && senderName && (
          <span className="text-xs font-medium text-primary mb-0.5 ml-1">{senderName}</span>
        )}

        <div className="relative group/bubble flex flex-col">
          {/* Dropdown chevron trigger */}
          <button
            onClick={() => setShowMenu((v) => !v)}
            className={`absolute top-0 right-0 m-1 p-0.5 rounded-full bg-surface shadow-sm 
                        border border-border-color text-subtle-text z-10 transition-opacity
                        ${showMenu ? 'opacity-100' : 'opacity-0 group-hover/bubble:opacity-100'}`}
          >
            <ChevronDown size={16} />
          </button>

          {/* Context Menu */}
          {showMenu && (
            <div 
              ref={menuRef}
              className={`absolute top-7 z-50 w-36 bg-surface border border-border-color 
                          rounded-xl shadow-google-lg py-1 animate-pop-in
                          ${isMine ? 'right-0' : 'left-0'}`}
            >
              <button 
                onClick={() => { onReply(); setShowMenu(false); }}
                className="w-full text-left px-4 py-2 hover:bg-hover-bg text-sm text-on-surface flex items-center gap-3 transition-colors"
              >
                <Reply size={16} className="text-subtle-text" /> Reply
              </button>
              <button 
                onClick={handleCopy}
                className="w-full text-left px-4 py-2 hover:bg-hover-bg text-sm text-on-surface flex items-center gap-3 transition-colors"
              >
                <Copy size={16} className="text-subtle-text" /> Copy
              </button>
              <button 
                onClick={() => { alert('Reactions coming soon!'); setShowMenu(false); }}
                className="w-full text-left px-4 py-2 hover:bg-hover-bg text-sm text-on-surface flex items-center gap-3 transition-colors"
              >
                <Smile size={16} className="text-subtle-text" /> React
              </button>
            </div>
          )}

          <div
            onDoubleClick={onReply}
            className={`
              relative shadow-google text-sm leading-relaxed overflow-hidden
            ${message.type === 'image' ? 'p-1' : 'px-4 py-2'}
            ${isMine
              ? 'bg-sent-bubble text-on-surface rounded-bubble rounded-br-sm'
              : 'bg-received-bubble text-on-surface border border-border-color rounded-bubble rounded-bl-sm'
            }
          `}
        >
          {/* Replied Message Snippet */}
          {message.replyTo && (
            <div className={`mb-1.5 p-2 rounded-md border-l-4 border-primary text-xs
                            ${isMine ? 'bg-white/40' : 'bg-black/5'}`}>
              <div className="font-semibold text-primary mb-0.5">
                {message.replyTo.senderId?.name || 'Someone'}
              </div>
              <div className="truncate text-on-surface/70 max-w-[200px]">
                {message.replyTo.type === 'image' ? '📷 Photo' 
                  : message.replyTo.type === 'file' ? '📄 Document' 
                  : message.replyTo.content}
              </div>
            </div>
          )}
          {message.type === 'image' ? (
            <img 
              src={message.content} 
              alt="attachment" 
              onClick={() => setIsFullscreen(true)}
              className="max-w-[240px] md:max-w-[320px] rounded-xl object-contain bg-black/5 cursor-pointer hover:opacity-90 transition-opacity"
            />
          ) : message.type === 'file' ? (
            <a 
              href={message.content} 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center gap-3 pr-12 hover:opacity-80 transition-opacity"
            >
              <div className="p-2 bg-black/5 rounded-lg shrink-0">
                <FileText size={20} className={isMine ? 'text-white' : 'text-primary'} />
              </div>
              <span className="font-medium underline underline-offset-2 truncate max-w-[180px]">
                {getFileName(message.content)}
              </span>
            </a>
          ) : (
            <p 
              className="whitespace-pre-wrap pr-12"
              style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}
            >
              {message.content}
            </p>
          )}

          {/* Timestamp + read receipt */}
          <div className="absolute bottom-1.5 right-2 flex items-center gap-1 opacity-70">
            <span className="text-[10px] text-subtle-text leading-none">
              {formatTime(message.createdAt)}
            </span>
            {isMine && <ReadReceipt status={message.status} />}
          </div>
        </div>
        </div>
      </div>

      {/* Fullscreen Image Overlay */}
      {isFullscreen && message.type === 'image' && (
        <div 
          className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setIsFullscreen(false)}
        >
          <button 
            className="absolute top-4 right-4 p-2 bg-black/50 hover:bg-black/80 text-white rounded-full transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              setIsFullscreen(false);
            }}
          >
            <X size={24} />
          </button>
          <img 
            src={message.content} 
            alt="fullscreen attachment" 
            className="max-w-full max-h-full object-contain select-none"
            onClick={(e) => e.stopPropagation()} // prevent closing when clicking the image itself
          />
        </div>
      )}
    </div>
  );
}

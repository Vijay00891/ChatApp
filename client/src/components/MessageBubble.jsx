import { Check, CheckCheck } from 'lucide-react';
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

export default function MessageBubble({ message, prevMessage }) {
  const { user } = useAuth();
  const isMine = message.senderId?._id === user?._id || message.senderId === user?._id;

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

  return (
    <div
      className={`flex ${isMine ? 'justify-end' : 'justify-start'} px-4 message-bubble
                  ${isFirst ? 'mt-3' : 'mt-0.5'}`}
    >
      <div
        className={`relative max-w-[72%] flex flex-col
          ${isMine ? 'items-end' : 'items-start'}`}
      >
        {/* Sender name for group-first messages (not mine) */}
        {!isMine && isFirst && senderName && (
          <span className="text-xs font-medium text-primary mb-0.5 ml-1">{senderName}</span>
        )}

        <div
          className={`
            relative px-4 py-2 shadow-google text-sm leading-relaxed
            ${isMine
              ? 'bg-sent-bubble text-on-surface rounded-bubble rounded-br-sm'
              : 'bg-received-bubble text-on-surface border border-border-color rounded-bubble rounded-bl-sm'
            }
          `}
        >
          <p className="whitespace-pre-wrap break-words pr-12">{message.content}</p>

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
  );
}

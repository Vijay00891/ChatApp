import { useEffect, useRef, useState, useCallback, useId } from 'react';
import { ArrowLeft, Phone, Video, MoreVertical } from 'lucide-react';
import { messagesAPI } from '../lib/api';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../hooks/useNotification';
import { useWebRTC } from '../hooks/useWebRTC';
import Avatar from './Avatar';
import MessageBubble from './MessageBubble';
import InputBar from './InputBar';
import TypingIndicator from './TypingIndicator';
import CallUI from './CallUI';

function getPeerFromRoom(room, currentUserId) {
  if (!room) return null;
  if (room.type === 'group') return null;
  return room.members?.find(
    (m) => (m._id ?? m) !== currentUserId
  );
}

function DateDivider({ date }) {
  const d = new Date(date);
  const label = d.toLocaleDateString([], {
    weekday: 'long', month: 'long', day: 'numeric',
  });
  return (
    <div className="flex items-center justify-center my-3 px-4">
      <div className="h-px flex-1 bg-border-color" />
      <span className="mx-3 text-xs text-subtle-text font-medium">{label}</span>
      <div className="h-px flex-1 bg-border-color" />
    </div>
  );
}

function groupByDate(messages) {
  const groups = [];
  let lastDate = null;
  messages.forEach((msg) => {
    const d = msg.createdAt ? new Date(msg.createdAt).toDateString() : null;
    if (d && d !== lastDate) {
      groups.push({ type: 'date', value: msg.createdAt });
      lastDate = d;
    }
    groups.push({ type: 'message', value: msg });
  });
  return groups;
}

export default function ChatWindow({ room, onBack }) {
  const { user } = useAuth();
  const { on, off, emit, isUserOnline, isConnected } = useSocket();
  const { sendNotification } = useNotification();
  const {
    callState,
    callType,
    remoteUser,
    isMicOn,
    isCameraOn,
    callDuration,
    localVideoRef,
    remoteVideoRef,
    startCall,
    acceptCall,
    rejectCall,
    endCall,
    toggleMic,
    toggleCamera
  } = useWebRTC();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [peerTyping, setPeerTyping] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null);
  const bottomRef = useRef(null);
  const instanceId = useId();
  // Tracks the latest pending optimistic temp ID so the socket echo can swap it
  const pendingTempId = useRef(null);

  const peer = getPeerFromRoom(room, user?._id);
  const peerOnline = peer ? isUserOnline(peer?._id ?? peer) : false;
  const roomName = room?.type === 'group' ? room.name : peer?.name ?? 'Chat';

  // Fetch history
  useEffect(() => {
    if (!room?._id) return;
    setMessages([]);
    setPeerTyping(false);
    setReplyingTo(null);
    setLoading(true);

    emit('join_room', room._id);

    messagesAPI
      .getByRoom(room._id)
      .then((res) => {
        const roomMessages = res.data.messages || [];
        setMessages(roomMessages);

        roomMessages
          .filter((m) => (m.senderId?._id ?? m.senderId) !== user?._id)
          .forEach((msg) => {
            emit('message_ack', { messageId: msg._id, roomId: room._id });
          });
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    return () => {
      emit('leave_room', room._id);
    };
  }, [room?._id, emit, user?._id]);

  // Socket subscriptions
  useEffect(() => {
    if (!room?._id) return;

    on('new_message', instanceId, (msg) => {
      if (msg.roomId === room._id) {
        setMessages((prev) => {
          if (prev.some((m) => m._id === msg._id)) return prev;
          const tempId = pendingTempId.current;
          if (tempId && prev.some((m) => m._id === tempId)) {
            pendingTempId.current = null;
            return prev.map((m) => (m._id === tempId ? msg : m));
          }
          return [...prev, msg];
        });

        if ((msg.senderId?._id ?? msg.senderId) !== user?._id) {
          emit('message_ack', { messageId: msg._id, roomId: room._id });
          // Send notification for incoming message
          const senderName = msg.senderId?.name ?? 'Unknown';
          sendNotification(senderName, msg.content);
        }
      }
    });

    on('message_delivered', instanceId, (data) => {
      setMessages((prev) =>
        prev.map((m) => {
          if (data.messageId) return m._id === data.messageId ? { ...m, status: 'delivered' } : m;
          // If no messageId, mark all sent messages as delivered
          const isMine = m.senderId?._id === user?._id || m.senderId === user?._id;
          return isMine && m.status === 'sent' ? { ...m, status: 'delivered' } : m;
        })
      );
    });

    on('message_read', instanceId, (data) => {
      setMessages((prev) =>
        prev.map((m) => {
          if (data.messageId) return m._id === data.messageId ? { ...m, status: 'read' } : m;
          const isMine = m.senderId?._id === user?._id || m.senderId === user?._id;
          return isMine && m.status !== 'read' ? { ...m, status: 'read' } : m;
        })
      );
    });

    on('pending_messages', instanceId, ({ messages: pending }) => {
      const roomMessages = pending.filter((msg) => msg.roomId === room._id);
      if (!roomMessages.length) return;
      setMessages((prev) => {
        const missing = roomMessages.filter((msg) => !prev.some((m) => m._id === msg._id));
        return [...prev, ...missing].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      });
      roomMessages.forEach((msg) => {
        emit('message_ack', { messageId: msg._id, roomId: room._id });
        // Send notification for pending messages
        const senderName = msg.senderId?.name ?? 'Unknown';
        sendNotification(senderName, msg.content);
      });
    });

    on('room_sync', instanceId, ({ roomId, messages: missed }) => {
      if (roomId !== room._id) return;
      setMessages((prev) => {
        const missing = missed.filter((msg) => !prev.some((m) => m._id === msg._id));
        return [...prev, ...missing].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      });
      missed.forEach((msg) => {
        emit('message_ack', { messageId: msg._id, roomId: room._id });
        // Send notification for synced messages
        const senderName = msg.senderId?.name ?? 'Unknown';
        sendNotification(senderName, msg.content);
      });
    });

    on('typing_start', instanceId, (data) => {
      if (data.roomId === room._id && data.userId !== user?._id) {
        setPeerTyping(true);
      }
    });

    on('typing_stop', instanceId, (data) => {
      if (data.roomId === room._id && data.userId !== user?._id) {
        setPeerTyping(false);
      }
    });

    on('message_reacted', instanceId, (data) => {
      setMessages((prev) =>
        prev.map((m) =>
          m._id === data.messageId ? { ...m, reactions: data.reactions } : m
        )
      );
    });

    return () => {
      off('message_delivered', instanceId);
      off('message_read', instanceId);
      off('typing_start', instanceId);
      off('typing_stop', instanceId);
      off('message_reacted', instanceId);
    };
  }, [room?._id, instanceId, on, off, emit, user?._id, sendNotification]);

  // Ensure the active room is rejoined after reconnect and request any pending messages
  useEffect(() => {
    if (!room?._id || !isConnected) return;

    emit('join_room', room._id);
    emit('request_pending');
  }, [room?._id, isConnected, emit]);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, peerTyping]);

  const handleSend = useCallback(
    (content, type = 'text') => {
      if (!room?._id) return;
      // Add optimistic message for instant UI feedback
      const tempId = `temp_${Date.now()}`;
      pendingTempId.current = tempId;
      const optimistic = {
        _id: tempId,
        roomId: room._id,
        senderId: user,
        content,
        type,
        replyTo: replyingTo,
        status: 'sent',
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, optimistic]);
      emit('send_message', { roomId: room._id, content, type, replyTo: replyingTo?._id });
      setReplyingTo(null);
    },
    [room?._id, user, emit, replyingTo]
  );

  const items = groupByDate(messages);
  let msgIdx = -1;

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Top App Bar */}
      <div
        className="flex items-center gap-3 px-3 py-3 bg-surface border-b border-border-color
                   shadow-google sticky top-0 z-10"
      >
        {/* Back (mobile) */}
        <button
          id="chat-back-btn"
          className="btn-icon md:hidden"
          onClick={onBack}
          aria-label="Back"
        >
          <ArrowLeft size={22} />
        </button>

        <Avatar name={roomName} size={40} online={peerOnline} />

        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold text-on-surface truncate leading-tight">
            {roomName}
          </h2>
          <p className="text-xs text-subtle-text leading-tight">
            {peerTyping ? (
              <span className="text-primary animate-pulse">typing…</span>
            ) : peerOnline ? (
              'Online'
            ) : peer?.lastSeen ? (
              `Last seen ${new Date(peer.lastSeen).toLocaleTimeString([], {
                hour: '2-digit', minute: '2-digit',
              })}`
            ) : (
              'Offline'
            )}
          </p>
        </div>

        <div className="flex items-center gap-1">
          <button id="btn-call" className="btn-icon" aria-label="Voice call" title="Voice call" onClick={() => peer && startCall(peer, 'audio')}>
            <Phone size={20} />
          </button>
          <button id="btn-video" className="btn-icon" aria-label="Video call" title="Video call" onClick={() => peer && startCall(peer, 'video')}>
            <Video size={20} />
          </button>
          <button id="btn-more" className="btn-icon" aria-label="More options">
            <MoreVertical size={20} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto py-2 scrollbar-hidden">
        {loading && (
          <div className="flex justify-center items-center h-full">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!loading && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-8">
            <div className="text-5xl">💬</div>
            <p className="text-subtle-text text-sm">
              No messages yet. Say hi to <strong>{roomName}</strong>!
            </p>
          </div>
        )}

        {!loading &&
          items.map((item, i) => {
            if (item.type === 'date') {
              return <DateDivider key={`date-${i}`} date={item.value} />;
            }
            msgIdx++;
            const prevMsg = items
              .slice(0, i)
              .filter((x) => x.type === 'message')
              .at(-1)?.value;
            return (
              <MessageBubble
                key={item.value._id}
                message={item.value}
                prevMessage={prevMsg}
                onReply={() => setReplyingTo(item.value)}
              />
            );
          })}

        {peerTyping && <TypingIndicator />}
        <div ref={bottomRef} className="h-2" />
      </div>

      {/* Input */}
      <InputBar 
        roomId={room?._id} 
        onSend={handleSend} 
        disabled={!room?._id} 
        replyingTo={replyingTo}
        onCancelReply={() => setReplyingTo(null)}
      />

      {/* Call UI */}
      <CallUI
        callState={callState}
        callType={callType}
        remoteUser={remoteUser}
        isMicOn={isMicOn}
        isCameraOn={isCameraOn}
        callDuration={callDuration}
        localVideoRef={localVideoRef}
        remoteVideoRef={remoteVideoRef}
        acceptCall={acceptCall}
        rejectCall={rejectCall}
        endCall={endCall}
        toggleMic={toggleMic}
        toggleCamera={toggleCamera}
      />
    </div>
  );
}

import { useEffect, useRef, useState, useCallback, useId } from 'react';
import { ArrowLeft, Phone, Video, MoreVertical, X, Edit2, Check, Camera, Trash2, VolumeX, User } from 'lucide-react';
import { messagesAPI, roomsAPI } from '../lib/api';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../hooks/useNotification';
import { useWebRTC } from '../hooks/useWebRTC';
import Avatar from './Avatar';
import MessageBubble from './MessageBubble';
import InputBar from './InputBar';
import TypingIndicator from './TypingIndicator';
import CallUI from './CallUI';
import { formatLastSeen } from '../lib/formatLastSeen';

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

export default function ChatWindow({ room, onBack, onDeleteRoom, onUpdateRoom, mutedRooms = [], onToggleMuteRoom }) {
  const { user } = useAuth();
  const { on, off, emit, isUserOnline, isConnected, getUserLastSeen } = useSocket();
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
  const roomName = room?.name || (room?.type === 'group' ? 'Group Chat' : peer?.name ?? 'Chat');

  // Chat Info / Group Details Modal State
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [tempName, setTempName] = useState('');
  const [modalMenuOpen, setModalMenuOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef(null);

  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);

  useEffect(() => {
    setShowInfoModal(false);
    setEditMode(false);
    setTempName('');
    setModalMenuOpen(false);
    setSaving(false);
    setHeaderMenuOpen(false);
  }, [room?._id]);

  // Close header menu on click outside
  useEffect(() => {
    if (!headerMenuOpen) return;
    const handleOutsideClick = () => setHeaderMenuOpen(false);
    document.addEventListener('click', handleOutsideClick);
    return () => document.removeEventListener('click', handleOutsideClick);
  }, [headerMenuOpen]);

  useEffect(() => {
    if (showInfoModal) {
      setTempName(roomName);
    }
  }, [showInfoModal, roomName]);

  // Close modal menu on click outside
  useEffect(() => {
    if (!modalMenuOpen) return;
    const handleOutsideClick = () => setModalMenuOpen(false);
    document.addEventListener('click', handleOutsideClick);
    return () => document.removeEventListener('click', handleOutsideClick);
  }, [modalMenuOpen]);

  const handleSaveName = async () => {
    if (!tempName.trim() || tempName.trim() === roomName) {
      setEditMode(false);
      return;
    }
    setSaving(true);
    try {
      const res = await roomsAPI.update(room._id, { name: tempName.trim() });
      if (onUpdateRoom) {
        onUpdateRoom(res.data.room);
      }
      setEditMode(false);
    } catch (err) {
      console.error('Failed to update name:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarClick = () => {
    if (room?.type === 'group' && fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      alert('File size exceeds 5MB limit.');
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result;
      setSaving(true);
      try {
        const res = await roomsAPI.update(room._id, { avatar: base64 });
        if (onUpdateRoom) {
          onUpdateRoom(res.data.room);
        }
      } catch (err) {
        console.error('Failed to update group avatar:', err);
      } finally {
        setSaving(false);
      }
    };
    reader.readAsDataURL(file);
  };

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
          if (!mutedRooms.includes(room._id)) {
            sendNotification(senderName, msg.content);
          }
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
        if (!mutedRooms.includes(room._id)) {
          sendNotification(senderName, msg.content);
        }
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
        if (!mutedRooms.includes(room._id)) {
          sendNotification(senderName, msg.content);
        }
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

    on('reaction_update', instanceId, (data) => {
      setMessages((prev) =>
        prev.map((m) =>
          m._id === data.messageId ? { ...m, reactions: data.reactions } : m
        )
      );
    });

    on('room_updated', instanceId, (data) => {
      if (data.roomId === room._id) {
        roomsAPI.getAll().then((res) => {
          const roomsList = res.data.rooms || [];
          const updatedSelected = roomsList.find((r) => r._id === room._id);
          if (updatedSelected && onUpdateRoom) {
            onUpdateRoom(updatedSelected);
          }
        }).catch(() => {});
      }
    });

    return () => {
      off('message_delivered', instanceId);
      off('message_read', instanceId);
      off('typing_start', instanceId);
      off('typing_stop', instanceId);
      off('reaction_update', instanceId);
      off('room_updated', instanceId);
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

  const renderInfoModal = () => {
    if (!showInfoModal) return null;

    return (
      <div 
        className="fixed inset-0 z-[1000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
        onClick={() => setShowInfoModal(false)}
      >
        <div 
          className="bg-surface rounded-card w-full max-w-md shadow-google-lg flex flex-col max-h-[90vh] animate-pop-in border border-border-color text-on-surface"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Modal Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border-color">
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setShowInfoModal(false)}
                className="btn-icon p-1 hover:bg-hover-bg rounded-full text-subtle-text hover:text-on-surface"
                aria-label="Close details"
              >
                <X size={20} />
              </button>
              <h3 className="text-sm font-semibold font-google">
                {room.type === 'group' ? 'Group Details' : 'Contact Information'}
              </h3>
            </div>
            
            {/* Modal Actions */}
            <div className="relative">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setModalMenuOpen(!modalMenuOpen);
                }}
                className="p-2 rounded-full hover:bg-hover-bg transition-colors text-subtle-text hover:text-on-surface"
                aria-label="Options"
              >
                <MoreVertical size={20} />
              </button>
              {modalMenuOpen && (
                <div
                  className="absolute right-0 mt-1 py-1 w-40 bg-surface border border-border-color 
                             rounded-card shadow-google-md z-[1010] text-xs text-on-surface animate-pop-in"
                >
                  <button
                    onClick={() => {
                      setModalMenuOpen(false);
                      if (onToggleMuteRoom) {
                        onToggleMuteRoom(room._id);
                      }
                    }}
                    className="w-full text-left px-3 py-2.5 hover:bg-hover-bg text-on-surface 
                               flex items-center gap-2 transition-colors duration-150"
                  >
                    <VolumeX size={14} className="text-subtle-text" />
                    <span className="font-medium">{mutedRooms.includes(room._id) ? 'Unmute' : 'Mute'}</span>
                  </button>
                  <button
                    onClick={() => {
                      setModalMenuOpen(false);
                      setShowInfoModal(false);
                      if (onDeleteRoom) {
                        onDeleteRoom(room._id);
                      }
                    }}
                    className="w-full text-left px-3 py-2.5 hover:bg-hover-bg text-error 
                               flex items-center gap-2 transition-colors duration-150 border-t border-border-color"
                  >
                    <Trash2 size={14} />
                    <span className="font-medium">Delete Chat</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Modal Body */}
          <div className="flex-1 overflow-y-auto p-6 flex flex-col items-center">
            {/* Avatar Section */}
            <div className="relative group mb-4">
              <div 
                className={`relative rounded-full overflow-hidden ${room.type === 'group' ? 'cursor-pointer hover:opacity-90 active:scale-95' : ''} transition-all`}
                onClick={handleAvatarClick}
              >
                <Avatar name={roomName} src={room.avatar || ''} size={96} />
                {room.type === 'group' && (
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <Camera size={24} className="text-white" />
                  </div>
                )}
              </div>
              {room.type === 'group' && (
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleAvatarChange} 
                  accept="image/*" 
                  className="hidden" 
                />
              )}
            </div>

            {/* Room/Contact Name Section */}
            <div className="w-full mb-6 flex flex-col items-center">
              {editMode ? (
                <div className="flex items-center gap-2 w-full max-w-xs">
                  <input
                    type="text"
                    value={tempName}
                    onChange={(e) => setTempName(e.target.value)}
                    className="input-field py-1.5 px-3 text-sm flex-1 text-center"
                    placeholder="Enter chat name..."
                    autoFocus
                    disabled={saving}
                  />
                  <button 
                    onClick={handleSaveName}
                    disabled={saving}
                    className="p-2 rounded-full bg-primary/10 text-primary hover:bg-primary/20 active:scale-95 transition-all"
                    title="Save name"
                  >
                    <Check size={16} />
                  </button>
                  <button 
                    onClick={() => {
                      setEditMode(false);
                      setTempName(roomName);
                    }}
                    disabled={saving}
                    className="p-2 rounded-full bg-hover-bg text-subtle-text hover:bg-border-color active:scale-95 transition-all"
                    title="Cancel"
                  >
                    <X size={16} />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold text-on-surface font-google truncate max-w-[280px]">
                    {roomName}
                  </h2>
                  {mutedRooms.includes(room._id) && <VolumeX size={16} className="text-subtle-text" />}
                  <button
                    onClick={() => setEditMode(true)}
                    className="p-1 rounded-full hover:bg-hover-bg text-subtle-text hover:text-on-surface transition-colors"
                    title="Edit Name"
                  >
                    <Edit2 size={14} />
                  </button>
                </div>
              )}
              {saving && <p className="text-xs text-primary mt-1 animate-pulse">saving changes...</p>}
            </div>

            {/* Info Section */}
            {room.type === 'dm' ? (
              <div className="w-full bg-background rounded-card p-4 border border-border-color space-y-3">
                <div>
                  <label className="text-[10px] uppercase font-bold text-subtle-text tracking-wider">Email Address</label>
                  <p className="text-sm font-medium text-on-surface">{peer?.email ?? 'N/A'}</p>
                </div>
                <div>
                  <label className="text-[10px] uppercase font-bold text-subtle-text tracking-wider">Presence Status</label>
                  <p className="text-sm font-medium text-on-surface flex items-center gap-1.5 mt-0.5">
                    <span className={`w-2.5 h-2.5 rounded-full ${peerOnline ? 'bg-success' : 'bg-subtle-text/40'}`} />
                    {peerOnline ? 'Online' : 'Offline'}
                  </p>
                </div>
                {peer?.lastSeen && !peerOnline && (
                  <div>
                    <label className="text-[10px] uppercase font-bold text-subtle-text tracking-wider">Last Seen</label>
                    <p className="text-xs text-subtle-text">
                      {new Date(peer.lastSeen).toLocaleString()}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="w-full flex flex-col flex-1 min-h-0">
                <div className="flex justify-between items-center mb-3">
                  <h4 className="text-xs font-bold text-subtle-text uppercase tracking-wider">
                    Members ({room.members?.length || 0})
                  </h4>
                </div>
                <div className="w-full bg-background rounded-card border border-border-color overflow-y-auto max-h-[220px] divide-y divide-border-color">
                  {room.members?.map((member) => {
                    const isMemberOnline = isUserOnline(member._id ?? member);
                    const isAdmin = room.admins?.some(adminId => (adminId._id ?? adminId) === (member._id ?? member));
                    const isSelf = member._id === user?._id;
                    
                    return (
                      <div key={member._id} className="flex items-center gap-3 px-3 py-2.5 animate-slide-up">
                        <Avatar name={member.name} src={member.avatar || ''} size={32} online={isMemberOnline} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-on-surface truncate">
                            {member.name} {isSelf && <span className="text-[10px] text-primary">(You)</span>}
                          </p>
                          <p className="text-[10px] text-subtle-text truncate">{member.email}</p>
                        </div>
                        {isAdmin && (
                          <span className="shrink-0 text-[9px] font-semibold bg-primary-light text-primary px-1.5 py-0.5 rounded-pill">
                            Admin
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {renderInfoModal()}
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

        <div 
          onClick={() => setShowInfoModal(true)}
          className="flex flex-1 items-center gap-3 cursor-pointer select-none hover:opacity-90 active:scale-[0.99] transition-all"
        >
          <Avatar name={roomName} src={room.avatar || ''} size={40} online={peerOnline} />

          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold text-on-surface truncate leading-tight flex items-center gap-1.5">
              {roomName}
              {mutedRooms.includes(room._id) && <VolumeX size={13} className="text-subtle-text shrink-0" />}
            </h2>
            <p className="text-xs text-subtle-text leading-tight">
              {peerTyping ? (
                <span className="text-primary animate-pulse">typing…</span>
              ) : (
                formatLastSeen(
                  peerOnline ? 'online' : 'offline',
                  peer ? getUserLastSeen(peer._id ?? peer, peer.lastSeen) : null
                )
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button id="btn-call" className="btn-icon" aria-label="Voice call" title="Voice call" onClick={() => peer && startCall(peer, 'audio')}>
            <Phone size={20} />
          </button>
          <button id="btn-video" className="btn-icon" aria-label="Video call" title="Video call" onClick={() => peer && startCall(peer, 'video')}>
            <Video size={20} />
          </button>
          <div className="relative leading-none">
            <button 
              id="btn-more" 
              className="btn-icon" 
              aria-label="More options"
              onClick={(e) => {
                e.stopPropagation();
                setHeaderMenuOpen(!headerMenuOpen);
              }}
            >
              <MoreVertical size={20} />
            </button>
            {headerMenuOpen && (
              <div
                className="absolute right-0 mt-1 py-1 w-44 bg-surface border border-border-color 
                           rounded-card shadow-google-md z-50 text-xs text-on-surface animate-pop-in"
              >
                <button
                  onClick={() => {
                    setHeaderMenuOpen(false);
                    setShowInfoModal(true);
                  }}
                  className="w-full text-left px-3 py-2.5 hover:bg-hover-bg text-on-surface 
                             flex items-center gap-2 transition-colors duration-150 font-medium"
                >
                  <User size={14} className="text-subtle-text" />
                  <span>{room?.type === 'group' ? 'Group info' : 'Contact info'}</span>
                </button>
                <button
                  onClick={() => {
                    setHeaderMenuOpen(false);
                    if (onToggleMuteRoom) {
                      onToggleMuteRoom(room._id);
                    }
                  }}
                  className="w-full text-left px-3 py-2.5 hover:bg-hover-bg text-on-surface 
                             flex items-center gap-2 transition-colors duration-150 font-medium"
                >
                  <VolumeX size={14} className="text-subtle-text" />
                  <span>{mutedRooms.includes(room._id) ? 'Unmute notifications' : 'Mute notifications'}</span>
                </button>
              </div>
            )}
          </div>
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

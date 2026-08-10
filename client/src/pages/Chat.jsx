import { useState, useEffect, useCallback, useId } from 'react';
import { MessageSquare } from 'lucide-react';
import toast from 'react-hot-toast';
import Sidebar from '../components/Sidebar';
import ChatWindow from '../components/ChatWindow';
import NavigationBar from '../components/NavigationBar';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { useNotification } from '../hooks/useNotification';
import { roomsAPI } from '../lib/api';

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full bg-background gap-4">
      <div
        className="w-20 h-20 rounded-full bg-primary-light flex items-center justify-center"
        style={{ animation: 'fadeIn 0.4s ease-out' }}
      >
        <MessageSquare size={36} className="text-primary" />
      </div>
      <div className="text-center">
        <h2 className="text-xl font-semibold text-on-surface font-google">Your Messages</h2>
        <p className="text-sm text-subtle-text mt-1 max-w-xs">
          Select a conversation from the sidebar or search for someone to start a new chat.
        </p>
      </div>
    </div>
  );
}

export default function Chat() {
  const { user } = useAuth();
  const { on, off } = useSocket();
  const { sendNotification } = useNotification();
  const instanceId = useId();
  const [selectedRoom, setSelectedRoom] = useState(null);
  // For mobile, track whether the sidebar or chat is shown
  const [mobileView, setMobileView] = useState('sidebar'); // 'sidebar' | 'chat'
  const [activeTab, setActiveTab] = useState('chats'); // 'chats' | 'groups' | 'status'

  const [deletedRooms, setDeletedRooms] = useState({});
  const [pinnedRooms, setPinnedRooms] = useState([]);
  const [mutedRooms, setMutedRooms] = useState([]);

  const userId = user?._id;

  // Listen for new messages globally to show notifications for background chats
  useEffect(() => {
    if (!userId) return;

    on('new_message', instanceId, (msg) => {
      const isMine = msg.senderId?._id === userId || msg.senderId === userId;
      if (isMine) return;

      if (msg.roomId !== selectedRoom?._id) {
        if (!mutedRooms.includes(msg.roomId)) {
          const senderName = msg.senderId?.name || 'New Message';
          sendNotification(senderName, msg.content);
          
          // Fallback in-app toast notification if browser permission is not granted
          toast(`${senderName}: ${msg.content}`, {
            icon: '💬',
            style: {
              borderRadius: '12px',
              background: 'var(--md-sys-color-surface, #fff)',
              color: 'var(--md-sys-color-on-surface, #000)',
              border: '1px solid var(--md-sys-color-border-color, #e0e0e0)',
              fontFamily: '"DM Sans", "Google Sans", Roboto, sans-serif',
              fontSize: '14px',
            },
          });
        }
      }
    });

    return () => {
      off('new_message', instanceId);
    };
  }, [selectedRoom?._id, mutedRooms, userId, on, off, sendNotification, instanceId]);

  // Load deleted, pinned, and muted rooms from localStorage when user changes
  useEffect(() => {
    if (!userId) return;
    try {
      // eslint-disable-next-line react-hooks/rules-of-hooks, react-hooks/set-state-in-effect
      setDeletedRooms(JSON.parse(localStorage.getItem(`deleted_rooms_${userId}`) || '{}'));
    } catch {
      // eslint-disable-next-line react-hooks/rules-of-hooks, react-hooks/set-state-in-effect
      setDeletedRooms({});
    }
    try {
      // eslint-disable-next-line react-hooks/rules-of-hooks, react-hooks/set-state-in-effect
      setPinnedRooms(JSON.parse(localStorage.getItem(`pinned_rooms_${userId}`) || '[]'));
    } catch {
      // eslint-disable-next-line react-hooks/rules-of-hooks, react-hooks/set-state-in-effect
      setPinnedRooms([]);
    }
    try {
      // eslint-disable-next-line react-hooks/rules-of-hooks, react-hooks/set-state-in-effect
      setMutedRooms(JSON.parse(localStorage.getItem(`muted_rooms_${userId}`) || '[]'));
    } catch {
      // eslint-disable-next-line react-hooks/rules-of-hooks, react-hooks/set-state-in-effect
      setMutedRooms([]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const handlePinRoom = useCallback((roomId) => {
    if (!userId) return;
    let updated;
    if (pinnedRooms.includes(roomId)) {
      updated = pinnedRooms.filter((id) => id !== roomId);
    } else {
      updated = [...pinnedRooms, roomId];
    }
    localStorage.setItem(`pinned_rooms_${userId}`, JSON.stringify(updated));
    setPinnedRooms(updated);
  }, [pinnedRooms, userId]);

  const handleDeleteRoom = useCallback((roomId) => {
    if (!userId) return;
    const updated = {
      ...deletedRooms,
      [roomId]: Date.now()
    };
    localStorage.setItem(`deleted_rooms_${userId}`, JSON.stringify(updated));
    setDeletedRooms(updated);
    if (selectedRoom?._id === roomId) {
      setSelectedRoom(null);
      setMobileView('sidebar');
    }
  }, [deletedRooms, userId, selectedRoom?._id]);

  const handleToggleMuteRoom = useCallback(async (roomId) => {
    if (!userId) return;
    try {
      // Optimistic local update
      let updated;
      if (mutedRooms.includes(roomId)) {
        updated = mutedRooms.filter((id) => id !== roomId);
      } else {
        updated = [...mutedRooms, roomId];
      }
      setMutedRooms(updated);
      localStorage.setItem(`muted_rooms_${userId}`, JSON.stringify(updated));
      
      await roomsAPI.mute(roomId);
    } catch (err) {
      console.error('Failed to mute/unmute room', err);
    }
  }, [mutedRooms, userId]);

  const handleToggleArchiveRoom = useCallback(async (roomId) => {
    if (!userId) return;
    try {
      await roomsAPI.archive(roomId);
    } catch (err) {
      console.error('Failed to archive/unarchive room', err);
    }
  }, [userId]);

  const handleSelectRoom = (room) => {
    setSelectedRoom(room);
    setMobileView('chat');
  };

  const handleBack = () => {
    setMobileView('sidebar');
    setSelectedRoom(null);
  };

  return (
    <div className="flex h-[100dvh] overflow-hidden flex-col-reverse md:flex-row bg-background relative">
      <div className={`${mobileView === 'chat' ? 'hidden' : 'flex'} md:flex shrink-0 w-full md:w-[72px]`}>
        <NavigationBar activeTab={activeTab} onChange={setActiveTab} />
      </div>
      
      {/* Sidebar — conditionally visible on mobile */}
      <div
        className={`
          ${mobileView === 'sidebar' ? 'flex' : 'hidden'}
          md:flex flex-col flex-1 min-h-0
          w-full md:w-80 lg:w-[360px] md:flex-none
        `}
      >
        <Sidebar 
          selectedRoom={selectedRoom} 
          onSelectRoom={handleSelectRoom} 
          deletedRooms={deletedRooms}
          pinnedRooms={pinnedRooms}
          mutedRooms={mutedRooms}
          onPinRoom={handlePinRoom}
          onDeleteRoom={handleDeleteRoom}
          onToggleMuteRoom={handleToggleMuteRoom}
          onToggleArchiveRoom={handleToggleArchiveRoom}
          activeTab={activeTab}
        />
      </div>

      {/* Divider */}
      <div className="hidden md:block w-px bg-border-color" />

      {/* Chat area */}
      <div
        className={`
          ${mobileView === 'chat' ? 'flex' : 'hidden'}
          md:flex flex-col flex-1 min-w-0 min-h-0
        `}
      >
        {selectedRoom ? (
          <ChatWindow 
            key={selectedRoom._id}
            room={selectedRoom} 
            onBack={handleBack} 
            onDeleteRoom={handleDeleteRoom}
            onUpdateRoom={(updatedRoom) => setSelectedRoom(updatedRoom)}
            mutedRooms={mutedRooms}
            onToggleMuteRoom={handleToggleMuteRoom}
          />
        ) : (
          <EmptyState />
        )}
      </div>
    </div>
  );
}

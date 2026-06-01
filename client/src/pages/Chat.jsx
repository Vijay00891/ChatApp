import { useState, useEffect, useCallback } from 'react';
import { MessageSquare } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import ChatWindow from '../components/ChatWindow';
import { useAuth } from '../context/AuthContext';

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
  const [selectedRoom, setSelectedRoom] = useState(null);
  // For mobile, track whether the sidebar or chat is shown
  const [mobileView, setMobileView] = useState('sidebar'); // 'sidebar' | 'chat'

  const [deletedRooms, setDeletedRooms] = useState({});
  const [pinnedRooms, setPinnedRooms] = useState([]);
  const [mutedRooms, setMutedRooms] = useState([]);

  // Load deleted, pinned, and muted rooms from localStorage when user changes
  useEffect(() => {
    if (!user?._id) return;
    try {
      setDeletedRooms(JSON.parse(localStorage.getItem(`deleted_rooms_${user._id}`) || '{}'));
    } catch {
      setDeletedRooms({});
    }
    try {
      setPinnedRooms(JSON.parse(localStorage.getItem(`pinned_rooms_${user._id}`) || '[]'));
    } catch {
      setPinnedRooms([]);
    }
    try {
      setMutedRooms(JSON.parse(localStorage.getItem(`muted_rooms_${user._id}`) || '[]'));
    } catch {
      setMutedRooms([]);
    }
  }, [user?._id]);

  const handlePinRoom = useCallback((roomId) => {
    if (!user?._id) return;
    let updated;
    if (pinnedRooms.includes(roomId)) {
      updated = pinnedRooms.filter((id) => id !== roomId);
    } else {
      updated = [...pinnedRooms, roomId];
    }
    localStorage.setItem(`pinned_rooms_${user._id}`, JSON.stringify(updated));
    setPinnedRooms(updated);
  }, [pinnedRooms, user?._id]);

  const handleDeleteRoom = useCallback((roomId) => {
    if (!user?._id) return;
    const updated = {
      ...deletedRooms,
      [roomId]: Date.now()
    };
    localStorage.setItem(`deleted_rooms_${user._id}`, JSON.stringify(updated));
    setDeletedRooms(updated);
    if (selectedRoom?._id === roomId) {
      setSelectedRoom(null);
      setMobileView('sidebar');
    }
  }, [deletedRooms, user?._id, selectedRoom?._id]);

  const handleToggleMuteRoom = useCallback((roomId) => {
    if (!user?._id) return;
    let updated;
    if (mutedRooms.includes(roomId)) {
      updated = mutedRooms.filter((id) => id !== roomId);
    } else {
      updated = [...mutedRooms, roomId];
    }
    localStorage.setItem(`muted_rooms_${user._id}`, JSON.stringify(updated));
    setMutedRooms(updated);
  }, [mutedRooms, user?._id]);

  const handleSelectRoom = (room) => {
    setSelectedRoom(room);
    setMobileView('chat');
  };

  const handleBack = () => {
    setMobileView('sidebar');
    setSelectedRoom(null);
  };

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar — always visible on desktop, conditionally on mobile */}
      <div
        className={`
          ${mobileView === 'sidebar' ? 'flex' : 'hidden'}
          md:flex flex-col
          w-full md:w-80 lg:w-96 shrink-0
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
        />
      </div>

      {/* Divider */}
      <div className="hidden md:block w-px bg-border-color" />

      {/* Chat area */}
      <div
        className={`
          ${mobileView === 'chat' ? 'flex' : 'hidden'}
          md:flex flex-col flex-1 min-w-0
        `}
      >
        {selectedRoom ? (
          <ChatWindow 
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

import { useState, useEffect, useCallback, useId } from 'react';
import { Search, X, Plus, MessageSquare, LogOut, Wifi, WifiOff } from 'lucide-react';
import { roomsAPI, usersAPI } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import Avatar from './Avatar';

function formatRelativeTime(dateStr) {
  if (!dateStr) return '';
  const now = Date.now();
  const d = new Date(dateStr).getTime();
  const diff = now - d;
  if (diff < 60_000) return 'now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  return new Date(dateStr).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function RoomItem({ room, currentUserId, isSelected, onClick, isOnline }) {
  const peer =
    room.type === 'dm'
      ? room.members?.find((m) => (m._id ?? m) !== currentUserId)
      : null;
  const name = room.type === 'group' ? room.name : peer?.name ?? 'Unknown';
  const lastMsg = room.lastMessage;
  const unread = room.unread || 0;

  return (
    <button
      id={`room-${room._id}`}
      onClick={onClick}
      className={`sidebar-item w-full text-left transition-all duration-150 ripple-container
                  ${isSelected ? 'bg-active-bg border-l-4 border-primary pl-2' : ''}`}
    >
      <Avatar name={name} size={46} online={isOnline} />
      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-baseline gap-1">
          <span className="text-sm font-medium text-on-surface truncate">{name}</span>
          {lastMsg && (
            <span className="text-[10px] text-subtle-text shrink-0">
              {formatRelativeTime(lastMsg.createdAt)}
            </span>
          )}
        </div>
        <div className="flex justify-between items-center gap-1">
          <p className="text-xs text-subtle-text truncate leading-snug">
            {lastMsg ? lastMsg.content : 'No messages yet'}
          </p>
          {unread > 0 && (
            <span className="shrink-0 text-[10px] font-bold bg-primary text-white
                             rounded-full w-4 h-4 flex items-center justify-center">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

function UserSearchResult({ user, onStartChat }) {
  return (
    <button
      onClick={() => onStartChat(user._id)}
      className="sidebar-item w-full text-left ripple-container"
    >
      <Avatar name={user.name} size={40} />
      <div className="min-w-0">
        <p className="text-sm font-medium text-on-surface truncate">{user.name}</p>
        <p className="text-xs text-subtle-text truncate">{user.email}</p>
      </div>
    </button>
  );
}

export default function Sidebar({ selectedRoom, onSelectRoom }) {
  const { user, logout } = useAuth();
  const { isConnected, isUserOnline, on, off } = useSocket();
  const [rooms, setRooms] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [loadingRooms, setLoadingRooms] = useState(true);
  const instanceId = useId();

  // Load conversations
  const loadRooms = useCallback(() => {
    roomsAPI
      .getAll()
      .then((res) => setRooms(res.data.rooms || []))
      .catch(() => {})
      .finally(() => setLoadingRooms(false));
  }, []);

  useEffect(() => {
    loadRooms();
  }, [loadRooms]);

  // Listen for room updates to refresh sidebar
  useEffect(() => {
    on('room_updated', instanceId, () => loadRooms());
    on('new_message', instanceId, () => loadRooms());
    return () => {
      off('room_updated', instanceId);
      off('new_message', instanceId);
    };
  }, [instanceId, on, off, loadRooms]);

  // Search users
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(() => {
      setSearching(true);
      usersAPI
        .search(searchQuery)
        .then((res) => setSearchResults(res.data.users || []))
        .catch(() => setSearchResults([]))
        .finally(() => setSearching(false));
    }, 350);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleStartChat = useCallback(
    async (userId) => {
      try {
        const res = await roomsAPI.createDM(userId);
        const newRoom = res.data.room;
        setRooms((prev) => {
          const exists = prev.some((r) => r._id === newRoom._id);
          return exists ? prev : [newRoom, ...prev];
        });
        onSelectRoom(newRoom);
        setSearchQuery('');
        setSearchResults([]);
      } catch (e) {
        console.error(e);
      }
    },
    [onSelectRoom]
  );

  const isSearchMode = searchQuery.trim().length > 0;

  return (
    <div className="flex flex-col h-full bg-surface border-r border-border-color w-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-4 border-b border-border-color">
        <div className="flex items-center gap-2 flex-1">
          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
            <MessageSquare size={16} className="text-white" />
          </div>
          <span className="text-base font-semibold text-on-surface font-google">Messages</span>
          {/* Connection indicator */}
          <div className="ml-auto">
            {isConnected ? (
              <Wifi size={14} className="text-success" title="Connected" />
            ) : (
              <WifiOff size={14} className="text-error animate-pulse" title="Disconnected" />
            )}
          </div>
        </div>

        <button
          id="btn-logout"
          onClick={logout}
          className="btn-icon"
          aria-label="Sign out"
          title="Sign out"
        >
          <LogOut size={18} />
        </button>
      </div>

      {/* Current user info */}
      <div className="flex items-center gap-2.5 px-4 py-2.5 bg-background">
        <Avatar name={user?.name} size={34} online={true} />
        <div className="min-w-0">
          <p className="text-xs font-semibold text-on-surface truncate">{user?.name}</p>
          <p className="text-[10px] text-subtle-text truncate">{user?.email}</p>
        </div>
      </div>

      {/* Search bar */}
      <div className="px-3 py-2">
        <div className="relative">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle-text pointer-events-none"
          />
          <input
            id="search-users"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search people…"
            className="w-full pl-9 pr-8 py-2 bg-background border border-border-color
                       rounded-pill text-sm text-on-surface placeholder-subtle-text
                       focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20
                       transition-all duration-200 font-ui"
          />
          {searchQuery && (
            <button
              onClick={() => { setSearchQuery(''); setSearchResults([]); }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-subtle-text
                         hover:text-on-surface transition-colors"
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Scrollable list */}
      <div className="flex-1 overflow-y-auto px-2 pb-4 scrollbar-hidden">
        {isSearchMode ? (
          <>
            <p className="text-xs text-subtle-text font-medium px-2 py-1">
              {searching ? 'Searching…' : `People (${searchResults.length})`}
            </p>
            {searchResults.length === 0 && !searching && (
              <p className="text-xs text-subtle-text text-center mt-6">No users found</p>
            )}
            {searchResults.map((u) => (
              <UserSearchResult key={u._id} user={u} onStartChat={handleStartChat} />
            ))}
          </>
        ) : (
          <>
            {loadingRooms && (
              <div className="flex justify-center items-center mt-8">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            )}
            {!loadingRooms && rooms.length === 0 && (
              <div className="flex flex-col items-center mt-12 gap-3 text-center px-4">
                <Plus size={32} className="text-border-color" />
                <p className="text-xs text-subtle-text">
                  Search for someone above to start chatting
                </p>
              </div>
            )}
            {rooms.map((room) => {
              const peer =
                room.type === 'dm'
                  ? room.members?.find((m) => (m._id ?? m) !== user?._id)
                  : null;
              const peerId = peer?._id ?? peer;
              return (
                <RoomItem
                  key={room._id}
                  room={room}
                  currentUserId={user?._id}
                  isSelected={selectedRoom?._id === room._id}
                  onClick={() => onSelectRoom(room)}
                  isOnline={peerId ? isUserOnline(peerId) : false}
                />
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}

import { useState, useEffect, useCallback, useId, useMemo } from 'react';
import { Search, X, Plus, MessageSquare, LogOut, Wifi, WifiOff, MoreVertical, Pin, Trash2, VolumeX } from 'lucide-react';
import { roomsAPI, usersAPI } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import Avatar from './Avatar';
import { useOffline } from '../context/OfflineContext';
import { getAllRooms, saveRooms } from '../utils/db';
import SyncStatusIcon from './SyncStatusIcon';

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

function RoomItem({ room, currentUserId, isSelected, onClick, isOnline, onPin, onDelete, isPinned, isMuted }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const peer =
    room.type === 'dm'
      ? room.members?.find((m) => (m._id ?? m) !== currentUserId)
      : null;
  const name = room.name || (room.type === 'group' ? 'Group Chat' : peer?.name ?? 'Unknown');
  const lastMsg = room.lastMessage;
  const unread = room.unread || 0;

  // Close dropdown on click outside
  useEffect(() => {
    if (!menuOpen) return;
    const handleOutsideClick = () => setMenuOpen(false);
    document.addEventListener('click', handleOutsideClick);
    return () => document.removeEventListener('click', handleOutsideClick);
  }, [menuOpen]);

  return (
    <div
      id={`room-${room._id}`}
      onClick={onClick}
      className={`sidebar-item w-full text-left transition-all duration-150 relative group
                  ${isSelected ? 'bg-active-bg border-l-4 border-primary pl-2' : ''}`}
      style={{ display: 'flex', alignItems: 'center', gap: '12px' }}
    >
      <Avatar name={name} src={room.avatar || ''} size={46} online={isOnline} />
      <div className="flex-1 min-w-0 pr-1">
        <div className="flex justify-between items-baseline gap-1">
          <span className="text-sm font-medium text-on-surface truncate flex items-center gap-1.5">
            {name}
            {isPinned && <Pin size={12} className="text-primary fill-primary rotate-45 shrink-0" />}
            {isMuted && <VolumeX size={12} className="text-subtle-text shrink-0" />}
          </span>
          {lastMsg && (
            <span className="text-[10px] text-subtle-text shrink-0">
              {formatRelativeTime(lastMsg.createdAt)}
            </span>
          )}
        </div>
        <div className="flex justify-between items-center gap-1 mt-0.5">
          <p className="text-xs text-subtle-text truncate leading-snug">
            {lastMsg ? lastMsg.content : 'No messages yet'}
          </p>
          <div className="flex items-center gap-1 shrink-0">
            {unread > 0 && (
              <span className="shrink-0 text-[10px] font-bold bg-primary text-white
                               rounded-full w-4 h-4 flex items-center justify-center">
                {unread > 9 ? '9+' : unread}
              </span>
            )}
            
            {/* Options Button & Dropdown */}
            <div className="relative leading-none">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen(!menuOpen);
                }}
                className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1 rounded-full 
                           hover:bg-hover-bg text-subtle-text hover:text-on-surface 
                           transition-all duration-150 shrink-0"
                title="Options"
                aria-label="Options"
              >
                <MoreVertical size={16} />
              </button>

              {menuOpen && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="absolute right-0 mt-1 py-1 w-28 bg-surface border border-border-color 
                             rounded-card shadow-google-md z-50 text-xs text-on-surface animate-pop-in"
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onPin(room._id);
                      setMenuOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-hover-bg text-on-surface 
                               flex items-center gap-2 transition-colors duration-150"
                  >
                    <Pin size={13} className={`${isPinned ? 'text-primary fill-primary' : 'text-subtle-text'}`} />
                    <span>{isPinned ? 'Unpin' : 'Pin'}</span>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(room._id);
                      setMenuOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-hover-bg text-error 
                               flex items-center gap-2 transition-colors duration-150"
                  >
                    <Trash2 size={13} />
                    <span>Delete</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
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

export default function Sidebar({ selectedRoom, onSelectRoom, deletedRooms = {}, pinnedRooms = [], onPinRoom, onDeleteRoom, mutedRooms = [], onToggleMuteRoom }) {
  const { user, logout } = useAuth();
  const { isConnected, isUserOnline, on, off } = useSocket();
  const { isOnline } = useOffline();
  const [rooms, setRooms] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [loadingRooms, setLoadingRooms] = useState(true);
  const instanceId = useId();

  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [selectedMembers, setSelectedMembers] = useState([]);

  // Close header menu on click outside
  useEffect(() => {
    if (!headerMenuOpen) return;
    const handleOutsideClick = () => setHeaderMenuOpen(false);
    document.addEventListener('click', handleOutsideClick);
    return () => document.removeEventListener('click', handleOutsideClick);
  }, [headerMenuOpen]);

  // Reset group modal states when closed
  useEffect(() => {
    if (!showGroupModal) {
      setGroupName('');
      setSelectedMembers([]);
    }
  }, [showGroupModal]);

  // Extract unique friends currently listed in user's sidebar
  const uniqueFriends = useMemo(() => {
    if (!user?._id) return [];
    const chatFriends = rooms
      .filter((room) => room.type === 'dm')
      .map((room) => room.members?.find((m) => (m._id ?? m) !== user._id))
      .filter(Boolean);
    
    const map = new Map();
    chatFriends.forEach((friend) => {
      const id = friend._id || friend;
      if (typeof friend === 'object') {
        map.set(id.toString(), friend);
      } else {
        const resolvedFriend = rooms
          .flatMap((r) => r.members || [])
          .find((m) => m._id?.toString() === id.toString());
        if (resolvedFriend) {
          map.set(id.toString(), resolvedFriend);
        }
      }
    });
    return Array.from(map.values());
  }, [rooms, user?._id]);

  const handleCreateGroup = useCallback(async () => {
    if (!groupName.trim() || selectedMembers.length === 0) return;
    try {
      const res = await roomsAPI.createGroup(groupName.trim(), selectedMembers);
      const newRoom = res.data.room;
      setRooms((prev) => [newRoom, ...prev]);
      onSelectRoom(newRoom);
      setShowGroupModal(false);
    } catch (err) {
      console.error('Failed to create group:', err);
    }
  }, [groupName, selectedMembers, onSelectRoom]);

  // Lifted states/handlers are passed from parent Chat.jsx

  const processedRooms = rooms
    .filter((room) => {
      const deletedAt = deletedRooms[room._id];
      if (!deletedAt) return true;
      const lastMsgTime = room.lastMessage 
        ? new Date(room.lastMessage.createdAt).getTime() 
        : room.createdAt ? new Date(room.createdAt).getTime() : 0;
      return lastMsgTime > deletedAt;
    })
    .sort((a, b) => {
      const aPinned = pinnedRooms.includes(a._id);
      const bPinned = pinnedRooms.includes(b._id);
      
      if (aPinned && !bPinned) return -1;
      if (!aPinned && bPinned) return 1;
      
      const aTime = a.lastMessage 
        ? new Date(a.lastMessage.createdAt).getTime() 
        : a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.lastMessage 
        ? new Date(b.lastMessage.createdAt).getTime() 
        : b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bTime - aTime;
    });

  // Load conversations
  const loadRooms = useCallback(async () => {
    // 1. Immediately load from IndexedDB
    try {
      const localRooms = await getAllRooms();
      if (localRooms && localRooms.length > 0) {
        setRooms(localRooms);
      }
    } catch (err) {
      console.error('Failed to load local rooms:', err);
    } finally {
      if (!isOnline) {
        setLoadingRooms(false);
      }
    }

    // 2. Fetch fresh rooms from server if online
    if (isOnline) {
      roomsAPI
        .getAll()
        .then(async (res) => {
          const roomsList = res.data.rooms || [];
          
          // Save to IndexedDB
          await saveRooms(roomsList);
          
          setRooms(roomsList);
          if (selectedRoom) {
            const updatedSelected = roomsList.find((r) => r._id === selectedRoom._id);
            if (updatedSelected) {
              // Check if name or avatar has changed to avoid unnecessary updates
              if (updatedSelected.name !== selectedRoom.name || updatedSelected.avatar !== selectedRoom.avatar) {
                onSelectRoom(updatedSelected);
              }
            }
          }
        })
        .catch(() => {})
        .finally(() => setLoadingRooms(false));
    }
  }, [selectedRoom, onSelectRoom, isOnline]);

  useEffect(() => {
    loadRooms();
  }, [loadRooms]);

  // Listen for room updates to refresh sidebar
  useEffect(() => {
    on('room_updated', instanceId, () => loadRooms());
    on('new_message', instanceId, () => loadRooms());
    on('pending_messages', instanceId, () => loadRooms());
    return () => {
      off('room_updated', instanceId);
      off('new_message', instanceId);
      off('pending_messages', instanceId);
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
          <Avatar
            name={user?.name ?? 'App'}
            src={user?.avatar || ''}
            size={32}
            className="shrink-0"
          />
          <span className="text-base font-semibold text-on-surface font-google">Messages</span>

          {/* Header Menu Dropdown (Left side) */}
          <div className="relative leading-none">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setHeaderMenuOpen(!headerMenuOpen);
              }}
              className="p-1 rounded-full hover:bg-hover-bg text-subtle-text hover:text-on-surface transition-all duration-150"
              title="Menu"
              aria-label="Menu"
            >
              <MoreVertical size={16} />
            </button>

            {headerMenuOpen && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="absolute left-0 mt-1 py-1 w-32 bg-surface border border-border-color 
                           rounded-card shadow-google-md z-50 text-xs text-on-surface animate-pop-in"
              >
                <button
                  onClick={() => {
                    setHeaderMenuOpen(false);
                    setShowGroupModal(true);
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-hover-bg text-on-surface 
                             flex items-center gap-2 transition-colors duration-150"
                >
                  <span>👥</span> New Group
                </button>
                <button
                  onClick={() => {
                    setHeaderMenuOpen(false);
                    logout();
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-hover-bg text-error 
                             flex items-center gap-2 transition-colors duration-150 border-t border-border-color"
                >
                  <LogOut size={13} />
                  <span>Sign out</span>
                </button>
              </div>
            )}
          </div>

          {/* Connection indicator */}
          <div className="ml-auto">
            <SyncStatusIcon />
          </div>
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
            {!loadingRooms && processedRooms.length === 0 && (
              <div className="flex flex-col items-center mt-12 gap-3 text-center px-4">
                <Plus size={32} className="text-border-color" />
                <p className="text-xs text-subtle-text">
                  Search for someone above to start chatting
                </p>
              </div>
            )}
            {processedRooms.map((room) => {
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
                  onPin={onPinRoom}
                  onDelete={onDeleteRoom}
                  isPinned={pinnedRooms.includes(room._id)}
                  isMuted={mutedRooms.includes(room._id)}
                />
              );
            })}
          </>
        )}
      </div>

      {/* Create Group Modal */}
      {showGroupModal && (
        <div
          className="fixed inset-0 z-[1000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setShowGroupModal(false)}
        >
          <div
            className="bg-surface border border-border-color rounded-xl shadow-google-lg w-full max-w-sm overflow-hidden animate-pop-in text-on-surface"
            onClick={(e) => e.stopPropagation()}
            style={{ display: 'flex', flexDirection: 'column', maxHeight: '80vh' }}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border-color">
              <h3 className="text-sm font-semibold font-google">Create New Group</h3>
              <button
                onClick={() => setShowGroupModal(false)}
                className="p-1 rounded-full hover:bg-hover-bg text-subtle-text"
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-4 flex-1 overflow-y-auto" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label className="text-xs font-semibold text-subtle-text block mb-1">Group Name</label>
                <input
                  type="text"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  placeholder="Enter group name…"
                  className="input-field py-2"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-subtle-text block mb-1.5">Select Members</label>
                {uniqueFriends.length === 0 ? (
                  <p className="text-xs text-subtle-text text-center py-4">No chat listed friends found.</p>
                ) : (
                  <div className="flex flex-col gap-2 max-h-48 overflow-y-auto pr-1">
                    {uniqueFriends.map((friend) => {
                      const isSelected = selectedMembers.includes(friend._id);
                      return (
                        <label
                          key={friend._id}
                          className="flex items-center gap-3 p-2 rounded-lg hover:bg-hover-bg cursor-pointer transition-colors"
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {
                              setSelectedMembers((prev) =>
                                isSelected ? prev.filter((id) => id !== friend._id) : [...prev, friend._id]
                              );
                            }}
                            className="rounded border-border-color text-primary focus:ring-primary/20 w-4 h-4"
                          />
                          <Avatar name={friend.name} src={friend.avatar || ''} size={28} />
                          <span className="text-xs font-medium truncate">{friend.name}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-4 py-3 bg-background border-t border-border-color flex justify-end gap-2">
              <button
                onClick={() => setShowGroupModal(false)}
                className="btn-ghost py-1.5 px-4 text-xs"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateGroup}
                disabled={!groupName.trim() || selectedMembers.length === 0}
                className="btn-primary py-1.5 px-4 text-xs font-medium"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

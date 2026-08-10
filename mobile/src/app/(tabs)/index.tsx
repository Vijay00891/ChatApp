import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, TextInput, Keyboard, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { roomsAPI, usersAPI } from '../../lib/api';
import { useRouter } from 'expo-router';
import Avatar from '../../components/Avatar';

const formatRelativeTime = (dateStr) => {
  if (!dateStr) return '';
  const now = Date.now();
  const d = new Date(dateStr).getTime();
  const diff = now - d;
  if (diff < 60000) return 'now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
  return new Date(dateStr).toLocaleDateString([], { month: 'short', day: 'numeric' });
};

export default function HomeScreen() {
  const { user, logout } = useAuth();
  const { isUserOnline } = useSocket();
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const router = useRouter();

  const fetchRooms = useCallback(async () => {
    try {
      const cached = await AsyncStorage.getItem('CACHE_ROOMS');
      if (cached) {
        setRooms(JSON.parse(cached));
        setLoading(false);
      }
      
      const { data } = await roomsAPI.getAll();
      const fetchedRooms = data.rooms || data || [];
      setRooms(fetchedRooms);
      AsyncStorage.setItem('CACHE_ROOMS', JSON.stringify(fetchedRooms));
    } catch (err) {
      console.warn('Failed to fetch rooms', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRooms();
  }, [fetchRooms]);

  // Handle Search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    const delayDebounceFn = setTimeout(async () => {
      setSearching(true);
      try {
        const { data } = await usersAPI.search(searchQuery);
        setSearchResults(data);
      } catch (err) {
        console.warn('Search failed', err);
      } finally {
        setSearching(false);
      }
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery]);

  const handleStartChat = async (targetUserId) => {
    try {
      Keyboard.dismiss();
      const { data } = await roomsAPI.createDM(targetUserId);
      const room = data.room || data;
      setSearchQuery('');
      setSearchResults([]);
      router.push(`/chat/${room._id}`);
    } catch (err) {
      console.warn('Failed to start chat', err);
    }
  };

  const getPeer = (room) => {
    if (room.type === 'group') return null;
    return room.members?.find(m => (m._id ?? m) !== user?._id);
  };

  const getRoomName = (room, peer) => {
    if (room.type === 'group') return room.name || 'Group Chat';
    return peer?.name || 'Unknown';
  };

  const getAvatarColor = (name) => {
    // Kept for backward compatibility if needed, but Avatar component handles it
    const colors = ['#1A73E8', '#EA4335', '#34A853', '#FBBC04', '#8E24AA', '#E91E63', '#00ACC1', '#FF7043'];
    let hash = 0;
    for (let i = 0; i < (name || '').length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  };

  const renderRoomItem = ({ item }) => {
    const peer = getPeer(item);
    const roomName = getRoomName(item, peer);
    const isOnline = peer ? isUserOnline(peer._id) : false;
    const unread = item.unread || 0;
    const lastMsg = item.lastMessage;
    const avatarColor = peer?.avatarColor || getAvatarColor(roomName);

    const handleLongPress = () => {
      Alert.alert(
        'Chat Options',
        `Manage chat with ${roomName}`,
        [
          { text: 'Pin Chat', onPress: () => console.log('Pinned') },
          { text: 'Mute Notifications', onPress: async () => {
             try { await roomsAPI.mute(item._id); Alert.alert('Success', 'Chat muted'); } catch(e){}
          }},
          { text: 'Archive', onPress: async () => {
             try { await roomsAPI.archive(item._id); fetchRooms(); } catch(e){}
          }},
          { text: 'Cancel', style: 'cancel' }
        ]
      );
    };

    return (
      <TouchableOpacity 
        style={styles.roomItem}
        onPress={() => router.push(`/chat/${item._id}`)}
        onLongPress={handleLongPress}
        activeOpacity={0.7}
      >
        <View style={styles.avatarContainer}>
          <Avatar url={item.type === 'group' ? item.avatar : peer?.avatar} name={roomName} color={avatarColor} size={48} />
          {isOnline && <View style={styles.onlineDot} />}
        </View>
        <View style={styles.roomInfo}>
          <View style={styles.roomTopRow}>
            <Text style={styles.roomName} numberOfLines={1}>{roomName}</Text>
            {lastMsg && (
              <Text style={styles.timeText}>{formatRelativeTime(lastMsg.createdAt)}</Text>
            )}
          </View>
          <View style={styles.roomBottomRow}>
            <Text style={styles.lastMessage} numberOfLines={1}>
              {lastMsg
                ? (lastMsg.type === 'image' ? '📷 Photo' : lastMsg.content)
                : 'No messages yet'}
            </Text>
            {unread > 0 && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadText}>{unread > 9 ? '9+' : unread}</Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderSearchItem = ({ item }) => {
    const isOnline = isUserOnline(item._id);
    const avatarColor = item.avatarColor || getAvatarColor(item.name);
    return (
      <TouchableOpacity 
        style={styles.roomItem}
        onPress={() => handleStartChat(item._id)}
        activeOpacity={0.7}
      >
        <View style={styles.avatarContainer}>
          <Avatar url={item.avatar} name={item.name} color={avatarColor} size={48} />
          {isOnline && <View style={styles.onlineDot} />}
        </View>
        <View style={styles.roomInfo}>
          <Text style={styles.roomName}>{item.name}</Text>
          <Text style={styles.lastMessage} numberOfLines={1}>{item.email}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Chats</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity onPress={() => router.push('/new-group')} style={styles.newGroupButton}>
            <Text style={styles.newGroupText}>+ Group</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={logout} style={styles.logoutButton}>
            <Text style={styles.logoutText}>Logout</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search users to start a chat..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      {searchQuery.trim() ? (
        // Search Results View
        <View style={styles.listContainer}>
          <Text style={styles.sectionTitle}>Search Results</Text>
          {searching ? (
            <ActivityIndicator style={{ marginTop: 20 }} />
          ) : (
            <FlatList
              data={searchResults}
              keyExtractor={(item) => item._id}
              renderItem={renderSearchItem}
              contentContainerStyle={{ padding: 15 }}
              ListEmptyComponent={<Text style={styles.emptyText}>No users found.</Text>}
            />
          )}
        </View>
      ) : (
        // Standard Rooms List View
        <View style={styles.listContainer}>
          {loading ? (
            <ActivityIndicator style={{ marginTop: 20 }} size="large" />
          ) : (
            <FlatList
              data={rooms}
              keyExtractor={(item) => item._id}
              renderItem={renderRoomItem}
              contentContainerStyle={{ padding: 15 }}
              ListEmptyComponent={<Text style={styles.emptyText}>No chats found.</Text>}
            />
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  header: {
    paddingTop: 60,
    paddingBottom: 12,
    paddingHorizontal: 20,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  headerTitle: { fontSize: 22, fontWeight: '700', color: '#202124' },
  newGroupButton: { paddingHorizontal: 12, paddingVertical: 6, marginRight: 8, backgroundColor: '#E8F0FE', borderRadius: 20 },
  newGroupText: { color: '#1A73E8', fontWeight: '600', fontSize: 13 },
  logoutButton: { paddingHorizontal: 12, paddingVertical: 6 },
  logoutText: { color: '#EA4335', fontWeight: '600', fontSize: 13 },
  searchContainer: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
  },
  searchInput: {
    backgroundColor: '#F1F3F4',
    height: 42,
    borderRadius: 21,
    paddingHorizontal: 18,
    fontSize: 15,
    color: '#202124',
  },
  listContainer: { flex: 1 },
  sectionTitle: {
    paddingHorizontal: 20,
    paddingTop: 15,
    paddingBottom: 8,
    fontSize: 12,
    fontWeight: '700',
    color: '#5F6368',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  roomItem: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 0.5,
    borderBottomColor: '#E0E0E0',
  },
  avatarContainer: {
    position: 'relative',
    marginRight: 14,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#1A73E8',
    justifyContent: 'center',
    alignItems: 'center',
  },
  onlineDot: {
    position: 'absolute',
    bottom: 1,
    right: 1,
    width: 13,
    height: 13,
    borderRadius: 7,
    backgroundColor: '#34A853',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  avatarText: { color: '#FFFFFF', fontSize: 17, fontWeight: '600' },
  roomInfo: { flex: 1, minWidth: 0 },
  roomTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3 },
  roomBottomRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  roomName: { fontSize: 15, fontWeight: '600', color: '#202124', flex: 1, marginRight: 8 },
  timeText: { fontSize: 11, color: '#5F6368' },
  lastMessage: { color: '#5F6368', fontSize: 13, flex: 1, marginRight: 8 },
  unreadBadge: {
    backgroundColor: '#1A73E8',
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 5,
  },
  unreadText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
  emptyText: { textAlign: 'center', marginTop: 50, color: '#5F6368', fontSize: 15 }
});

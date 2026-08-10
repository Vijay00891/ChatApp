import React, { useEffect, useState, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform, Modal, Pressable } from 'react-native';
import { Image } from 'expo-image';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { Audio } from 'expo-av';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { messagesAPI, roomsAPI } from '../../lib/api';
import { useWebRTCContext } from '../../components/WebRTCWrapper';
import Avatar from '../../components/Avatar';

const EMOJI_LIST = ['😀','😂','😍','🥺','😎','🤔','👍','❤️','🎉','🔥','✨','😢','🙏','😅','🤣','💯'];

function formatTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDateDivider(dateStr) {
  const d = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
}

function getAvatarColor(name) {
  // Keeping for backward compatibility but Avatar component is primary
  const colors = ['#1A73E8', '#EA4335', '#34A853', '#FBBC04', '#8E24AA', '#E91E63', '#00ACC1', '#FF7043'];
  let hash = 0;
  for (let i = 0; i < (name || '').length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

function groupMessagesWithDates(messages) {
  const result = [];
  let lastDate = null;
  messages.forEach((msg) => {
    const d = msg.createdAt ? new Date(msg.createdAt).toDateString() : null;
    if (d && d !== lastDate) {
      result.push({ _id: `date-${d}`, type: 'date_divider', date: msg.createdAt });
      lastDate = d;
    }
    result.push(msg);
  });
  return result;
}

const AudioMessage = React.memo(({ url, isMe }) => {
  const [sound, setSound] = useState();
  const [isPlaying, setIsPlaying] = useState(false);
  const [localUri, setLocalUri] = useState(null);

  useEffect(() => {
    let isMounted = true;
    const downloadAndCache = async () => {
      if (!url) return;
      try {
        const filename = url.substring(url.lastIndexOf('/') + 1);
        const fileUri = `${FileSystem.documentDirectory}${filename}`;
        const fileInfo = await FileSystem.getInfoAsync(fileUri);
        
        if (fileInfo.exists) {
          if (isMounted) setLocalUri(fileUri);
        } else {
          const downloadResult = await FileSystem.downloadAsync(url, fileUri);
          if (isMounted) setLocalUri(downloadResult.uri);
        }
      } catch (err) {
        console.warn('Audio cache error', err);
      }
    };
    downloadAndCache();

    return () => { isMounted = false; };
  }, [url]);

  const togglePlayback = async () => {
    try {
      if (sound) {
        if (isPlaying) {
          await sound.pauseAsync();
          setIsPlaying(false);
        } else {
          await sound.playAsync();
          setIsPlaying(true);
        }
      } else {
        const uriToPlay = localUri || url;
        const { sound: newSound } = await Audio.Sound.createAsync(
          { uri: uriToPlay },
          { shouldPlay: true }
        );
        newSound.setOnPlaybackStatusUpdate((status) => {
          if (status.didJustFinish) setIsPlaying(false);
        });
        setSound(newSound);
        setIsPlaying(true);
      }
    } catch (err) {
      console.warn('Playback error', err);
    }
  };

  useEffect(() => {
    return sound ? () => { sound.unloadAsync(); } : undefined;
  }, [sound]);

  return (
    <View style={[styles.audioContainer, isMe ? styles.myAudio : styles.theirAudio]}>
      <TouchableOpacity onPress={togglePlayback} style={styles.playButton}>
        <Text style={styles.playIcon}>{isPlaying ? '⏸' : '▶️'}</Text>
      </TouchableOpacity>
      <View style={styles.audioWaveform}>
        <View style={styles.waveformLine} />
      </View>
    </View>
  );
});

const MessageItem = React.memo(({ item, user, room, messages, setSelectedMessage, handleReact }) => {
  if (item.type === 'date_divider') {
    return (
      <View style={styles.dateDivider}>
        <View style={styles.dateLine} />
        <Text style={styles.dateText}>{formatDateDivider(item.date)}</Text>
        <View style={styles.dateLine} />
      </View>
    );
  }

  const isMe = user ? (item.senderId === user._id || item.senderId?._id === user._id) : false;
  const senderName = typeof item.senderId === 'object' ? item.senderId?.name : null;
  const showSender = !isMe && room?.type === 'group' && senderName;
  const senderColor = getAvatarColor(senderName || '');
  const reactions = item.reactions || {};
  const reactionEntries = Object.entries(reactions);

  const repliedMsg = item.replyTo
    ? messages.find(m => m._id === (typeof item.replyTo === 'object' ? item.replyTo._id : item.replyTo))
    : null;

  return (
    <Pressable
      onLongPress={() => setSelectedMessage(item)}
      style={[styles.messageRow, isMe ? styles.messageRowRight : styles.messageRowLeft]}
    >
      <View style={[styles.messageBubble, isMe ? styles.myMessage : styles.theirMessage]}>
        {showSender && (
          <Text style={[styles.senderName, { color: senderColor }]}>{senderName}</Text>
        )}

        {repliedMsg && (
          <View style={styles.replyPreview}>
            <Text style={styles.replyPreviewName}>
              {typeof repliedMsg.senderId === 'object' ? repliedMsg.senderId?.name : 'User'}
            </Text>
            <Text style={styles.replyPreviewText} numberOfLines={1}>
              {repliedMsg.type === 'image' ? '📷 Photo' : repliedMsg.content}
            </Text>
          </View>
        )}

        {item.type === 'image' ? (
          <Image source={{ uri: item.content }} style={styles.messageImage} contentFit="cover" transition={200} />
        ) : item.type === 'audio' ? (
          <AudioMessage url={item.content} isMe={isMe} />
        ) : (
          <Text style={[styles.messageText, isMe ? styles.myMessageText : styles.theirMessageText]}>
            {item.content}
          </Text>
        )}

        <View style={styles.metaRow}>
          <Text style={[styles.timeStamp, isMe ? styles.myTimeStamp : styles.theirTimeStamp]}>
            {formatTime(item.createdAt)}
          </Text>
          {isMe && (
            <Text style={styles.readReceipt}>
              {item.readBy?.length > 1 ? '✓✓' : '✓'}
            </Text>
          )}
        </View>

        {reactionEntries.length > 0 && (
          <View style={styles.reactionsContainer}>
            {reactionEntries.map(([emoji, users]) => (
              <TouchableOpacity
                key={emoji}
                style={styles.reactionBadge}
                onPress={() => handleReact(emoji)}
              >
                <Text style={styles.reactionText}>{emoji} {users.length}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    </Pressable>
  );
});

export default function ChatScreen() {
  const { id } = useLocalSearchParams();
  const { user } = useAuth();
  const { socket, on, off, emit, isUserOnline } = useSocket();
  const webrtc = useWebRTCContext();
  const startCall = webrtc?.startCall;
  const router = useRouter();

  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [room, setRoom] = useState(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null);
  const [selectedMessage, setSelectedMessage] = useState(null);

  // Typing state
  const [typingUsers, setTypingUsers] = useState(new Set());
  const typingTimeoutRef = useRef(null);

  // Image Upload State
  const [uploading, setUploading] = useState(false);

  const flatListRef = useRef(null);

  // Derived room info
  const peer = room?.type === 'dm'
    ? room.members?.find(m => (m._id ?? m) !== user?._id)
    : null;
  const roomName = room?.name || (room?.type === 'group' ? 'Group Chat' : peer?.name ?? 'Chat');
  const peerOnline = peer ? isUserOnline(peer._id) : false;

  useEffect(() => {
    const fetchRoomAndMessages = async () => {
      try {
        const cacheKey = `CACHE_MESSAGES_${id}`;
        const cachedMsg = await AsyncStorage.getItem(cacheKey);
        if (cachedMsg) {
          setMessages(JSON.parse(cachedMsg));
          setLoading(false);
        }

        const roomRes = await roomsAPI.getAll();
        const rooms = roomRes.data.rooms || roomRes.data || [];
        const currentRoom = rooms.find(r => r._id === id);
        setRoom(currentRoom);

        const msgRes = await messagesAPI.getByRoom(id, 1);
        const fetchedMessages = msgRes.data.messages || [];
        setMessages(fetchedMessages);
        AsyncStorage.setItem(cacheKey, JSON.stringify(fetchedMessages));
      } catch (err) {
        console.warn('Failed to load messages or room', err);
      } finally {
        setLoading(false);
      }
    };

    fetchRoomAndMessages();

    const handleNewMessage = (msg) => {
      if (msg.roomId === id) {
        setMessages((prev) => [...prev, msg]);
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
      }
    };

    const handleTypingStart = ({ roomId, userId, name }) => {
      if (roomId === id && userId !== user._id) {
        setTypingUsers(prev => {
          const newSet = new Set(prev);
          newSet.add(name || 'Someone');
          return newSet;
        });
      }
    };

    const handleTypingStop = ({ roomId, userId, name }) => {
      if (roomId === id && userId !== user._id) {
        setTypingUsers(prev => {
          const newSet = new Set(prev);
          newSet.delete(name || 'Someone');
          return newSet;
        });
      }
    };

    const handleReaction = ({ messageId, emoji, userId: reactUserId }) => {
      setMessages(prev => prev.map(msg => {
        if (msg._id !== messageId) return msg;
        const reactions = { ...(msg.reactions || {}) };
        if (!reactions[emoji]) reactions[emoji] = [];
        if (reactions[emoji].includes(reactUserId)) {
          reactions[emoji] = reactions[emoji].filter(id => id !== reactUserId);
          if (reactions[emoji].length === 0) delete reactions[emoji];
        } else {
          reactions[emoji] = [...reactions[emoji], reactUserId];
        }
        return { ...msg, reactions };
      }));
    };

    on('new_message', 'chat_screen', handleNewMessage);
    on('typing_start', 'chat_screen', handleTypingStart);
    on('typing_stop', 'chat_screen', handleTypingStop);
    on('message_reaction', 'chat_screen', handleReaction);

    emit('join_room', id);

    return () => {
      off('new_message', 'chat_screen');
      off('typing_start', 'chat_screen');
      off('typing_stop', 'chat_screen');
      off('message_reaction', 'chat_screen');
      emit('leave_room', id);
    };
  }, [id, emit, on, off, user._id]);

  const handleTextChange = (val) => {
    setText(val);
    emit('typing_start', { roomId: id, name: user.name });
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      emit('typing_stop', { roomId: id, name: user.name });
    }, 2000);
  };

  const uploadToCloudinary = async (imageUri) => {
    const cloudName = 'dpidbjefm';
    const uploadPreset = 'chatapp_preset';
    const data = new FormData();
    data.append('file', { uri: imageUri, type: 'image/jpeg', name: 'upload.jpg' });
    data.append('upload_preset', uploadPreset);
    const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
      method: 'POST', body: data, headers: { 'Accept': 'application/json' }
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error?.message || 'Upload failed');
    return result.secure_url;
  };

  const handlePickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.All,
        allowsEditing: true, quality: 0.7,
      });
      if (!result.canceled && result.assets?.length > 0) {
        setUploading(true);
        const asset = result.assets[0];
        if (asset.type === 'video' || asset.uri.endsWith('.mp4')) {
           // For video, we should use backend upload
           const file = { uri: asset.uri, type: 'video/mp4', name: 'video.mp4' };
           const res = await messagesAPI.uploadAttachment(file);
           emit('send_message', { roomId: id, content: res.data.url, type: 'video' });
        } else {
           const imageUrl = await uploadToCloudinary(asset.uri);
           emit('send_message', { roomId: id, content: imageUrl, type: 'image' });
        }
      }
    } catch (err) {
      console.warn('Failed to pick or upload image', err);
      alert('Image/Video upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleSend = () => {
    if (!text.trim()) return;
    const msg = {
      roomId: id,
      content: text,
      type: 'text',
    };
    if (replyingTo) {
      msg.replyTo = replyingTo._id;
    }
    emit('send_message', msg);
    setText('');
    setReplyingTo(null);
    setShowEmoji(false);
    emit('typing_stop', { roomId: id, name: user.name });
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
  };

  const handleReact = (emoji) => {
    if (!selectedMessage) return;
    emit('message_reaction', {
      messageId: selectedMessage._id,
      emoji,
      userId: user._id,
      roomId: id
    });
    setSelectedMessage(null);
  };

  const handleCall = (type) => {
    if (!room || !startCall) return;
    if (room.type === 'group') { alert('Calls are not supported in group chats yet.'); return; }
    if (peer) startCall(peer, type);
  };

  const renderItem = useCallback(({ item }) => (
    <MessageItem
      item={item}
      user={user}
      room={room}
      messages={messages}
      setSelectedMessage={setSelectedMessage}
      handleReact={handleReact}
    />
  ), [user, room, messages, handleReact]);

  const processedMessages = groupMessagesWithDates(messages);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')} style={styles.backButton}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <View style={styles.headerAvatarContainer}>
            <Avatar url={room?.type === 'group' ? room?.avatar : peer?.avatar} name={roomName} color={peer?.avatarColor} size={36} />
          </View>
          <View>
            <Text style={styles.headerTitle} numberOfLines={1}>{roomName}</Text>
            {typingUsers.size > 0 ? (
              <Text style={styles.typingText}>{Array.from(typingUsers).join(', ')} typing...</Text>
            ) : peerOnline ? (
              <Text style={styles.onlineText}>Online</Text>
            ) : null}
          </View>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={() => handleCall('audio')} style={styles.headerIconBtn}>
            <Text style={{ fontSize: 18 }}>📞</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => handleCall('video')} style={styles.headerIconBtn}>
            <Text style={{ fontSize: 18 }}>📹</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Messages */}
      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <ActivityIndicator size="large" color="#1A73E8" />
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={processedMessages}
          keyExtractor={(item) => item._id}
          renderItem={renderItem}
          contentContainerStyle={styles.messagesList}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
        />
      )}

      {/* Reply Preview */}
      {replyingTo && (
        <View style={styles.replyBar}>
          <View style={styles.replyBarContent}>
            <Text style={styles.replyBarLabel}>Replying to {typeof replyingTo.senderId === 'object' ? replyingTo.senderId?.name : 'message'}</Text>
            <Text style={styles.replyBarText} numberOfLines={1}>{replyingTo.type === 'image' ? '📷 Photo' : replyingTo.content}</Text>
          </View>
          <TouchableOpacity onPress={() => setReplyingTo(null)}>
            <Text style={styles.replyBarClose}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Emoji Picker */}
      {showEmoji && (
        <View style={styles.emojiPicker}>
          {EMOJI_LIST.map(emoji => (
            <TouchableOpacity key={emoji} onPress={() => { setText(prev => prev + emoji); setShowEmoji(false); }} style={styles.emojiBtn}>
              <Text style={styles.emojiBtnText}>{emoji}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Input Bar */}
      <View style={styles.inputContainer}>
        <TouchableOpacity style={styles.inputIconBtn} onPress={() => setShowEmoji(!showEmoji)}>
          <Text style={{ fontSize: 22 }}>😊</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.inputIconBtn} onPress={handlePickImage} disabled={uploading}>
          {uploading ? <ActivityIndicator size="small" color="#1A73E8" /> : <Text style={{ fontSize: 22 }}>📎</Text>}
        </TouchableOpacity>
        <TextInput
          style={styles.input}
          placeholder="Type a message..."
          placeholderTextColor="#5F6368"
          value={text}
          onChangeText={handleTextChange}
          onSubmitEditing={handleSend}
          multiline
        />
        <TouchableOpacity style={styles.sendButton} onPress={handleSend} disabled={!text.trim()}>
          <Text style={styles.sendIcon}>➤</Text>
        </TouchableOpacity>
      </View>

      {/* Message Long-Press Menu (Reaction + Reply) */}
      <Modal visible={!!selectedMessage} transparent animationType="fade" onRequestClose={() => setSelectedMessage(null)}>
        <Pressable style={styles.modalOverlay} onPress={() => setSelectedMessage(null)}>
          <View style={styles.messageActionMenu}>
            <View style={styles.quickReactions}>
              {['👍','❤️','😂','😮','😢','🔥'].map(emoji => (
                <TouchableOpacity key={emoji} onPress={() => handleReact(emoji)} style={styles.quickReactionBtn}>
                  <Text style={{ fontSize: 24 }}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={styles.menuAction} onPress={() => { setReplyingTo(selectedMessage); setSelectedMessage(null); }}>
              <Text style={styles.menuActionText}>↩ Reply</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 50,
    paddingBottom: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    paddingHorizontal: 12,
  },
  backButton: { padding: 8, marginRight: 4 },
  backText: { fontSize: 22, color: '#1A73E8' },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  headerAvatarContainer: { marginRight: 10 },
  headerTitle: { fontSize: 16, fontWeight: '600', color: '#202124' },
  typingText: { fontSize: 12, color: '#1A73E8', fontStyle: 'italic' },
  onlineText: { fontSize: 12, color: '#34A853' },
  headerActions: { flexDirection: 'row', alignItems: 'center' },
  headerIconBtn: { padding: 8, marginLeft: 4 },

  // Messages
  messagesList: { paddingHorizontal: 12, paddingVertical: 8 },
  messageRow: { marginBottom: 4 },
  messageRowRight: { alignItems: 'flex-end' },
  messageRowLeft: { alignItems: 'flex-start' },
  messageBubble: {
    maxWidth: '78%',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
  },
  myMessage: {
    backgroundColor: '#E8F0FE',
    borderBottomRightRadius: 4,
  },
  theirMessage: {
    backgroundColor: '#FFFFFF',
    borderBottomLeftRadius: 4,
    borderWidth: 0.5,
    borderColor: '#E0E0E0',
  },
  senderName: { fontSize: 12, fontWeight: '700', marginBottom: 2 },
  messageText: { fontSize: 15, lineHeight: 20 },
  myMessageText: { color: '#202124' },
  theirMessageText: { color: '#202124' },
  messageImage: { width: 200, height: 200, borderRadius: 12, marginVertical: 4 },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 3, gap: 4 },
  timeStamp: { fontSize: 10 },
  myTimeStamp: { color: '#5F6368' },
  theirTimeStamp: { color: '#5F6368' },
  readReceipt: { fontSize: 12, color: '#1A73E8', marginLeft: 2 },

  // Audio Player
  audioContainer: { flexDirection: 'row', alignItems: 'center', width: 160, paddingVertical: 4 },
  myAudio: {},
  theirAudio: {},
  playButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#1A73E8', justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  playIcon: { color: '#FFF', fontSize: 16, marginLeft: 2 },
  audioWaveform: { flex: 1, height: 2, backgroundColor: '#A8C7FA', justifyContent: 'center' },
  waveformLine: { width: '50%', height: 2, backgroundColor: '#1A73E8' },

  // Date dividers
  dateDivider: { flexDirection: 'row', alignItems: 'center', marginVertical: 12, paddingHorizontal: 10 },
  dateLine: { flex: 1, height: 0.5, backgroundColor: '#E0E0E0' },
  dateText: { marginHorizontal: 12, fontSize: 11, color: '#5F6368', fontWeight: '500' },

  // Reactions
  reactionsContainer: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 4, gap: 4 },
  reactionBadge: { backgroundColor: '#F1F3F4', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10 },
  reactionText: { fontSize: 12 },

  // Reply preview in bubble
  replyPreview: {
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderLeftWidth: 3,
    borderLeftColor: '#1A73E8',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginBottom: 4,
  },
  replyPreviewName: { fontSize: 11, fontWeight: '700', color: '#1A73E8' },
  replyPreviewText: { fontSize: 12, color: '#5F6368' },

  // Reply bar above input
  replyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F0FE',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 0.5,
    borderTopColor: '#E0E0E0',
  },
  replyBarContent: { flex: 1 },
  replyBarLabel: { fontSize: 12, fontWeight: '700', color: '#1A73E8' },
  replyBarText: { fontSize: 13, color: '#5F6368' },
  replyBarClose: { fontSize: 18, color: '#5F6368', paddingLeft: 12 },

  // Emoji picker
  emojiPicker: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 0.5,
    borderTopColor: '#E0E0E0',
    gap: 4,
  },
  emojiBtn: { padding: 6 },
  emojiBtnText: { fontSize: 22 },

  // Input Bar
  inputContainer: {
    flexDirection: 'row',
    padding: 10,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 0.5,
    borderTopColor: '#E0E0E0',
    alignItems: 'flex-end',
  },
  inputIconBtn: { padding: 8, justifyContent: 'center' },
  input: {
    flex: 1,
    backgroundColor: '#F1F3F4',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    maxHeight: 100,
    color: '#202124',
  },
  sendButton: {
    marginLeft: 8,
    backgroundColor: '#1A73E8',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendIcon: { color: '#FFFFFF', fontSize: 18 },

  // Long-press modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  messageActionMenu: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    width: '80%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  quickReactions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: '#E0E0E0',
  },
  quickReactionBtn: { padding: 6 },
  menuAction: { paddingVertical: 12 },
  menuActionText: { fontSize: 16, color: '#202124' },
});

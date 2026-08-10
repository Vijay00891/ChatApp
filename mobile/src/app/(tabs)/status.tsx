import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Modal, TextInput, Alert, SafeAreaView } from 'react-native';
import { Image } from 'expo-image';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../../context/AuthContext';
import { statusAPI } from '../../lib/api';
import Avatar from '../../components/Avatar';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';

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

export default function StatusScreen() {
  const { user } = useAuth();
  const [statuses, setStatuses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Viewing status
  const [viewingStatus, setViewingStatus] = useState(null);

  // Creating status
  const [isCreating, setIsCreating] = useState(false);
  const [newStatusText, setNewStatusText] = useState('');
  const [newStatusImage, setNewStatusImage] = useState(null);
  const [uploading, setUploading] = useState(false);

  const fetchStatuses = useCallback(async () => {
    try {
      const cached = await AsyncStorage.getItem('CACHE_STATUSES');
      if (cached) {
        setStatuses(JSON.parse(cached));
        setLoading(false);
      }

      const { data } = await statusAPI.getAll();
      setStatuses(data || []);
      AsyncStorage.setItem('CACHE_STATUSES', JSON.stringify(data || []));
    } catch (err) {
      console.warn('Failed to fetch statuses', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchStatuses();
  }, [fetchStatuses]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchStatuses();
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.7,
      base64: true,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      setNewStatusImage(`data:image/jpeg;base64,${result.assets[0].base64}`);
    }
  };

  const handlePostStatus = async () => {
    if (!newStatusText.trim() && !newStatusImage) {
      Alert.alert('Empty Status', 'Please add text or an image.');
      return;
    }

    setUploading(true);
    try {
      await statusAPI.create({
        content: newStatusText.trim(),
        mediaUrl: newStatusImage, // Send base64, backend should handle it if it supports base64
        type: newStatusImage ? 'image' : 'text',
      });
      setIsCreating(false);
      setNewStatusText('');
      setNewStatusImage(null);
      fetchStatuses();
    } catch (err) {
      Alert.alert('Error', 'Failed to post status.');
      console.warn(err);
    } finally {
      setUploading(false);
    }
  };

  const renderStatusItem = useCallback(({ item }) => {
    // Assuming backend returns grouped statuses or individual ones
    const creator = item.user;
    if (!creator) return null;
    
    return (
      <TouchableOpacity 
        style={styles.statusItem}
        onPress={() => {
          setViewingStatus(item);
          statusAPI.view(item._id).catch(() => {}); // Mark as viewed
        }}
      >
        <View style={styles.avatarBorder}>
          <Avatar url={creator.avatar} name={creator.name} size={52} />
        </View>
        <View style={styles.statusInfo}>
          <Text style={styles.statusName}>{creator.name}</Text>
          <Text style={styles.statusTime}>{formatRelativeTime(item.createdAt)}</Text>
        </View>
      </TouchableOpacity>
    );
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Status</Text>
      </View>

      <TouchableOpacity style={styles.myStatusContainer} onPress={() => setIsCreating(true)}>
        <View style={styles.avatarContainer}>
          <Avatar url={user?.avatar} name={user?.name} size={52} />
          <View style={styles.addIcon}>
            <Ionicons name="add" size={16} color="#FFF" />
          </View>
        </View>
        <View style={styles.statusInfo}>
          <Text style={styles.myStatusTitle}>My Status</Text>
          <Text style={styles.statusTime}>Tap to add status update</Text>
        </View>
      </TouchableOpacity>

      <View style={styles.recentUpdates}>
        <Text style={styles.sectionTitle}>Recent Updates</Text>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 20 }} size="large" />
      ) : (
        <FlatList
          data={statuses}
          keyExtractor={(item) => item._id}
          renderItem={renderStatusItem}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          contentContainerStyle={{ paddingBottom: 20 }}
          ListEmptyComponent={<Text style={styles.emptyText}>No recent updates.</Text>}
        />
      )}

      {/* Viewer Modal */}
      {viewingStatus && (
        <Modal visible transparent animationType="fade">
          <View style={styles.viewerContainer}>
            <SafeAreaView style={{ flex: 1 }}>
              <View style={styles.viewerHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Avatar url={viewingStatus.user?.avatar} name={viewingStatus.user?.name} size={40} />
                  <View style={{ marginLeft: 10 }}>
                    <Text style={styles.viewerName}>{viewingStatus.user?.name}</Text>
                    <Text style={styles.viewerTime}>{formatRelativeTime(viewingStatus.createdAt)}</Text>
                  </View>
                </View>
                <TouchableOpacity onPress={() => setViewingStatus(null)}>
                  <Ionicons name="close" size={28} color="#FFF" />
                </TouchableOpacity>
              </View>

              <View style={styles.viewerContent}>
                {viewingStatus.type === 'image' && viewingStatus.mediaUrl ? (
                  <Image source={{ uri: viewingStatus.mediaUrl }} style={styles.viewerImage} contentFit="contain" transition={200} />
                ) : (
                  <Text style={styles.viewerText}>{viewingStatus.content}</Text>
                )}
                {viewingStatus.type === 'image' && viewingStatus.content && (
                  <Text style={styles.viewerCaption}>{viewingStatus.content}</Text>
                )}
              </View>
            </SafeAreaView>
          </View>
        </Modal>
      )}

      {/* Create Modal */}
      {isCreating && (
        <Modal visible animationType="slide">
          <SafeAreaView style={styles.createContainer}>
            <View style={styles.createHeader}>
              <TouchableOpacity onPress={() => { setIsCreating(false); setNewStatusImage(null); setNewStatusText(''); }}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.createTitle}>New Status</Text>
              <TouchableOpacity onPress={handlePostStatus} disabled={uploading}>
                <Text style={[styles.postText, uploading && { opacity: 0.5 }]}>Post</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.createContent}>
              <TextInput
                style={styles.createInput}
                placeholder="Type a status..."
                value={newStatusText}
                onChangeText={setNewStatusText}
                multiline
                autoFocus
              />

              {newStatusImage && (
                <View style={styles.previewContainer}>
                  <Image source={{ uri: newStatusImage }} style={styles.previewImage} contentFit="cover" transition={200} />
                  <TouchableOpacity style={styles.removeImage} onPress={() => setNewStatusImage(null)}>
                    <Ionicons name="close-circle" size={24} color="#FFF" />
                  </TouchableOpacity>
                </View>
              )}
            </View>

            <View style={styles.createFooter}>
              <TouchableOpacity style={styles.photoButton} onPress={pickImage}>
                <Ionicons name="image" size={24} color="#1A73E8" />
                <Text style={styles.photoButtonText}>Add Photo</Text>
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </Modal>
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
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  headerTitle: { fontSize: 22, fontWeight: '700', color: '#202124' },
  myStatusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  avatarContainer: { position: 'relative' },
  addIcon: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#1A73E8',
    borderRadius: 12,
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  statusInfo: { marginLeft: 15, justifyContent: 'center' },
  myStatusTitle: { fontSize: 16, fontWeight: '600', color: '#202124' },
  statusTime: { fontSize: 13, color: '#5F6368', marginTop: 2 },
  recentUpdates: { paddingHorizontal: 15, paddingTop: 20, paddingBottom: 10 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#5F6368', textTransform: 'uppercase' },
  statusItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
  },
  avatarBorder: {
    padding: 2,
    borderRadius: 30,
    borderWidth: 2,
    borderColor: '#1A73E8',
  },
  statusName: { fontSize: 16, fontWeight: '600', color: '#202124' },
  emptyText: { textAlign: 'center', marginTop: 50, color: '#5F6368', fontSize: 15 },
  
  // Viewer Styles
  viewerContainer: { flex: 1, backgroundColor: '#000' },
  viewerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 15, zIndex: 10 },
  viewerName: { color: '#FFF', fontSize: 16, fontWeight: '600' },
  viewerTime: { color: 'rgba(255,255,255,0.7)', fontSize: 12 },
  viewerContent: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  viewerImage: { width: '100%', height: '100%' },
  viewerText: { color: '#FFF', fontSize: 32, fontWeight: 'bold', textAlign: 'center', padding: 20 },
  viewerCaption: { position: 'absolute', bottom: 40, color: '#FFF', fontSize: 16, textAlign: 'center', width: '100%', paddingHorizontal: 20, textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: {width: 0, height: 1}, textShadowRadius: 3 },
  
  // Create Styles
  createContainer: { flex: 1, backgroundColor: '#FFFFFF' },
  createHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 15, borderBottomWidth: 1, borderBottomColor: '#E0E0E0' },
  cancelText: { color: '#5F6368', fontSize: 16 },
  createTitle: { fontSize: 18, fontWeight: '600', color: '#202124' },
  postText: { color: '#1A73E8', fontSize: 16, fontWeight: '600' },
  createContent: { flex: 1, padding: 15 },
  createInput: { fontSize: 22, color: '#202124', textAlignVertical: 'top' },
  previewContainer: { marginTop: 20, position: 'relative' },
  previewImage: { width: '100%', height: 300, borderRadius: 12 },
  removeImage: { position: 'absolute', top: 10, right: 10 },
  createFooter: { borderTopWidth: 1, borderTopColor: '#E0E0E0', padding: 15 },
  photoButton: { flexDirection: 'row', alignItems: 'center' },
  photoButtonText: { color: '#1A73E8', fontSize: 16, marginLeft: 8, fontWeight: '500' }
});

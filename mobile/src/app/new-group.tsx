import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, Keyboard } from 'react-native';
import { useRouter } from 'expo-router';
import { roomsAPI, usersAPI } from '../lib/api';
import { useAuth } from '../context/AuthContext';

function getAvatarColor(name) {
  const colors = ['#1A73E8', '#EA4335', '#34A853', '#FBBC04', '#8E24AA', '#E91E63', '#00ACC1', '#FF7043'];
  let hash = 0;
  for (let i = 0; i < (name || '').length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

export default function NewGroupScreen() {
  const router = useRouter();
  const { user } = useAuth();
  
  const [groupName, setGroupName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [searching, setSearching] = useState(false);
  const [creating, setCreating] = useState(false);

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

  const toggleUserSelection = (targetUser) => {
    if (selectedUsers.some(u => u._id === targetUser._id)) {
      setSelectedUsers(prev => prev.filter(u => u._id !== targetUser._id));
    } else {
      setSelectedUsers(prev => [...prev, targetUser]);
    }
  };

  const handleCreateGroup = async () => {
    if (!groupName.trim()) { alert('Please enter a group name.'); return; }
    if (selectedUsers.length === 0) { alert('Please select at least one other user.'); return; }

    setCreating(true);
    Keyboard.dismiss();
    try {
      const memberIds = selectedUsers.map(u => u._id);
      // Server expects { name, memberIds } — match exactly
      const { data } = await roomsAPI.createGroup(groupName.trim(), memberIds);
      const room = data.room || data;
      router.replace(`/chat/${room._id}`);
    } catch (err) {
      console.warn('Failed to create group', err);
      alert('Failed to create group');
    } finally {
      setCreating(false);
    }
  };

  const renderSearchItem = ({ item }) => {
    const isSelected = selectedUsers.some(u => u._id === item._id);
    const avatarColor = item.avatarColor || getAvatarColor(item.name);
    return (
      <TouchableOpacity 
        style={[styles.userItem, isSelected && styles.userItemSelected]}
        onPress={() => toggleUserSelection(item)}
        activeOpacity={0.7}
      >
        <View style={[styles.avatar, { backgroundColor: avatarColor }]}>
          <Text style={styles.avatarText}>{item.name.substring(0, 2).toUpperCase()}</Text>
        </View>
        <View style={styles.userInfo}>
          <Text style={styles.userName}>{item.name}</Text>
          <Text style={styles.userEmail} numberOfLines={1}>{item.email}</Text>
        </View>
        <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
          {isSelected && <Text style={styles.checkmark}>✓</Text>}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>New Group</Text>
        <View style={{ width: 60 }} />
      </View>

      <View style={styles.formContainer}>
        <Text style={styles.label}>Group Name</Text>
        <TextInput
          style={styles.input}
          placeholder="Enter group name..."
          placeholderTextColor="#5F6368"
          value={groupName}
          onChangeText={setGroupName}
        />

        <Text style={styles.label}>Add Members</Text>
        
        {selectedUsers.length > 0 && (
          <FlatList
            horizontal
            data={selectedUsers}
            keyExtractor={item => item._id}
            showsHorizontalScrollIndicator={false}
            style={styles.selectedList}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.selectedBadge} onPress={() => toggleUserSelection(item)}>
                <Text style={styles.selectedBadgeText}>{item.name} ✕</Text>
              </TouchableOpacity>
            )}
          />
        )}

        <TextInput
          style={styles.input}
          placeholder="Search users to add..."
          placeholderTextColor="#5F6368"
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      <View style={styles.listContainer}>
        {searching ? (
          <ActivityIndicator style={{ marginTop: 20 }} color="#1A73E8" />
        ) : (
          <FlatList
            data={searchResults}
            keyExtractor={(item) => item._id}
            renderItem={renderSearchItem}
            contentContainerStyle={{ padding: 15 }}
            ListEmptyComponent={
              searchQuery.trim() ? (
                <Text style={styles.emptyText}>No users found.</Text>
              ) : (
                <Text style={styles.emptyText}>Type a name to search for users.</Text>
              )
            }
          />
        )}
      </View>

      <View style={styles.footer}>
        <TouchableOpacity 
          style={[styles.createButton, (selectedUsers.length === 0 || !groupName.trim()) && styles.createButtonDisabled]}
          onPress={handleCreateGroup}
          disabled={selectedUsers.length === 0 || !groupName.trim() || creating}
        >
          {creating ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.createText}>Create Group Chat</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  header: {
    paddingTop: 60,
    paddingBottom: 15,
    paddingHorizontal: 20,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#202124' },
  backButton: { padding: 5 },
  backText: { fontSize: 16, color: '#1A73E8' },
  formContainer: {
    padding: 20,
    backgroundColor: '#FFFFFF',
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: '#5F6368',
    marginBottom: 8,
    marginTop: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: '#F1F3F4',
    height: 44,
    borderRadius: 22,
    paddingHorizontal: 18,
    fontSize: 15,
    marginBottom: 10,
    color: '#202124',
  },
  selectedList: {
    maxHeight: 50,
    marginBottom: 10,
  },
  selectedBadge: {
    backgroundColor: '#1A73E8',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 18,
    marginRight: 8,
    height: 34,
    justifyContent: 'center',
  },
  selectedBadgeText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  listContainer: { flex: 1 },
  userItem: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    padding: 14,
    borderRadius: 12,
    marginBottom: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  userItemSelected: {
    borderColor: '#1A73E8',
    backgroundColor: '#E8F0FE',
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  avatarText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  userInfo: { flex: 1 },
  userName: { fontSize: 15, fontWeight: '600', color: '#202124', marginBottom: 2 },
  userEmail: { color: '#5F6368', fontSize: 13 },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#E0E0E0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxSelected: {
    backgroundColor: '#1A73E8',
    borderColor: '#1A73E8',
  },
  checkmark: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 14 },
  emptyText: { textAlign: 'center', marginTop: 30, color: '#5F6368' },
  footer: {
    padding: 20,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  createButton: {
    backgroundColor: '#1A73E8',
    padding: 15,
    borderRadius: 25,
    alignItems: 'center',
  },
  createButtonDisabled: {
    backgroundColor: '#A8C7FA',
  },
  createText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  }
});

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import Avatar from './Avatar';

let RTCView = null;
try {
  RTCView = require('react-native-webrtc').RTCView;
} catch (e) {
  // react-native-webrtc not available in Expo Go
}

function getAvatarColor(name) {
  const colors = ['#1A73E8', '#EA4335', '#34A853', '#FBBC04', '#8E24AA', '#E91E63', '#00ACC1', '#FF7043'];
  let hash = 0;
  for (let i = 0; i < (name || '').length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

export default function CallUI({
  callState, callType, remoteUser, isMicOn, isCameraOn, callDuration,
  localStream, remoteStream, acceptCall, rejectCall, endCall, toggleMic, toggleCamera
}) {
  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  if (callState === 'idle') return null;

  if (callState === 'incoming') {
    return (
      <View style={styles.overlay}>
        <View style={styles.incomingContainer}>
          <Avatar url={remoteUser?.avatar} name={remoteUser?.name} color={getAvatarColor(remoteUser?.name)} size={80} style={{ marginBottom: 16 }} textStyle={{ fontSize: 30 }} />
          <Text style={styles.incomingTitle}>Incoming {callType} call</Text>
          <Text style={styles.remoteUserName}>{remoteUser?.name}</Text>
          <View style={styles.buttonRow}>
            <TouchableOpacity style={[styles.callBtn, styles.rejectBtn]} onPress={rejectCall}>
              <Text style={styles.callBtnIcon}>✕</Text>
              <Text style={styles.callBtnLabel}>Decline</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.callBtn, styles.acceptBtn]} onPress={acceptCall}>
              <Text style={styles.callBtnIcon}>✓</Text>
              <Text style={styles.callBtnLabel}>Accept</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.overlay}>
      {callType === 'video' && remoteStream && RTCView && (
        <RTCView streamURL={remoteStream.toURL()} style={StyleSheet.absoluteFill} objectFit="cover" />
      )}
      
      {callType === 'video' && localStream && isCameraOn && RTCView && (
        <View style={styles.localVideoContainer}>
          <RTCView streamURL={localStream.toURL()} style={{ flex: 1 }} objectFit="cover" />
        </View>
      )}

      {callType === 'audio' && (
        <View style={styles.audioViewContent}>
          <Avatar url={remoteUser?.avatar} name={remoteUser?.name} color={getAvatarColor(remoteUser?.name)} size={120} style={{ marginBottom: 20 }} textStyle={{ fontSize: 42 }} />
          <Text style={styles.audioViewTitle}>{remoteUser?.name}</Text>
        </View>
      )}

      <View style={styles.topBar}>
        <Text style={styles.statusText}>
          {callState === 'calling' ? 'Calling...' : formatDuration(callDuration)}
        </Text>
      </View>

      <View style={styles.controlsBar}>
        <TouchableOpacity style={[styles.controlBtn, !isMicOn && styles.controlBtnOff]} onPress={toggleMic}>
          <Text style={styles.controlIcon}>{isMicOn ? '🎙️' : '🔇'}</Text>
        </TouchableOpacity>
        {callType === 'video' && (
          <TouchableOpacity style={[styles.controlBtn, !isCameraOn && styles.controlBtnOff]} onPress={toggleCamera}>
            <Text style={styles.controlIcon}>{isCameraOn ? '📷' : '🚫'}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={[styles.controlBtn, styles.endCallBtn]} onPress={endCall}>
          <Text style={styles.controlIcon}>📞</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#202124',
    zIndex: 9999,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Incoming call
  incomingContainer: {
    backgroundColor: '#FFFFFF',
    padding: 36,
    borderRadius: 24,
    alignItems: 'center',
    width: '82%',
  },
  incomingAvatar: { width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  incomingAvatarText: { color: '#FFFFFF', fontSize: 30, fontWeight: '700' },
  incomingTitle: { color: '#5F6368', fontSize: 14, marginBottom: 6 },
  remoteUserName: { fontSize: 22, fontWeight: '700', color: '#202124', marginBottom: 32 },
  buttonRow: { flexDirection: 'row', justifyContent: 'space-around', width: '100%' },
  callBtn: { alignItems: 'center', width: 70 },
  rejectBtn: {},
  acceptBtn: {},
  callBtnIcon: { width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center', textAlign: 'center', lineHeight: 56, fontSize: 24, fontWeight: '700', color: '#FFFFFF', overflow: 'hidden' },
  callBtnLabel: { fontSize: 12, color: '#5F6368', marginTop: 6 },

  // In-call
  localVideoContainer: {
    position: 'absolute', top: 60, right: 20, width: 100, height: 140, borderRadius: 12,
    overflow: 'hidden', backgroundColor: '#333', borderWidth: 2, borderColor: '#FFFFFF',
  },
  audioContainer: { alignItems: 'center', justifyContent: 'center', flex: 1 },
  audioAvatar: { width: 120, height: 120, borderRadius: 60, justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  audioAvatarText: { color: '#FFFFFF', fontSize: 42, fontWeight: '700' },
  audioName: { color: '#FFFFFF', fontSize: 26, fontWeight: '700' },

  topBar: { position: 'absolute', top: 60, alignItems: 'center', width: '100%' },
  statusText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },

  controlsBar: {
    position: 'absolute', bottom: 50, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', width: '100%', gap: 20,
  },
  controlBtn: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center', alignItems: 'center', marginHorizontal: 8,
  },
  controlBtnOff: { backgroundColor: 'rgba(255,255,255,0.3)' },
  endCallBtn: { backgroundColor: '#EA4335' },
  controlIcon: { fontSize: 24 },
});

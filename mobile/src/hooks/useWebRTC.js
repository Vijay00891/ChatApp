import { useRef, useState, useEffect, useCallback } from 'react';
import { useSocket } from '../context/SocketContext';

let RTCPeerConnection, RTCIceCandidate, RTCSessionDescription, mediaDevices;
try {
  const webrtc = require('react-native-webrtc');
  RTCPeerConnection = webrtc.RTCPeerConnection;
  RTCIceCandidate = webrtc.RTCIceCandidate;
  RTCSessionDescription = webrtc.RTCSessionDescription;
  mediaDevices = webrtc.mediaDevices;
} catch (e) {
  console.warn('react-native-webrtc not available (expected in Expo Go)');
}

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ]
};

export function useWebRTC() {
  const { on, off, emit } = useSocket();
  
  const [callState, setCallState] = useState('idle');
  const [callType, setCallType] = useState(null);
  const [remoteUser, setRemoteUser] = useState(null);
  const [isMicOn, setIsMicOn] = useState(true);
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [callDuration, setCallDuration] = useState(0);
  
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);

  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const pendingOfferRef = useRef(null);
  const pendingCandidates = useRef([]);
  const callTimerRef = useRef(null);
  const remoteUserRef = useRef(null);

  const cleanup = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    if (callTimerRef.current) {
      clearInterval(callTimerRef.current);
      callTimerRef.current = null;
    }

    setLocalStream(null);
    setRemoteStream(null);
    setCallState('idle');
    setCallType(null);
    setRemoteUser(null);
    setIsMicOn(true);
    setIsCameraOn(true);
    setCallDuration(0);
    remoteUserRef.current = null;
    pendingCandidates.current = [];
  }, []);

  const getLocalStream = useCallback(async (type) => {
    try {
      const isVideo = type === 'video';
      
      let videoConstraints = false;
      if (isVideo) {
        // Find front camera first
        let isFront = true;
        const devices = await mediaDevices.enumerateDevices();
        const videoSourceId = devices.find(device => device.kind === 'videoinput' && device.facing === (isFront ? 'front' : 'environment'));
        const facingMode = isFront ? 'user' : 'environment';
        
        videoConstraints = {
          mandatory: {
            minWidth: 500,
            minHeight: 300,
            minFrameRate: 30
          },
          facingMode,
          optional: (videoSourceId ? [{ sourceId: videoSourceId }] : [])
        };
      }

      const stream = await mediaDevices.getUserMedia({
        audio: true,
        video: videoConstraints
      });
      
      localStreamRef.current = stream;
      setLocalStream(stream);

      return stream;
    } catch (err) {
      console.error('Failed to get local stream:', err);
      throw err;
    }
  }, []);

  const createPeerConnection = useCallback(() => {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    peerConnectionRef.current = pc;

    pc.onicecandidate = (event) => {
      if (event.candidate && remoteUserRef.current) {
        emit('call:ice-candidate', {
          targetId: remoteUserRef.current._id,
          candidate: event.candidate
        });
      }
    };

    // Note: react-native-webrtc uses onaddstream in older versions, but ontrack is supported in recent versions
    pc.ontrack = (event) => {
      const stream = event.streams[0];
      remoteStreamRef.current = stream;
      setRemoteStream(stream);
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      console.log('WebRTC connection state:', state);
      if (state === 'disconnected' || state === 'failed' || state === 'closed') {
        cleanup();
      }
    };

    return pc;
  }, [emit, cleanup]);



  const startCallTimer = useCallback(() => {
    if (callTimerRef.current) {
      clearInterval(callTimerRef.current);
    }

    callTimerRef.current = setInterval(() => {
      setCallDuration((prev) => prev + 1);
    }, 1000);
  }, []);

  const startCall = useCallback(async (targetUser, type) => {
    try {
      setRemoteUser(targetUser);
      remoteUserRef.current = targetUser;
      setCallType(type);
      setCallState('calling');

      const stream = await getLocalStream(type);
      const pc = createPeerConnection();

      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      emit('call:initiate', {
        receiverId: targetUser._id,
        callType: type,
        offer
      });
    } catch (err) {
      console.error('Start call error:', err);
      cleanup();
    }
  }, [getLocalStream, createPeerConnection, emit, cleanup]);

  const acceptCall = useCallback(async () => {
    try {
      setCallState('connected');
      startCallTimer();

      const pendingOffer = pendingOfferRef.current;
      if (!pendingOffer) return;

      const stream = await getLocalStream(callType);
      const pc = createPeerConnection();

      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });

      await pc.setRemoteDescription(new RTCSessionDescription(pendingOffer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      for (const candidate of pendingCandidates.current) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          console.warn('Queue Add ICE candidate error:', e);
        }
      }
      pendingCandidates.current = [];

      emit('call:accept', {
        callerId: remoteUser._id,
        answer
      });

      pendingOfferRef.current = null;
    } catch (err) {
      console.error('Accept call error:', err);
      cleanup();
    }
  }, [callType, remoteUser, getLocalStream, createPeerConnection, emit, cleanup, startCallTimer]);

  const rejectCall = useCallback(() => {
    if (remoteUser) {
      emit('call:reject', { callerId: remoteUser._id });
    }
    cleanup();
  }, [remoteUser, emit, cleanup]);

  const endCall = useCallback(() => {
    if (remoteUserRef.current) {
      emit('call:end', { targetId: remoteUserRef.current._id });
    }
    cleanup();
  }, [emit, cleanup]);

  const toggleMic = useCallback(() => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMicOn(audioTrack.enabled);
      }
    }
  }, []);

  const toggleCamera = useCallback(() => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsCameraOn(videoTrack.enabled);
      }
    }
  }, []);

  useEffect(() => {
    const handleCallIncoming = ({ callerId, callerName, callerAvatar, callType: type, offer }) => {
      const caller = { _id: callerId, username: callerName, avatar: callerAvatar };
      setRemoteUser(caller);
      remoteUserRef.current = caller;
      setCallType(type);
      pendingOfferRef.current = offer;
      setCallState('incoming');
    };

    const handleCallAccepted = async ({ answer }) => {
      try {
        if (peerConnectionRef.current) {
          await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(answer));
          setCallState('connected');
          startCallTimer();
          
          for (const candidate of pendingCandidates.current) {
            try {
              await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (e) {
              console.warn('Queue Add ICE candidate error:', e);
            }
          }
          pendingCandidates.current = [];
        }
      } catch (err) {
        console.error('Failed to set remote description for answer:', err);
      }
    };

    const handleCallRejected = () => {
      cleanup();
    };

    const handleCallEnded = () => {
      cleanup();
    };

    const handleIceCandidate = async ({ candidate }) => {
      try {
        if (peerConnectionRef.current && peerConnectionRef.current.remoteDescription && candidate) {
          await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
        } else if (candidate) {
          pendingCandidates.current.push(candidate);
        }
      } catch (err) {
        console.error('Error adding received ice candidate', err);
      }
    };

    on('call:incoming', 'webrtc', handleCallIncoming);
    on('call:accepted', 'webrtc', handleCallAccepted);
    on('call:rejected', 'webrtc', handleCallRejected);
    on('call:ended', 'webrtc', handleCallEnded);
    on('call:ice-candidate', 'webrtc', handleIceCandidate);

    return () => {
      off('call:incoming', 'webrtc');
      off('call:accepted', 'webrtc');
      off('call:rejected', 'webrtc');
      off('call:ended', 'webrtc');
      off('call:ice-candidate', 'webrtc');
      cleanup();
    };
  }, [on, off, cleanup, startCallTimer]);

  return {
    callState,
    callType,
    remoteUser,
    isMicOn,
    isCameraOn,
    callDuration,
    localStream,
    remoteStream,
    startCall,
    acceptCall,
    rejectCall,
    endCall,
    toggleMic,
    toggleCamera
  };
}

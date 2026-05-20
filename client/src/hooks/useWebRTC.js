import { useRef, useState, useEffect, useCallback } from 'react';
import { useSocket } from '../context/SocketContext';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ]
};

export function useWebRTC() {
  const { on, off, emit } = useSocket();
  const hookId = useRef(Math.random().toString(36)).current;
  
  const [callState, setCallState] = useState('idle');
  const [callType, setCallType] = useState(null);
  const [remoteUser, setRemoteUser] = useState(null);
  const [isMicOn, setIsMicOn] = useState(true);
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [callDuration, setCallDuration] = useState(0);

  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const pendingOfferRef = useRef(null);
  const callTimerRef = useRef(null);
  const remoteUserRef = useRef(null);

  const getLocalStream = useCallback(async (type) => {
    try {
      const constraints = type === 'video'
        ? { audio: true, video: { width: 1280, height: 720 } }
        : { audio: true, video: false };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      localStreamRef.current = stream;

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

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

    pc.ontrack = (event) => {
      const stream = event.streams[0];
      remoteStreamRef.current = stream;
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = stream;
      }
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      console.log('WebRTC connection state:', state);
      if (state === 'disconnected' || state === 'failed' || state === 'closed') {
        cleanup();
      }
    };

    pc.onicecandidateerror = (e) => {
      console.warn('ICE candidate error:', e);
    };

    return pc;
  }, [emit]);

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

    if (remoteStreamRef.current) {
      remoteStreamRef.current = null;
    }

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }

    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }

    setCallState('idle');
    setCallType(null);
    setRemoteUser(null);
    setIsMicOn(true);
    setIsCameraOn(true);
    setCallDuration(0);
    remoteUserRef.current = null;
  }, []);

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
    const audioTrack = localStreamRef.current?.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      setIsMicOn(audioTrack.enabled);
      return audioTrack.enabled;
    }
    return false;
  }, []);

  const toggleCamera = useCallback(() => {
    const videoTrack = localStreamRef.current?.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      setIsCameraOn(videoTrack.enabled);
      return videoTrack.enabled;
    }
    return false;
  }, []);

  // Socket listeners
  useEffect(() => {
    const handleIncomingCall = ({ callerId, callerName, callerAvatar, callType: type, offer }) => {
      setRemoteUser({ _id: callerId, username: callerName, avatar: callerAvatar });
      remoteUserRef.current = { _id: callerId, username: callerName, avatar: callerAvatar };
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
        }
      } catch (err) {
        console.error('Set remote description error:', err);
      }
    };

    const handleCallRejected = () => {
      cleanup();
    };

    const handleCallEnded = () => {
      cleanup();
    };

    const handleCallUnavailable = () => {
      cleanup();
    };

    const handleIceCandidate = async ({ candidate }) => {
      try {
        if (peerConnectionRef.current && candidate) {
          await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
        }
      } catch (err) {
        console.warn('Add ICE candidate error:', err);
      }
    };

    on('call:incoming', hookId, handleIncomingCall);
    on('call:accepted', hookId, handleCallAccepted);
    on('call:rejected', hookId, handleCallRejected);
    on('call:ended', hookId, handleCallEnded);
    on('call:unavailable', hookId, handleCallUnavailable);
    on('call:ice-candidate', hookId, handleIceCandidate);

    return () => {
      off('call:incoming', hookId);
      off('call:accepted', hookId);
      off('call:rejected', hookId);
      off('call:ended', hookId);
      off('call:unavailable', hookId);
      off('call:ice-candidate', hookId);
    };
  }, [on, off, cleanup, startCallTimer]);

  return {
    callState,
    callType,
    remoteUser,
    isMicOn,
    isCameraOn,
    callDuration,
    localVideoRef,
    remoteVideoRef,
    startCall,
    acceptCall,
    rejectCall,
    endCall,
    toggleMic,
    toggleCamera
  };
}

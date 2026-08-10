import React, { createContext, useContext } from 'react';
import { useWebRTC } from '../hooks/useWebRTC';
import CallUI from './CallUI';

const WebRTCContext = createContext(null);

export const useWebRTCContext = () => useContext(WebRTCContext);

export default function WebRTCWrapper({ children }) {
  const webrtc = useWebRTC();
  const {
    callState,
    callType,
    remoteUser,
    isMicOn,
    isCameraOn,
    callDuration,
    localVideoRef,
    remoteVideoRef,
    acceptCall,
    rejectCall,
    endCall,
    toggleMic,
    toggleCamera,
  } = webrtc;

  return (
    <WebRTCContext.Provider value={webrtc}>
      {children}
      {callState !== 'idle' && (
        <CallUI
          callState={callState}
          callType={callType}
          remoteUser={remoteUser}
          isMicOn={isMicOn}
          isCameraOn={isCameraOn}
          callDuration={callDuration}
          localVideoRef={localVideoRef}
          remoteVideoRef={remoteVideoRef}
          acceptCall={acceptCall}
          rejectCall={rejectCall}
          endCall={endCall}
          toggleMic={toggleMic}
          toggleCamera={toggleCamera}
        />
      )}
    </WebRTCContext.Provider>
  );
}

import React, { createContext, useContext } from 'react';
import { View, StyleSheet } from 'react-native';
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
    localStream,
    remoteStream,
    acceptCall,
    rejectCall,
    endCall,
    toggleMic,
    toggleCamera
  } = webrtc;

  return (
    <WebRTCContext.Provider value={webrtc}>
      <View style={styles.container}>
        {children}
        <CallUI
          callState={callState}
          callType={callType}
          remoteUser={remoteUser}
          isMicOn={isMicOn}
          isCameraOn={isCameraOn}
          callDuration={callDuration}
          localStream={localStream}
          remoteStream={remoteStream}
          acceptCall={acceptCall}
          rejectCall={rejectCall}
          endCall={endCall}
          toggleMic={toggleMic}
          toggleCamera={toggleCamera}
        />
      </View>
    </WebRTCContext.Provider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

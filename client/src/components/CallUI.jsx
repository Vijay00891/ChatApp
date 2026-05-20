import { useMemo } from 'react';

export default function CallUI({
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
  toggleCamera
}) {
  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  if (callState === 'idle') return null;

  if (callState === 'incoming') {
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.88)',
          backdropFilter: 'blur(12px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2000
        }}
      >
        <div
          style={{
            background: 'var(--bg-1)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-xl)',
            padding: 40,
            textAlign: 'center',
            maxWidth: 400
          }}
        >
          <div
            style={{
              width: 80,
              height: 80,
              borderRadius: '50%',
              background: 'var(--accent)',
              color: 'white',
              fontSize: 30,
              fontFamily: 'Syne',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px'
            }}
          >
            {remoteUser?.username?.substring(0, 2).toUpperCase()}
          </div>
          <h3 style={{ fontFamily: 'Syne', fontSize: 22, marginBottom: 6, marginTop: 0 }}>
            {remoteUser?.username}
          </h3>
          <p style={{ color: 'var(--text-2)', fontSize: 14, marginBottom: 32 }}>
            Incoming {callType} call...
          </p>
          <div style={{ display: 'flex', gap: 20, justifyContent: 'center' }}>
            <button
              onClick={rejectCall}
              style={{
                width: 60,
                height: 60,
                borderRadius: '50%',
                background: 'var(--red)',
                color: 'white',
                fontSize: 24,
                border: 'none',
                cursor: 'pointer'
              }}
            >
              ✕
            </button>
            <button
              onClick={acceptCall}
              style={{
                width: 60,
                height: 60,
                borderRadius: '50%',
                background: 'var(--green)',
                color: 'white',
                fontSize: 24,
                border: 'none',
                cursor: 'pointer'
              }}
            >
              📞
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (callState === 'calling') {
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.88)',
          backdropFilter: 'blur(12px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2000
        }}
      >
        <style>{`
          @keyframes dotPulse {
            0%, 80%, 100% { opacity: 0.2; transform: scale(0.8); }
            40% { opacity: 1; transform: scale(1.2); }
          }
          .call-dot {
            display: inline-block;
            width: 8px;
            height: 8px;
            background: var(--text-2);
            border-radius: 50%;
            margin: 0 4px;
            animation: dotPulse 1.4s infinite;
          }
          .dot-1 { animation-delay: 0s; }
          .dot-2 { animation-delay: 0.2s; }
          .dot-3 { animation-delay: 0.4s; }
        `}</style>
        <div
          style={{
            background: 'var(--bg-1)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-xl)',
            padding: 40,
            textAlign: 'center',
            maxWidth: 400
          }}
        >
          <div
            style={{
              width: 80,
              height: 80,
              borderRadius: '50%',
              background: 'var(--accent)',
              color: 'white',
              fontSize: 30,
              fontFamily: 'Syne',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px'
            }}
          >
            {remoteUser?.username?.substring(0, 2).toUpperCase()}
          </div>
          <h3 style={{ fontFamily: 'Syne', fontSize: 22, marginBottom: 6, marginTop: 0 }}>
            {remoteUser?.username}
          </h3>
          <p style={{ color: 'var(--text-2)', fontSize: 14, marginBottom: 32 }}>
            Calling
            <span className="call-dot dot-1"></span>
            <span className="call-dot dot-2"></span>
            <span className="call-dot dot-3"></span>
          </p>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <button
              onClick={endCall}
              style={{
                width: 60,
                height: 60,
                borderRadius: '50%',
                background: 'var(--red)',
                color: 'white',
                fontSize: 24,
                border: 'none',
                cursor: 'pointer'
              }}
            >
              ✕
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (callState === 'connected') {
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 2000,
          background: '#000'
        }}
      >
        {callType === 'audio' ? (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'column',
              background: 'var(--bg-0)'
            }}
          >
            <div
              style={{
                width: 120,
                height: 120,
                borderRadius: '50%',
                background: 'var(--accent)',
                color: 'white',
                fontSize: 50,
                fontFamily: 'Syne',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 24
              }}
            >
              {remoteUser?.username?.substring(0, 2).toUpperCase()}
            </div>
            <h2 style={{ fontFamily: 'Syne', fontSize: 24, marginBottom: 8, marginTop: 0, color: 'white' }}>
              {remoteUser?.username}
            </h2>
            <p style={{ color: 'var(--text-2)', fontSize: 14 }}>🎤 Audio Call</p>
          </div>
        ) : (
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover'
            }}
          />
        )}

        {callType === 'video' && (
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            style={{
              position: 'absolute',
              bottom: 110,
              right: 20,
              width: 140,
              height: 100,
              borderRadius: 12,
              objectFit: 'cover',
              border: '2px solid var(--accent)',
              background: '#000'
            }}
          />
        )}

        <div
          style={{
            position: 'absolute',
            top: 20,
            left: 20
          }}
        >
          <div style={{ color: 'white', fontFamily: 'Syne', fontSize: 16, fontWeight: 600 }}>
            {remoteUser?.username}
          </div>
          <div style={{ color: 'var(--text-2)', fontSize: 13, fontFamily: 'monospace' }}>
            {formatDuration(callDuration)}
          </div>
        </div>

        <div
          style={{
            position: 'absolute',
            bottom: 32,
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            gap: 16,
            alignItems: 'center'
          }}
        >
          <button
            onClick={toggleMic}
            style={{
              width: 52,
              height: 52,
              borderRadius: '50%',
              background: isMicOn ? 'rgba(255,255,255,0.15)' : 'var(--red)',
              color: 'white',
              fontSize: 20,
              border: 'none',
              cursor: 'pointer',
              transition: 'background 0.2s'
            }}
          >
            {isMicOn ? '🎤' : '🔇'}
          </button>

          {callType === 'video' && (
            <button
              onClick={toggleCamera}
              style={{
                width: 52,
                height: 52,
                borderRadius: '50%',
                background: isCameraOn ? 'rgba(255,255,255,0.15)' : 'var(--red)',
                color: 'white',
                fontSize: 20,
                border: 'none',
                cursor: 'pointer',
                transition: 'background 0.2s'
              }}
            >
              {isCameraOn ? '📹' : '🚫'}
            </button>
          )}

          <button
            onClick={endCall}
            style={{
              width: 64,
              height: 64,
              borderRadius: '50%',
              background: 'var(--red)',
              color: 'white',
              fontSize: 24,
              border: 'none',
              cursor: 'pointer',
              transition: 'background 0.2s'
            }}
          >
            📵
          </button>
        </div>
      </div>
    );
  }

  return null;
}

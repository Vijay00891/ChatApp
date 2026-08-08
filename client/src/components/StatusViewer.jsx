import { useState, useEffect, useCallback, useRef } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import Avatar from './Avatar';
import { statusAPI } from '../lib/api';

export default function StatusViewer({ statusGroup, onNextUser, onPrevUser, onClose, currentUserId }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const DURATION = 5000; // 5 seconds per status
  
  const statuses = statusGroup?.statuses || [];
  const currentStatus = statuses[currentIndex];
  const isMine = statusGroup?.user?._id === currentUserId;

  // Mark as viewed
  useEffect(() => {
    if (currentStatus && !isMine && !currentStatus.viewers?.includes(currentUserId)) {
      statusAPI.view(currentStatus._id).catch(() => {});
    }
  }, [currentStatus, isMine, currentUserId]);

  // Handle Progress Timer
  useEffect(() => {
    if (!currentStatus) return;
    
    // Reset progress when changing status
    setProgress(0);
    
    // If video, we might want to wait for video to end, but for now we just pause if isPaused
    let startTime = Date.now();
    let animationFrame;
    
    const animate = () => {
      if (isPaused) {
        startTime = Date.now() - (progress / 100) * DURATION;
        animationFrame = requestAnimationFrame(animate);
        return;
      }
      
      const elapsed = Date.now() - startTime;
      const newProgress = Math.min((elapsed / DURATION) * 100, 100);
      
      setProgress(newProgress);
      
      if (newProgress < 100) {
        animationFrame = requestAnimationFrame(animate);
      } else {
        handleNext();
      }
    };
    
    animationFrame = requestAnimationFrame(animate);
    
    return () => cancelAnimationFrame(animationFrame);
  }, [currentIndex, isPaused, currentStatus]);

  const handleNext = useCallback(() => {
    if (currentIndex < statuses.length - 1) {
      setCurrentIndex(prev => prev + 1);
    } else {
      if (onNextUser) {
        onNextUser();
      } else {
        onClose();
      }
    }
  }, [currentIndex, statuses.length, onNextUser, onClose]);

  const handlePrev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
    } else {
      if (onPrevUser) {
        onPrevUser();
      } else {
        onClose();
      }
    }
  }, [currentIndex, onPrevUser, onClose]);

  const handleTouchStart = (e) => {
    setIsPaused(true);
  };
  
  const handleTouchEnd = (e) => {
    setIsPaused(false);
  };

  const handleClick = (e) => {
    // Click left 30% goes back, right 70% goes forward
    const clickX = e.clientX || (e.touches && e.touches[0].clientX);
    if (!clickX) return;
    const screenWidth = window.innerWidth;
    
    if (clickX < screenWidth * 0.3) {
      handlePrev();
    } else {
      handleNext();
    }
  };

  if (!statusGroup || statuses.length === 0) return null;

  return (
    <div className="fixed inset-0 z-[2000] bg-black flex flex-col items-center justify-center animate-fade-in select-none">
      
      {/* Tap/Hold Zones */}
      <div 
        className="absolute inset-0 z-10" 
        onClick={handleClick}
        onPointerDown={handleTouchStart}
        onPointerUp={handleTouchEnd}
        onPointerLeave={handleTouchEnd}
      />

      {/* Progress Bars */}
      <div className="absolute top-0 left-0 right-0 p-4 z-30 flex gap-1 bg-gradient-to-b from-black/60 to-transparent">
        {statuses.map((_, i) => (
          <div key={i} className="h-0.5 flex-1 bg-white/30 rounded-full overflow-hidden backdrop-blur-sm">
            <div 
              className="h-full bg-white transition-all ease-linear"
              style={{
                width: i < currentIndex ? '100%' : i === currentIndex ? `${progress}%` : '0%',
                transitionDuration: i === currentIndex && !isPaused ? '100ms' : '0ms'
              }}
            />
          </div>
        ))}
      </div>

      {/* Header */}
      <div className="absolute top-6 left-0 right-0 px-4 z-30 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button 
            className="text-white p-2 md:hidden relative z-40" 
            onClick={(e) => { e.stopPropagation(); onClose(); }}
          >
            <ChevronLeft size={24} />
          </button>
          <Avatar 
            name={statusGroup.user.name} 
            src={statusGroup.user.avatar || ''} 
            size={40} 
            className="border border-white/20" 
          />
          <div className="flex flex-col text-white">
            <span className="font-semibold text-sm shadow-sm">{statusGroup.user.name}</span>
            <span className="text-xs text-white/80">
              {new Date(currentStatus.createdAt).toLocaleTimeString([], { hour: '2-digit', minute:'2-digit' })}
            </span>
          </div>
        </div>
        
        <div className="flex items-center gap-2 relative z-40">
          <button 
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            className="p-2 text-white/90 hover:text-white rounded-full bg-black/20 hover:bg-black/40 backdrop-blur-md transition-all"
          >
            <X size={24} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="w-full h-full md:max-w-[480px] flex items-center justify-center relative overflow-hidden bg-black">
        {currentStatus.mediaType === 'image' ? (
          <img 
            src={currentStatus.mediaUrl} 
            alt="status" 
            className="w-full h-full object-contain pointer-events-none" 
          />
        ) : currentStatus.mediaType === 'video' ? (
          <video 
            src={currentStatus.mediaUrl} 
            autoPlay 
            playsInline
            muted={false}
            loop={false}
            className="w-full h-full object-contain pointer-events-none"
            onPlay={() => setIsPaused(false)}
            onPause={() => setIsPaused(true)}
            onEnded={() => handleNext()}
          />
        ) : (
          <div 
            className="w-full h-full flex items-center justify-center p-8 text-center"
            style={{ backgroundColor: currentStatus.backgroundColor || '#128C7E' }}
          >
            <p 
              className="text-white text-3xl md:text-4xl font-medium font-google"
              style={{ wordBreak: 'break-word' }}
            >
              {currentStatus.content}
            </p>
          </div>
        )}
      </div>

      {/* Footer (Viewers for my own status) */}
      {isMine && currentStatus.viewers && (
        <div className="absolute bottom-6 left-0 right-0 z-30 flex justify-center pointer-events-none">
          <div className="bg-black/40 backdrop-blur-md px-4 py-2 rounded-full flex items-center gap-2 pointer-events-auto shadow-xl border border-white/10">
            <div className="text-white text-xs font-semibold">
              👁️ {currentStatus.viewers.length} view{currentStatus.viewers.length !== 1 && 's'}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

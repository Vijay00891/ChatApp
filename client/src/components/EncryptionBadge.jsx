import { useEffect, useState } from 'react';
import { Lock, Unlock } from 'lucide-react';

/**
 * EncryptionBadge shows E2EE security status in the chat window header.
 * @param {object} props
 * @param {boolean} props.isReady
 * @param {string|null} props.error
 */
export default function EncryptionBadge({ isReady, error }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isReady) {
      setVisible(true);
    }
  }, [isReady]);

  if (error) {
    return (
      <div className="flex items-center gap-1 text-[10px] text-error font-medium transition-all duration-300">
        <span>⚠️</span>
        <span className="truncate max-w-[200px]">{error}</span>
      </div>
    );
  }

  return (
    <div 
      className={`flex items-center gap-1 text-[10.5px] font-medium leading-none select-none transition-all duration-500
                 ${isReady ? 'text-subtle-text opacity-100' : 'text-primary/70 animate-pulse'}`}
    >
      {isReady ? (
        <>
          <Lock size={10.5} className="text-success shrink-0" style={{ color: '#34A853' }} />
          <span>Messages are end-to-end encrypted</span>
        </>
      ) : (
        <>
          <Unlock size={10.5} className="text-primary/60 shrink-0 animate-bounce" />
          <span>Setting up encryption…</span>
        </>
      )}
    </div>
  );
}

import { useState } from 'react';
import { MessageSquare } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import ChatWindow from '../components/ChatWindow';

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full bg-background gap-4">
      <div
        className="w-20 h-20 rounded-full bg-primary-light flex items-center justify-center"
        style={{ animation: 'fadeIn 0.4s ease-out' }}
      >
        <MessageSquare size={36} className="text-primary" />
      </div>
      <div className="text-center">
        <h2 className="text-xl font-semibold text-on-surface font-google">Your Messages</h2>
        <p className="text-sm text-subtle-text mt-1 max-w-xs">
          Select a conversation from the sidebar or search for someone to start a new chat.
        </p>
      </div>
    </div>
  );
}

export default function Chat() {
  const [selectedRoom, setSelectedRoom] = useState(null);
  // For mobile, track whether the sidebar or chat is shown
  const [mobileView, setMobileView] = useState('sidebar'); // 'sidebar' | 'chat'

  const handleSelectRoom = (room) => {
    setSelectedRoom(room);
    setMobileView('chat');
  };

  const handleBack = () => {
    setMobileView('sidebar');
    setSelectedRoom(null);
  };

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar — always visible on desktop, conditionally on mobile */}
      <div
        className={`
          ${mobileView === 'sidebar' ? 'flex' : 'hidden'}
          md:flex flex-col
          w-full md:w-80 lg:w-96 shrink-0
        `}
      >
        <Sidebar selectedRoom={selectedRoom} onSelectRoom={handleSelectRoom} />
      </div>

      {/* Divider */}
      <div className="hidden md:block w-px bg-border-color" />

      {/* Chat area */}
      <div
        className={`
          ${mobileView === 'chat' ? 'flex' : 'hidden'}
          md:flex flex-col flex-1 min-w-0
        `}
      >
        {selectedRoom ? (
          <ChatWindow room={selectedRoom} onBack={handleBack} />
        ) : (
          <EmptyState />
        )}
      </div>
    </div>
  );
}

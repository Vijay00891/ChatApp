import { useState, useRef, useEffect, useCallback, useId } from 'react';
import { Plus, Camera, Edit2 } from 'lucide-react';
import Avatar from './Avatar';
import { statusAPI } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import StatusViewer from './StatusViewer';

export default function StatusList() {
  const { user } = useAuth();
  const { on, off } = useSocket();
  const instanceId = useId();
  
  const [statusGroups, setStatusGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeGroupIndex, setActiveGroupIndex] = useState(null);

  const loadStatuses = useCallback(async () => {
    try {
      const res = await statusAPI.getAll();
      setStatusGroups(res.data.statuses || []);
    } catch (err) {
      console.error('Failed to load statuses', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatuses();
  }, [loadStatuses]);

  useEffect(() => {
    on('status_updated', instanceId, () => {
      loadStatuses();
    });
    return () => {
      off('status_updated', instanceId);
    };
  }, [instanceId, loadStatuses, on, off]);

  const myStatusGroup = statusGroups.find(g => g.user._id === user?._id);
  const otherStatusGroups = statusGroups.filter(g => g.user._id !== user?._id);

  const handleNextUser = () => {
    if (activeGroupIndex !== null && activeGroupIndex < otherStatusGroups.length - 1) {
      setActiveGroupIndex(activeGroupIndex + 1);
    } else {
      setActiveGroupIndex(null);
    }
  };

  const handlePrevUser = () => {
    if (activeGroupIndex !== null && activeGroupIndex > 0) {
      setActiveGroupIndex(activeGroupIndex - 1);
    } else {
      setActiveGroupIndex(null);
    }
  };

  const handleAddStatus = () => {
    // For simplicity, we just prompt for a text status right now
    const text = prompt("Enter your status text:");
    if (!text) return;
    
    statusAPI.create({
      content: text,
      mediaType: 'text',
      backgroundColor: '#128C7E'
    }).then(() => loadStatuses()).catch(err => alert('Failed to create status'));
  };

  if (loading) {
    return (
      <div className="flex gap-4 p-4 overflow-x-auto border-b border-border-color shrink-0 scrollbar-hidden">
        {[1, 2, 3].map(i => (
          <div key={i} className="flex flex-col items-center gap-1 shrink-0 animate-pulse">
            <div className="w-14 h-14 rounded-full bg-border-color" />
            <div className="w-12 h-2 rounded bg-border-color" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="border-b border-border-color shrink-0 bg-surface flex flex-col">
      <div className="px-4 py-2 flex items-center justify-between">
        <h3 className="text-sm font-bold text-on-surface">Status Updates</h3>
      </div>
      
      <div className="flex gap-4 p-4 pt-1 overflow-x-auto scrollbar-hidden items-start">
        {/* My Status */}
        <div className="flex flex-col items-center gap-1.5 shrink-0 cursor-pointer relative" onClick={() => myStatusGroup ? setActiveGroupIndex(-1) : handleAddStatus()}>
          <div className="relative">
            <div className={`p-0.5 rounded-full ${myStatusGroup ? 'bg-gradient-to-tr from-green-400 to-emerald-500' : 'bg-transparent'}`}>
              <div className="p-0.5 bg-surface rounded-full">
                <Avatar name={user?.name || ''} src={user?.avatar || ''} size={54} />
              </div>
            </div>
            {!myStatusGroup && (
              <div className="absolute bottom-0 right-0 bg-primary text-white rounded-full p-0.5 border-2 border-surface">
                <Plus size={14} strokeWidth={3} />
              </div>
            )}
          </div>
          <span className="text-[11px] font-medium text-on-surface truncate w-16 text-center">
            My status
          </span>
        </div>

        {/* Other Users' Statuses */}
        {otherStatusGroups.map((group, index) => {
          // Check if all statuses are viewed
          const allViewed = group.statuses.every(s => s.viewers?.includes(user?._id));
          
          return (
            <div 
              key={group.user._id} 
              className="flex flex-col items-center gap-1.5 shrink-0 cursor-pointer"
              onClick={() => setActiveGroupIndex(index)}
            >
              <div className={`p-[2px] rounded-full ${allViewed ? 'bg-border-color' : 'bg-primary'}`}>
                <div className="p-0.5 bg-surface rounded-full">
                  <Avatar name={group.user.name} src={group.user.avatar || ''} size={54} />
                </div>
              </div>
              <span className="text-[11px] font-medium text-on-surface truncate w-16 text-center">
                {group.user.name.split(' ')[0]}
              </span>
            </div>
          );
        })}
      </div>

      {activeGroupIndex !== null && (
        <StatusViewer 
          statusGroup={activeGroupIndex === -1 ? myStatusGroup : otherStatusGroups[activeGroupIndex]}
          currentUserId={user?._id}
          onNextUser={activeGroupIndex === -1 ? null : handleNextUser}
          onPrevUser={activeGroupIndex === -1 ? null : handlePrevUser}
          onClose={() => setActiveGroupIndex(null)}
        />
      )}
    </div>
  );
}

import { MessageSquare, Users, CircleDashed } from 'lucide-react';

export default function NavigationBar({ activeTab, onChange }) {
  const tabs = [
    { id: 'chats', label: 'Chats', icon: MessageSquare },
    { id: 'groups', label: 'Groups', icon: Users },
    { id: 'status', label: 'Updates', icon: CircleDashed },
  ];

  return (
    <div 
      className="bg-surface border-border-color z-40 flex shrink-0
                 border-t md:border-t-0 md:border-r
                 flex-row md:flex-col
                 w-full md:w-[72px] 
                 h-[60px] md:h-full
                 items-center justify-around md:justify-start md:pt-4 md:gap-4"
    >
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={`flex flex-col items-center justify-center p-2 md:p-3 rounded-xl transition-all w-[64px]
                        ${isActive 
                          ? 'text-primary bg-primary/10' 
                          : 'text-subtle-text hover:bg-hover-bg hover:text-on-surface'}`}
            title={tab.label}
          >
            <div className="relative">
              <Icon size={24} className={isActive ? 'fill-primary/20' : ''} />
            </div>
            <span className={`text-[10px] mt-1 font-medium ${isActive ? 'font-bold' : ''}`}>
              {tab.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

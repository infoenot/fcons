import React from 'react';
import { MessageSquare, Calendar as CalendarIcon, User } from 'lucide-react';

interface BottomNavProps {
  currentTab: string;
  onTabChange: (tab: string) => void;
}

const BottomNav: React.FC<BottomNavProps> = ({ currentTab, onTabChange }) => {
  const orderedTabs = [
    { id: 'chat', icon: MessageSquare, label: 'Assistant' },
    { id: 'calendar', icon: CalendarIcon, label: 'Calendar' },
    { id: 'account', icon: User, label: 'Profile' },
  ];

  return (
    <div className="bg-fin-bg pt-2 pb-safe px-6 h-[72px] flex justify-between items-center z-40 w-full shrink-0 transition-colors duration-300">
      {orderedTabs.map((tab) => {
        const isActive = currentTab === tab.id;
        return (
          <button 
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`flex flex-col items-center justify-center w-16 transition-all duration-200`}
          >
            <div className="p-2">
               <tab.icon 
                 size={28} 
                 className={`transition-colors duration-200 ${isActive ? 'text-fin-text' : 'text-fin-textTert'}`}
                 strokeWidth={2}
               />
            </div>
          </button>
        );
      })}
    </div>
  );
};

export default BottomNav;
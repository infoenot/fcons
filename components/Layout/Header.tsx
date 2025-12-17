import React, { useState } from 'react';
import { useFinance } from '../../context/FinanceContext';
import { Bell, ChevronDown } from 'lucide-react';
import TransactionListModal from '../Modals/TransactionListModal';

interface HeaderProps {
  isStatsOpen: boolean;
  onToggleStats: () => void;
}

const Header: React.FC<HeaderProps> = ({ isStatsOpen, onToggleStats }) => {
  const { getSummary, pendingConfirmations } = useFinance();
  const summary = getSummary(new Date());
  const [showNotifications, setShowNotifications] = useState(false);

  const formatCurrency = (val: number) => {
    return val.toLocaleString('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 });
  };

  return (
    <>
      <div className="bg-fin-bg sticky top-0 z-50 pt-8 pb-2 px-6 transition-all duration-300">
        <div className="flex justify-between items-center">
          <div 
            className="flex items-center gap-3 cursor-pointer select-none group"
            onClick={onToggleStats}
          >
            <h1 className="text-3xl font-semibold text-fin-text tracking-tight transition-colors">
              {formatCurrency(summary.balance)}
            </h1>
            <div className="flex items-center gap-1 text-fin-textTert mt-1 group-hover:text-fin-text transition-colors">
              <span className="text-sm font-medium">Баланс</span>
              <ChevronDown 
                size={16} 
                strokeWidth={2} 
                className={`transition-transform duration-300 ${isStatsOpen ? 'rotate-180' : ''}`}
              />
            </div>
          </div>
          
          <div 
            className="relative cursor-pointer hover:opacity-80 transition-opacity p-2 -mr-2"
            onClick={() => setShowNotifications(true)}
          >
            <Bell size={24} className="text-fin-text transition-colors" />
            {pendingConfirmations.length > 0 && (
              <span className="absolute top-2 right-2 h-2.5 w-2.5 bg-red-500 rounded-full border-2 border-fin-bg"></span>
            )}
          </div>
        </div>
      </div>

      <TransactionListModal 
        isOpen={showNotifications}
        onClose={() => setShowNotifications(false)}
        title="Уведомления"
        transactions={pendingConfirmations}
        mode="NOTIFICATIONS"
      />
    </>
  );
};

export default Header;
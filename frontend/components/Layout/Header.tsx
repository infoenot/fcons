import React, { useState } from 'react';
import { useFinance } from '../../context/FinanceContext';
import { Bell } from 'lucide-react';
import TransactionListModal from '../Modals/TransactionListModal';

const Header: React.FC = () => {
  const { getSummary, pendingConfirmations } = useFinance();
  const summary = getSummary(new Date());
  const [showNotifications, setShowNotifications] = useState(false);

  const formatCurrency = (val: number) => {
    const formatted = val.toLocaleString('ru-RU', { 
      style: 'currency', 
      currency: 'RUB', 
      maximumFractionDigits: 0 
    });
    return val > 0 ? `+${formatted}` : formatted;
  };

  return (
    <>
      <div className="bg-fin-bg sticky top-0 z-50 pb-4 px-6 transition-all duration-300 shadow-sm w-full" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 50px)' }}>
        <div className="flex justify-between items-center">
          <div className="flex items-baseline gap-3 select-none">
            <h1 className="text-3xl font-bold text-fin-text tracking-tight transition-colors">
              {formatCurrency(summary.balance)}
            </h1>
            <span className="text-[12px] font-bold text-fin-textTert opacity-60">
              Баланс
            </span>
          </div>
          
          <div 
            className="relative cursor-pointer hover:opacity-80 transition-opacity p-2 -mr-2"
            onClick={() => setShowNotifications(true)}
          >
            <Bell size={24} className="text-fin-text transition-colors" />
            {pendingConfirmations.length > 0 && (
              <span className="absolute top-2 right-2 h-2.5 w-2.5 bg-fin-error rounded-full border-2 border-fin-bg animate-pulse"></span>
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
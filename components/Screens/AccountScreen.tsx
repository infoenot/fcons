import React from 'react';
import { Settings, LogOut, Bell, HelpCircle, Moon, Sun, Trash2 } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

const AccountScreen: React.FC = () => {
  const { theme, toggleTheme } = useTheme();

  const handleClearData = () => {
    if (confirm('Вы уверены, что хотите удалить все данные? Это действие необратимо.')) {
      localStorage.removeItem('fin_transactions');
      localStorage.removeItem('fin_categories');
      localStorage.removeItem('fin_chat_messages');
      window.location.reload();
    }
  };

  return (
    <div className="p-6 h-full bg-fin-bg transition-colors duration-300">
      <h2 className="text-lg font-bold text-fin-text mb-6 tracking-wide uppercase">Профиль</h2>
      
      <div className="bg-fin-card rounded-card p-6 mb-6 flex items-center gap-5 border border-fin-border shadow-elevation-sm">
        <div className="w-16 h-16 bg-fin-bgSec rounded-full flex items-center justify-center text-fin-accent font-bold text-xl border border-fin-border">
            UI
        </div>
        <div>
          <h3 className="text-lg font-bold text-fin-text">Пользователь</h3>
          <p className="text-fin-textTert text-xs mt-1">ID: 8943-XJ</p>
          <div className="mt-2 inline-flex items-center px-2 py-0.5 rounded bg-fin-accent/10 border border-fin-accent/30 text-fin-accent text-[10px] font-bold uppercase tracking-wider">
            Premium
          </div>
        </div>
      </div>

      <div className="space-y-3">
        
        {/* Theme Toggle */}
        <div 
            onClick={toggleTheme}
            className="bg-fin-card p-4 rounded-btn text-fin-text font-medium border border-fin-border flex items-center justify-between cursor-pointer hover:bg-fin-bgSec transition-colors group select-none"
        >
             <div className="flex items-center gap-4">
                <div className="text-fin-textTert group-hover:text-fin-accent transition-colors">
                    {theme === 'dark' ? <Moon size={20} strokeWidth={1.5} /> : <Sun size={20} strokeWidth={1.5} />}
                </div>
                <span>Тема оформления</span>
             </div>
             
             <div className={`w-11 h-6 rounded-full p-0.5 transition-colors duration-300 flex items-center ${theme === 'dark' ? 'bg-fin-accent justify-end' : 'bg-fin-border justify-start'}`}>
                 <div className="w-5 h-5 bg-white rounded-full shadow-sm"></div>
             </div>
        </div>

        {[
            { name: 'Настройки', icon: Settings }, 
            { name: 'Уведомления', icon: Bell }, 
            { name: 'Поддержка', icon: HelpCircle }
        ].map((item) => (
          <div key={item.name} className="bg-fin-card p-4 rounded-btn text-fin-textSec font-medium border border-fin-border flex items-center gap-4 cursor-pointer hover:bg-fin-bgSec hover:text-fin-text transition-colors group">
            <div className="text-fin-textTert group-hover:text-fin-accent transition-colors">
                <item.icon size={20} strokeWidth={1.5} />
            </div>
            {item.name}
          </div>
        ))}
        
         <div 
            onClick={handleClearData}
            className="bg-fin-card p-4 rounded-btn text-fin-error font-medium border border-fin-border flex items-center gap-4 cursor-pointer hover:bg-fin-error/5 transition-colors mt-8"
        >
            <div className="text-fin-error opacity-70">
                <Trash2 size={20} strokeWidth={1.5} />
            </div>
            Очистить все данные
        </div>

         <div className="bg-fin-card p-4 rounded-btn text-fin-error font-medium border border-fin-border flex items-center gap-4 cursor-pointer hover:bg-fin-error/5 transition-colors">
            <div className="text-fin-error opacity-70">
                <LogOut size={20} strokeWidth={1.5} />
            </div>
            Выйти
          </div>
      </div>
      
      <div className="mt-12 text-center text-[10px] text-fin-textTert uppercase tracking-widest">
        System v3.1.1 (Stable)
      </div>
    </div>
  );
};

export default AccountScreen;
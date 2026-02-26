import React, { useRef, useState } from 'react';
import { Moon, Sun, Trash2, Download, Upload, AlertTriangle, LogOut } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useChatContext } from '../../context/ChatContext';
import { api } from '../../services/api';

const AccountScreen: React.FC = () => {
  const { theme, toggleTheme } = useTheme();
  const { clearMessages } = useChatContext();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearing, setClearing] = useState(false);

  const handleExport = () => {
    // Экспортируем только историю чата (данные теперь на сервере)
    const data = {
      messages: JSON.parse(localStorage.getItem('fin_chat_messages') || '[]'),
      theme: localStorage.getItem('fin_theme') || 'dark',
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `fin_backup_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target?.result as string);
        if (json.messages) localStorage.setItem('fin_chat_messages', JSON.stringify(json.messages));
        if (json.theme) localStorage.setItem('fin_theme', json.theme);
        window.location.reload();
      } catch (err) {
        console.error('Import error', err);
      }
    };
    reader.readAsText(file);
  };

  const confirmClearData = async () => {
    setClearing(true);
    try {
      // Удаляем все данные на сервере
      await api.clearAllData();
      // Чистим историю чата локально
      localStorage.removeItem('fin_chat_messages');
      clearMessages();
      setShowClearConfirm(false);
      // Перезагружаем чтобы FinanceContext переинициализировался с пустыми данными
      window.location.reload();
    } catch (e) {
      console.error('Clear error:', e);
      alert('Ошибка при очистке данных. Попробуй ещё раз.');
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="p-6 h-full bg-fin-bg transition-colors duration-300 overflow-y-auto no-scrollbar relative">
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

        <div className="pt-4 pb-1">
          <p className="text-[10px] font-bold text-fin-textTert uppercase tracking-widest px-4 mb-2">Данные</p>
          <div className="space-y-2">
            <div onClick={handleExport} className="bg-fin-card p-4 rounded-btn text-fin-text font-medium border border-fin-border flex items-center gap-4 cursor-pointer hover:bg-fin-bgSec transition-colors group">
              <div className="text-fin-textTert group-hover:text-fin-accent transition-colors"><Download size={20} strokeWidth={1.5} /></div>
              <span>Экспорт истории чата</span>
            </div>
            <div onClick={() => fileInputRef.current?.click()} className="bg-fin-card p-4 rounded-btn text-fin-text font-medium border border-fin-border flex items-center gap-4 cursor-pointer hover:bg-fin-bgSec transition-colors group">
              <div className="text-fin-textTert group-hover:text-fin-accent transition-colors"><Upload size={20} strokeWidth={1.5} /></div>
              <span>Импорт данных</span>
              <input type="file" ref={fileInputRef} onChange={handleImport} accept=".json" className="hidden" />
            </div>
          </div>
        </div>

        <div className="pt-4 pb-1">
          <p className="text-[10px] font-bold text-fin-textTert uppercase tracking-widest px-4 mb-2">Система</p>
          <div className="space-y-2">
            <div
              onClick={() => setShowClearConfirm(true)}
              className="bg-fin-card p-4 rounded-btn text-fin-error font-medium border border-fin-border flex items-center gap-4 cursor-pointer hover:bg-fin-error/5 transition-colors mt-4"
            >
              <div className="text-fin-error opacity-70"><Trash2 size={20} strokeWidth={1.5} /></div>
              Очистить все данные
            </div>
            <div className="bg-fin-card p-4 rounded-btn text-fin-error font-medium border border-fin-border flex items-center gap-4 cursor-pointer hover:bg-fin-error/5 transition-colors">
              <div className="text-fin-error opacity-70"><LogOut size={20} strokeWidth={1.5} /></div>
              Выйти
            </div>
          </div>
        </div>
      </div>

      {/* Модалка подтверждения */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-200">
          <div className="bg-fin-card w-full max-w-xs rounded-card border border-fin-border p-6 shadow-2xl flex flex-col items-center text-center">
            <div className="w-16 h-16 bg-fin-error/10 text-fin-error rounded-full flex items-center justify-center mb-4">
              <AlertTriangle size={32} />
            </div>
            <h3 className="text-lg font-bold text-fin-text mb-2">Вы уверены?</h3>
            <p className="text-fin-textSec text-sm mb-6">
              Все транзакции, категории и история чата будут удалены с сервера навсегда.
            </p>
            <div className="flex flex-col gap-2 w-full">
              <button
                onClick={confirmClearData}
                disabled={clearing}
                className="w-full py-3 bg-fin-error text-white rounded-btn font-bold text-sm hover:brightness-110 active:scale-95 transition-all disabled:opacity-50"
              >
                {clearing ? 'Удаляем...' : 'Да, удалить все'}
              </button>
              <button
                onClick={() => setShowClearConfirm(false)}
                disabled={clearing}
                className="w-full py-3 bg-fin-bgSec border border-fin-border text-fin-text rounded-btn font-bold text-sm hover:bg-fin-card transition-all"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mt-12 text-center text-[10px] text-fin-textTert uppercase tracking-widest pb-8">
        System v3.1.3 (Stable)
      </div>
    </div>
  );
};

export default AccountScreen;

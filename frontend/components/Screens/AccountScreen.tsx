import React, { useRef, useState } from 'react';
import { Moon, Sun, Trash2, Download, Upload, AlertTriangle, LogOut, UserPlus, Copy, Check, Crown, Shield, User, UserMinus } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useChatContext } from '../../context/ChatContext';
import { useFinance } from '../../context/FinanceContext';
import { api } from '../../services/api';

const ROLE_LABELS: Record<string, { label: string; icon: React.ReactNode; desc: string }> = {
  owner: { label: 'Владелец', icon: <Crown size={14} />, desc: 'Полный доступ' },
  member_full: { label: 'Участник', icon: <Shield size={14} />, desc: 'Все операции' },
  member_own: { label: 'Ограниченный', icon: <User size={14} />, desc: 'Только свои' },
};

const AccountScreen: React.FC = () => {
  const { theme, toggleTheme } = useTheme();
  const { clearMessages } = useChatContext();
  const { currentUser, spaceId, spaceRole, spaceMembers, inviteLink, refreshMembers } = useFinance();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [updatingRole, setUpdatingRole] = useState<number | null>(null);

  const handleExport = () => {
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
      await api.clearAllData();
      localStorage.removeItem('fin_chat_messages');
      clearMessages();
      setShowClearConfirm(false);
      window.location.reload();
    } catch (e) {
      console.error('Clear error:', e);
      alert('Ошибка при очистке данных. Попробуй ещё раз.');
    } finally {
      setClearing(false);
    }
  };

  const handleCopyInvite = async () => {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback для Telegram WebApp
      const el = document.createElement('textarea');
      el.value = inviteLink;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleChangeRole = async (userId: number, newRole: string) => {
    if (!spaceId) return;
    setUpdatingRole(userId);
    try {
      await api.updateMemberRole(spaceId, userId, newRole);
      await refreshMembers();
    } catch (e) {
      console.error('Change role error:', e);
      alert('Ошибка при смене роли');
    } finally {
      setUpdatingRole(null);
    }
  };

  const handleRemoveMember = async (userId: number) => {
    if (!spaceId) return;
    if (!confirm('Удалить участника?')) return;
    try {
      await api.removeMember(spaceId, userId);
      await refreshMembers();
    } catch (e) {
      console.error('Remove member error:', e);
      alert('Ошибка при удалении участника');
    }
  };

  const initials = currentUser?.name
    ? currentUser.name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)
    : 'UI';

  const isOwner = spaceRole === 'owner';

  return (
    <div className="p-6 h-full bg-fin-bg transition-colors duration-300 overflow-y-auto no-scrollbar relative">
      <h2 className="text-lg font-bold text-fin-text mb-6 tracking-wide uppercase">Профиль</h2>

      {/* Карточка пользователя */}
      <div className="bg-fin-card rounded-card p-6 mb-6 flex items-center gap-5 border border-fin-border shadow-elevation-sm">
        {currentUser?.avatar ? (
          <img
            src={currentUser.avatar}
            alt={currentUser.name}
            className="w-16 h-16 rounded-full object-cover border border-fin-border"
          />
        ) : (
          <div className="w-16 h-16 bg-fin-bgSec rounded-full flex items-center justify-center text-fin-accent font-bold text-xl border border-fin-border">
            {initials}
          </div>
        )}
        <div>
          <h3 className="text-lg font-bold text-fin-text">
            {currentUser?.name || 'Пользователь'}
          </h3>
          <p className="text-fin-textTert text-xs mt-1">
            ID: {currentUser?.telegramId || '—'}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <div className="inline-flex items-center px-2 py-0.5 rounded bg-fin-accent/10 border border-fin-accent/30 text-fin-accent text-[10px] font-bold uppercase tracking-wider">
              {currentUser?.plan === 'premium' ? 'Premium' : 'Free'}
            </div>
            {spaceRole && (
              <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-fin-bgSec border border-fin-border text-fin-textSec text-[10px] font-medium">
                {ROLE_LABELS[spaceRole]?.icon}
                {ROLE_LABELS[spaceRole]?.label}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Секция участников */}
      <div className="mb-6">
        <p className="text-[10px] font-bold text-fin-textTert uppercase tracking-widest px-1 mb-3">
          Совместный бюджет
        </p>

        {/* Список участников */}
        <div className="bg-fin-card rounded-card border border-fin-border overflow-hidden mb-3">
          {spaceMembers.map((member, idx) => {
            const roleInfo = ROLE_LABELS[member.role] || ROLE_LABELS['member_full'];
            const isCurrentUser = String(member.telegramId) === String(currentUser?.telegramId);
            const memberInitials = member.name.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2);

            return (
              <div
                key={member.id}
                className={`flex items-center gap-3 p-4 ${idx < spaceMembers.length - 1 ? 'border-b border-fin-border' : ''}`}
              >
                {/* Аватар */}
                {member.avatar ? (
                  <img
                    src={member.avatar}
                    alt={member.name}
                    className="w-10 h-10 rounded-full object-cover border border-fin-border flex-shrink-0"
                  />
                ) : (
                  <div className="w-10 h-10 bg-fin-bgSec rounded-full flex items-center justify-center text-fin-accent font-bold text-sm border border-fin-border flex-shrink-0">
                    {memberInitials}
                  </div>
                )}

                {/* Имя и роль */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-semibold text-fin-text truncate">
                      {member.name}
                      {isCurrentUser && <span className="text-fin-textTert font-normal"> (вы)</span>}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 mt-0.5 text-fin-textTert text-xs">
                    {roleInfo.icon}
                    <span>{roleInfo.desc}</span>
                  </div>
                </div>

                {/* Управление ролью (только owner, только для не-owner участников) */}
                {isOwner && !isCurrentUser && member.role !== 'owner' && (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {/* Переключатель роли */}
                    <div className="flex rounded-lg border border-fin-border overflow-hidden text-[10px]">
                      <button
                        onClick={() => handleChangeRole(member.id, 'member_full')}
                        disabled={updatingRole === member.id}
                        className={`px-2 py-1.5 font-semibold transition-colors ${
                          member.role === 'member_full'
                            ? 'bg-fin-accent text-white'
                            : 'bg-fin-bgSec text-fin-textTert hover:text-fin-text'
                        }`}
                      >
                        Все
                      </button>
                      <button
                        onClick={() => handleChangeRole(member.id, 'member_own')}
                        disabled={updatingRole === member.id}
                        className={`px-2 py-1.5 font-semibold transition-colors border-l border-fin-border ${
                          member.role === 'member_own'
                            ? 'bg-fin-accent text-white'
                            : 'bg-fin-bgSec text-fin-textTert hover:text-fin-text'
                        }`}
                      >
                        Свои
                      </button>
                    </div>
                    {/* Удалить */}
                    <button
                      onClick={() => handleRemoveMember(member.id)}
                      className="p-1.5 text-fin-textTert hover:text-fin-error transition-colors ml-1"
                    >
                      <UserMinus size={16} />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Кнопка пригласить */}
        <div
          onClick={handleCopyInvite}
          className="bg-fin-card p-4 rounded-btn border border-fin-border border-dashed flex items-center gap-4 cursor-pointer hover:bg-fin-bgSec transition-colors group"
        >
          <div className="text-fin-accent">
            {copied ? <Check size={20} strokeWidth={1.5} /> : <UserPlus size={20} strokeWidth={1.5} />}
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-fin-text">
              {copied ? 'Ссылка скопирована!' : 'Пригласить участника'}
            </p>
            <p className="text-xs text-fin-textTert mt-0.5">
              {copied ? 'Отправь ссылку другу' : 'Скопировать инвайт-ссылку'}
            </p>
          </div>
          <Copy size={16} className="text-fin-textTert group-hover:text-fin-accent transition-colors" />
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
            {isOwner && (
              <div
                onClick={() => setShowClearConfirm(true)}
                className="bg-fin-card p-4 rounded-btn text-fin-error font-medium border border-fin-border flex items-center gap-4 cursor-pointer hover:bg-fin-error/5 transition-colors mt-4"
              >
                <div className="text-fin-error opacity-70"><Trash2 size={20} strokeWidth={1.5} /></div>
                Очистить все данные
              </div>
            )}
            <div className="bg-fin-card p-4 rounded-btn text-fin-error font-medium border border-fin-border flex items-center gap-4 cursor-pointer hover:bg-fin-error/5 transition-colors">
              <div className="text-fin-error opacity-70"><LogOut size={20} strokeWidth={1.5} /></div>
              Выйти
            </div>
          </div>
        </div>
      </div>

      {/* Модалка подтверждения очистки */}
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
        System v3.2.0 (Stable)
      </div>
    </div>
  );
};

export default AccountScreen;

import React from 'react';
import { Home, MessageSquare, Shield, User } from 'lucide-react';
import { UserProfile } from '../types';

interface BottomNavProps {
  user: UserProfile | null;
  activeView: 'home' | 'chat' | 'admin';
  onChangeView: (view: 'home' | 'chat' | 'admin') => void;
  onOpenProfile: () => void;
  unreadCount?: number;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  user,
  activeView,
  onChangeView,
  onOpenProfile,
  unreadCount = 0,
}) => {
  return (
    <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border-t border-rose-100/70 dark:border-slate-800 px-4 py-2 flex items-center justify-around shadow-lg transition-colors pb-safe">
      <button
        onClick={() => onChangeView('home')}
        className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-all ${
          activeView === 'home'
            ? 'text-pink-600 dark:text-pink-400 font-extrabold'
            : 'text-slate-400 dark:text-slate-500 font-semibold hover:text-slate-600 dark:hover:text-slate-300'
        }`}
      >
        <Home className={`w-5 h-5 transition-transform ${activeView === 'home' ? 'scale-110 text-pink-600 dark:text-pink-400' : ''}`} />
        <span className="text-[11px]">Home</span>
      </button>

      <button
        onClick={() => onChangeView('chat')}
        className={`relative flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-all ${
          activeView === 'chat'
            ? 'text-pink-600 dark:text-pink-400 font-extrabold'
            : 'text-slate-400 dark:text-slate-500 font-semibold hover:text-slate-600 dark:hover:text-slate-300'
        }`}
      >
        <div className="relative">
          <MessageSquare className={`w-5 h-5 transition-transform ${activeView === 'chat' ? 'scale-110 text-pink-600 dark:text-pink-400' : ''}`} />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-2.5 bg-gradient-to-tr from-purple-600 via-pink-500 to-rose-500 text-white text-[10px] font-black w-4 h-4 rounded-full flex items-center justify-center border-2 border-white dark:border-slate-900 animate-pulse">
              {unreadCount}
            </span>
          )}
        </div>
        <span className="text-[11px]">Messages</span>
      </button>

      {user?.is_admin && (
        <button
          onClick={() => onChangeView('admin')}
          className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-all ${
            activeView === 'admin'
              ? 'text-pink-600 dark:text-pink-400 font-extrabold'
              : 'text-slate-400 dark:text-slate-500 font-semibold hover:text-slate-600 dark:hover:text-slate-300'
          }`}
        >
          <Shield className={`w-5 h-5 transition-transform ${activeView === 'admin' ? 'scale-110 text-pink-600 dark:text-pink-400' : ''}`} />
          <span className="text-[11px]">Admin</span>
        </button>
      )}

      <button
        onClick={onOpenProfile}
        className="flex flex-col items-center gap-1 py-1 px-3 rounded-xl text-slate-400 dark:text-slate-500 font-semibold hover:text-slate-600 dark:hover:text-slate-300 transition-all"
      >
        <User className="w-5 h-5" />
        <span className="text-[11px]">Profile</span>
      </button>
    </nav>
  );
};


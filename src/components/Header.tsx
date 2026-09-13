import React from 'react';
import { Sun, Moon, CheckCircle2 } from 'lucide-react';
import { UserProfile } from '../types';

interface HeaderProps {
  user: UserProfile | null;
  activeView: 'home' | 'chat' | 'admin';
  onOpenAdmin: () => void;
  onGoHome: () => void;
  darkMode: boolean;
  onToggleDarkMode: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  user,
  activeView,
  onGoHome,
  darkMode,
  onToggleDarkMode,
}) => {
  if (activeView !== 'home') return null;

  return (
    <header className="px-4 py-3 flex items-center justify-between border-b border-rose-100/70 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl sticky top-0 z-40">
      <div 
        onClick={onGoHome}
        className="flex items-center gap-2.5 cursor-pointer select-none"
      >
        {/* Instagram Gradient Story Ring Avatar */}
        <div className="w-9 h-9 rounded-full p-[2px] bg-gradient-to-tr from-amber-500 via-rose-500 to-purple-600 shadow-sm">
          <div className="w-full h-full rounded-full bg-white dark:bg-slate-900 flex items-center justify-center overflow-hidden">
            <span className="font-black text-transparent bg-clip-text bg-gradient-to-tr from-purple-600 to-pink-500 text-sm">
              S
            </span>
          </div>
        </div>

        <div>
          <div className="flex items-center gap-1 font-black text-sm tracking-tight text-slate-900 dark:text-white leading-none">
            <span>Sanya Chouhan</span>
            <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-sky-500 text-white text-[8px] font-black">
              ✓
            </span>
          </div>
          <div className="text-[10px] font-bold text-rose-500 dark:text-rose-400 mt-0.5 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            @sanyachouhaan_bot
          </div>
        </div>
      </div>

      <button
        onClick={onToggleDarkMode}
        className="w-8 h-8 rounded-full border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 active:scale-95 transition-all"
        title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
      >
        {darkMode ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5 text-purple-500" />}
      </button>
    </header>
  );
};


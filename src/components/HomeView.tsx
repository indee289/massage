import React from 'react';
import { MessageSquare, Star, Edit3, ShieldCheck, Lock, CheckCircle2, Sparkles, Heart } from 'lucide-react';
import { UserProfile } from '../types';

interface HomeViewProps {
  user: UserProfile | null;
  onOpenChat: () => void;
  onOpenProfile: () => void;
  onSubscribe: () => void;
  subscribing: boolean;
}

export const HomeView: React.FC<HomeViewProps> = ({
  user,
  onOpenChat,
  onOpenProfile,
  onSubscribe,
  subscribing,
}) => {
  const isPremium = Boolean(user?.subscription?.active || user?.is_admin);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-5 flex flex-col items-center justify-center animate-fade-in space-y-4">
      {/* Instagram Bot Profile & Subscription Card */}
      <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl p-6 border border-rose-100 dark:border-slate-800 shadow-xl shadow-rose-500/5 relative overflow-hidden text-center">
        {/* Instagram Glow */}
        <div className="absolute -top-16 -right-16 w-36 h-36 rounded-full bg-gradient-to-br from-purple-500/10 via-pink-500/10 to-amber-500/10 blur-2xl pointer-events-none" />
        <div className="absolute -bottom-16 -left-16 w-36 h-36 rounded-full bg-gradient-to-tr from-pink-500/10 to-rose-500/10 blur-2xl pointer-events-none" />

        <div className="flex flex-col items-center">
          {/* Instagram Story Ring Avatar */}
          <div className="relative mb-3.5">
            <div className="w-24 h-24 rounded-full p-[3px] bg-gradient-to-tr from-amber-500 via-rose-500 to-purple-600 shadow-lg shadow-rose-500/20">
              <div className="w-full h-full rounded-full bg-white dark:bg-slate-900 p-[2px] overflow-hidden">
                <div className="w-full h-full rounded-full bg-gradient-to-tr from-purple-600 via-pink-500 to-rose-500 flex items-center justify-center text-white font-black text-3xl">
                  S
                </div>
              </div>
            </div>
            <div className="absolute bottom-0 right-1 w-6 h-6 rounded-full bg-emerald-500 border-2 border-white dark:border-slate-900 flex items-center justify-center text-white shadow-xs">
              <CheckCircle2 className="w-3.5 h-3.5" />
            </div>
          </div>

          {/* Sanya Name & Instagram Verified Badge */}
          <div className="flex items-center gap-1.5 justify-center">
            <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">
              Sanya Chouhan
            </h2>
            <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-sky-500 text-white text-[9px] font-black" title="Verified Account">
              ✓
            </span>
          </div>

          <p className="text-sm font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-600 via-pink-500 to-rose-500 mt-1">
            Chat with Sanya
          </p>

          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-1 max-w-[250px] leading-relaxed">
            Official Telegram Bot for direct 1-on-1 private messaging with Sanya Chouhan.
          </p>

          {/* Subscription Status Badge */}
          <div className="mt-4 mb-5">
            {isPremium ? (
              <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-xs font-bold shadow-xs">
                <ShieldCheck className="w-4 h-4 text-emerald-500" />
                <span>Subscription Active · Unlocked</span>
              </div>
            ) : (
              <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-rose-50 dark:bg-rose-950/60 border border-rose-200/80 dark:border-rose-900/80 text-rose-700 dark:text-rose-300 text-xs font-bold">
                <Lock className="w-3.5 h-3.5 text-rose-500" />
                <span>Subscribe Premium to Chat</span>
              </div>
            )}
          </div>

          {/* Action Buttons with Instagram Sunset Gradient */}
          <div className="w-full flex flex-col gap-2.5">
            {isPremium ? (
              <button
                onClick={onOpenChat}
                className="w-full py-3.5 px-5 rounded-2xl bg-gradient-to-r from-purple-600 via-pink-500 to-rose-500 hover:opacity-95 text-white font-extrabold text-xs shadow-lg shadow-pink-500/25 flex items-center justify-center gap-2 active:scale-97 transition-all"
              >
                <MessageSquare className="w-4 h-4" />
                <span>Open Chat with Sanya</span>
              </button>
            ) : (
              <>
                <button
                  onClick={onSubscribe}
                  disabled={subscribing}
                  className="w-full py-4 px-5 rounded-2xl bg-gradient-to-r from-purple-600 via-pink-500 to-amber-500 hover:opacity-95 text-white font-black text-sm shadow-xl shadow-pink-500/25 flex items-center justify-center gap-2 active:scale-97 transition-all disabled:opacity-60"
                >
                  <Star className="w-4 h-4 fill-current text-amber-200 animate-bounce" />
                  <span>{subscribing ? 'Processing Payment…' : 'Subscribe Premium (199 Stars)'}</span>
                </button>

                <p className="text-[11px] font-medium text-slate-400 leading-tight">
                  Unlock 1-on-1 private messaging with Sanya for 199 Telegram Stars.
                </p>
              </>
            )}
          </div>
        </div>
      </div>

      {/* User My Account Strip */}
      <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl p-3.5 border border-rose-100/70 dark:border-slate-800 shadow-xs flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-amber-400 via-rose-400 to-purple-500 p-[2px] flex-shrink-0">
            <div className="w-full h-full rounded-full bg-white dark:bg-slate-900 flex items-center justify-center text-slate-800 dark:text-slate-100 font-extrabold text-xs overflow-hidden">
              {user?.avatar_url ? (
                <img src={user.avatar_url} alt="" className="w-full h-full object-cover" />
              ) : (
                (user?.first_name || 'U').charAt(0).toUpperCase()
              )}
            </div>
          </div>
          <div className="min-w-0 text-left">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider leading-none">
              My Profile
            </div>
            <div className="text-xs font-black text-slate-900 dark:text-white truncate max-w-[130px] mt-0.5">
              {user?.first_name || 'Set Profile'}
            </div>
          </div>
        </div>

        <button
          onClick={onOpenProfile}
          className="px-3 py-1.5 rounded-xl bg-pink-50 dark:bg-pink-950/60 text-pink-600 dark:text-pink-400 hover:bg-pink-100 text-[11px] font-extrabold border border-pink-200/50 dark:border-pink-800/50 flex items-center gap-1 active:scale-95 transition-all flex-shrink-0"
        >
          <Edit3 className="w-3 h-3" />
          <span>Edit</span>
        </button>
      </div>
    </div>
  );
};




import React, { useState, useEffect } from 'react';
import { ArrowLeft, Users, BarChart3, Search, Star, Ban, CheckCircle2, ShieldCheck, DollarSign, MessageSquare, RotateCcw } from 'lucide-react';
import { AdminUser, AdminStats } from '../types';
import { api } from '../api';

interface AdminViewProps {
  onBack: () => void;
}

export const AdminView: React.FC<AdminViewProps> = ({ onBack }) => {
  const [activeTab, setActiveTab] = useState<'users' | 'stats'>('users');
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    try {
      const [usersRes, statsRes] = await Promise.all([
        api.getAdminUsers(),
        api.getAdminStats(),
      ]);
      setUsers(usersRes.users);
      setStats(statsRes);
    } catch (err: any) {
      console.error('Admin data load error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 4000);
    return () => clearInterval(interval);
  }, []);

  const handleGrant = async (userId: number) => {
    try {
      await api.adminGrant(userId);
      loadData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleBan = async (userId: number) => {
    try {
      await api.adminBan(userId);
      loadData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleUnban = async (userId: number) => {
    try {
      await api.adminUnban(userId);
      loadData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const filteredUsers = users.filter(
    (u) =>
      (u.first_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (u.username || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      String(u.id).includes(searchQuery)
  );

  return (
    <div className="flex-1 flex flex-col bg-slate-50 dark:bg-slate-950 overflow-hidden relative animate-fade-in">
      {/* Top Header */}
      <div className="h-16 px-4 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border-b border-slate-200/80 dark:border-slate-800/80 flex items-center justify-between sticky top-0 z-30 shadow-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="w-9 h-9 rounded-full flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 active:scale-95 transition-all"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="font-extrabold text-base text-slate-900 dark:text-white leading-none">
              Admin Panel
            </h2>
            <span className="text-xs text-indigo-600 dark:text-indigo-400 font-medium">
              User Management & Analytics
            </span>
          </div>
        </div>
      </div>

      {/* Segmented Control Tab Bar */}
      <div className="px-4 py-2.5 bg-white dark:bg-slate-900 border-b border-slate-200/80 dark:border-slate-800 flex items-center justify-center">
        <div className="w-full max-w-sm p-1 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center">
          <button
            onClick={() => setActiveTab('users')}
            className={`flex-1 py-2 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-all ${
              activeTab === 'users'
                ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Users ({users.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('stats')}
            className={`flex-1 py-2 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-all ${
              activeTab === 'stats'
                ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            <span>Stats</span>
          </button>
        </div>
      </div>

      {/* Search Input Bar */}
      {activeTab === 'users' && (
        <div className="px-4 py-3 bg-slate-50 dark:bg-slate-950 border-b border-slate-200/60 dark:border-slate-800/60">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search users by name, username, ID…"
              className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl pl-10 pr-4 py-2 text-xs text-slate-900 dark:text-white placeholder-slate-400 outline-none focus:border-indigo-500 transition-all font-medium"
            />
          </div>
        </div>
      )}

      {/* Main Tab Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'users' && (
          <div className="space-y-3">
            {filteredUsers.length === 0 ? (
              <div className="py-12 text-center text-slate-400 dark:text-slate-500 text-xs font-bold">
                No users found
              </div>
            ) : (
              filteredUsers.map((u) => {
                const isUserPremium = u.subscription?.active;

                return (
                  <div
                    key={u.id}
                    className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 flex items-center justify-between shadow-sm hover:border-indigo-200 dark:hover:border-indigo-800 transition-all"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 text-white font-extrabold text-xs flex items-center justify-center overflow-hidden flex-shrink-0">
                        {u.avatar_url ? (
                          <img src={u.avatar_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          (u.first_name || 'U').charAt(0).toUpperCase()
                        )}
                      </div>

                      <div className="min-w-0">
                        <div className="font-extrabold text-xs text-slate-900 dark:text-white truncate flex items-center gap-1.5">
                          <span>{u.first_name || `User #${u.id}`}</span>
                          {isUserPremium && (
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 font-bold">
                              ★ Premium
                            </span>
                          )}
                          {u.is_banned && (
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 font-bold">
                              Banned
                            </span>
                          )}
                        </div>

                        <div className="text-[10px] text-slate-400 font-medium">
                          ID: {u.id} {u.username ? `· @${u.username}` : ''}
                        </div>
                      </div>
                    </div>

                    {/* Action Controls */}
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {!isUserPremium && (
                        <button
                          onClick={() => handleGrant(u.id)}
                          className="px-2.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-[11px] font-black flex items-center gap-1 shadow-xs active:scale-95 transition-all"
                          title="Grant Premium"
                        >
                          <Star className="w-3 h-3 fill-current" />
                          <span>Grant</span>
                        </button>
                      )}

                      {u.is_banned ? (
                        <button
                          onClick={() => handleUnban(u.id)}
                          className="px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold flex items-center gap-1 shadow-xs active:scale-95 transition-all"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Unban</span>
                        </button>
                      ) : (
                        <button
                          onClick={() => handleBan(u.id)}
                          className="px-2 py-1.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 text-rose-600 dark:text-rose-400 text-[11px] font-bold flex items-center gap-1 border border-rose-200 dark:border-rose-900 active:scale-95 transition-all"
                        >
                          <Ban className="w-3 h-3" />
                          <span>Ban</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {activeTab === 'stats' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm">
                <div className="text-[11px] font-bold text-slate-400 flex items-center gap-1.5 mb-1">
                  <Users className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Total Users</span>
                </div>
                <div className="text-2xl font-black text-slate-900 dark:text-white">
                  {stats?.total_users || 0}
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm">
                <div className="text-[11px] font-bold text-slate-400 flex items-center gap-1.5 mb-1">
                  <Star className="w-3.5 h-3.5 text-amber-500 fill-current" />
                  <span>Premium Users</span>
                </div>
                <div className="text-2xl font-black text-slate-900 dark:text-white">
                  {stats?.premium_users || 0}
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm">
                <div className="text-[11px] font-bold text-slate-400 flex items-center gap-1.5 mb-1">
                  <MessageSquare className="w-3.5 h-3.5 text-purple-500" />
                  <span>Total Messages</span>
                </div>
                <div className="text-2xl font-black text-slate-900 dark:text-white">
                  {stats?.total_messages || 0}
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm">
                <div className="text-[11px] font-bold text-slate-400 flex items-center gap-1.5 mb-1">
                  <DollarSign className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Stars Revenue</span>
                </div>
                <div className="text-2xl font-black text-slate-900 dark:text-white">
                  {stats?.revenue_stars || 0} ⭐
                </div>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-md flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-indigo-100">Banned Accounts</div>
                <div className="text-xl font-black">{stats?.banned_users || 0} Users</div>
              </div>
              <ShieldCheck className="w-8 h-8 text-indigo-200" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

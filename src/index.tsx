import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { UserProfile, Message } from './types';
import { api } from './api';
import { Header } from './components/Header';
import { BottomNav } from './components/BottomNav';
import { HomeView } from './components/HomeView';
import { ChatView } from './components/ChatView';
import { AdminView } from './components/AdminView';
import { ProfileModal } from './components/ProfileModal';

const App: React.FC = () => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [activeView, setActiveView] = useState<'home' | 'chat' | 'admin'>('home');
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });

  // Apply dark class to <html> tag
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  // Load User Profile
  const loadProfile = async () => {
    try {
      const data = await api.getMe();
      setUser(data);
      setAuthError(null);
    } catch (err: any) {
      setAuthError(err.message || 'Open this Mini App inside Telegram.');
    } finally {
      setLoading(false);
    }
  };

  const [adminUnreadCount, setAdminUnreadCount] = useState<number>(0);

  // Load Chat Messages
  const loadMessages = async () => {
    try {
      if (user?.is_admin) {
        const convRes = await api.getConversations();
        const totalUnread = convRes.conversations.reduce((sum, c) => sum + (c.unread_count || 0), 0);
        setAdminUnreadCount(totalUnread);
      }
      const data = await api.getMessages();
      setMessages(data.messages || []);
    } catch (err: any) {
      // Quietly ignore polling errors when not inside Telegram
    }
  };

  useEffect(() => {
    // Expand Telegram WebApp if present
    try {
      if (typeof window !== 'undefined') {
        const tg = (window as any).Telegram?.WebApp;
        if (tg) {
          if (typeof tg.ready === 'function') tg.ready();
          if (typeof tg.expand === 'function') tg.expand();
        }
      }
    } catch (e) {
      // Ignore Telegram WebApp initialization errors in iframe preview
    }

    loadProfile();
    loadMessages();

    // Auto-poll messages every 3 seconds for real-time updates
    const interval = setInterval(loadMessages, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleSendMessage = async (text: string) => {
    await api.sendMessage(text);
    await loadMessages();
  };

  const handleEditMessage = async (id: number, text: string) => {
    await api.editMessage(id, text);
    await loadMessages();
  };

  const handleUnsendMessage = async (id: number) => {
    await api.unsendMessage(id);
    await loadMessages();
  };

  const handleDeleteMessage = async (id: number) => {
    await api.deleteMessage(id);
    await loadMessages();
  };

  const handleSubscribe = async () => {
    setSubscribing(true);
    try {
      const res = await api.createInvoice();
      const tg = typeof window !== 'undefined' ? (window as any).Telegram?.WebApp : null;
      if (tg && typeof tg.openInvoice === 'function' && res.invoice_url) {
        tg.openInvoice(res.invoice_url, async (status: string) => {
          if (status === 'paid') {
            await loadProfile();
            alert('⭐ Premium activated for 30 days!');
          }
        });
      } else if (res.invoice_url) {
        window.open(res.invoice_url, '_blank');
      } else {
        await loadProfile();
      }
    } catch (err: any) {
      alert(err.message || 'Payment failed');
    } finally {
      setSubscribing(false);
    }
  };

  const handleSaveProfile = async (data: {
    first_name?: string;
    bio?: string;
    username?: string;
    avatar_data_url?: string;
  }) => {
    await api.updateProfile(data);
    await loadProfile();
  };

  const unreadCount = user?.is_admin
    ? adminUnreadCount
    : messages.filter(
        (m) => m.sender_id !== user?.id && !m.seen_at && !m.deleted_at
      ).length;

  if (loading) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-white dark:bg-slate-950 text-slate-900 dark:text-white">
        <div className="w-10 h-10 border-4 border-pink-200 border-t-pink-600 rounded-full animate-spin mb-4" />
        <p className="font-black text-xs tracking-wider uppercase text-transparent bg-clip-text bg-gradient-to-r from-purple-600 via-pink-500 to-amber-500">
          Loading Sanya Messenger…
        </p>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-slate-100 dark:bg-slate-950 flex flex-col items-center justify-center overflow-hidden font-sans select-none antialiased">
      {/* Mobile Frame Container */}
      <div className="w-full h-full max-w-md bg-slate-50 dark:bg-slate-900 flex flex-col overflow-hidden relative shadow-2xl border-x border-slate-200/60 dark:border-slate-800">
        
        {/* Top Header */}
        <Header
          user={user}
          activeView={activeView}
          onOpenAdmin={() => setActiveView('admin')}
          onGoHome={() => setActiveView('home')}
          darkMode={darkMode}
          onToggleDarkMode={() => setDarkMode(!darkMode)}
        />

        {authError && (
          <div className="bg-amber-500/10 border-b border-amber-500/20 px-3 py-1.5 text-center text-[11px] font-semibold text-amber-700 dark:text-amber-300 flex items-center justify-center gap-1.5">
            <span>📱</span>
            <span>Telegram Mini App: Open via Telegram Bot to log in & chat</span>
          </div>
        )}

        {/* Views */}
        <main className="flex-1 flex flex-col overflow-hidden relative pb-16">
          {activeView === 'home' && (
            <HomeView
              user={user}
              onOpenChat={() => setActiveView('chat')}
              onOpenProfile={() => setIsProfileOpen(true)}
              onSubscribe={handleSubscribe}
              subscribing={subscribing}
            />
          )}

          {activeView === 'chat' && (
            <ChatView
              user={user}
              messages={messages}
              onBack={() => setActiveView('home')}
              onSendMessage={handleSendMessage}
              onEditMessage={handleEditMessage}
              onUnsendMessage={handleUnsendMessage}
              onDeleteMessage={handleDeleteMessage}
              loading={loading}
              onSubscribe={handleSubscribe}
              subscribing={subscribing}
            />
          )}

          {activeView === 'admin' && (
            <AdminView onBack={() => setActiveView('home')} />
          )}
        </main>

        {/* Bottom Navigation */}
        <BottomNav
          user={user}
          activeView={activeView}
          onChangeView={(view) => setActiveView(view)}
          onOpenProfile={() => setIsProfileOpen(true)}
          unreadCount={unreadCount}
        />

        {/* Profile Edit Sheet */}
        {isProfileOpen && (
          <ProfileModal
            user={user}
            onClose={() => setIsProfileOpen(false)}
            onSave={handleSaveProfile}
          />
        )}
      </div>
    </div>
  );
};

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}

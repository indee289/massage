import React, { useState, useRef, useEffect } from 'react';
import { ArrowLeft, Send, X, Check, CheckCheck, Copy, Edit2, Trash2, Search, MessageSquare, Star, Ban } from 'lucide-react';
import { Message, UserProfile, Conversation } from '../types';
import { api } from '../api';

interface ChatViewProps {
  user: UserProfile | null;
  messages: Message[];
  onBack: () => void;
  onSendMessage: (text: string) => Promise<void>;
  onEditMessage: (id: number, text: string) => Promise<void>;
  onUnsendMessage: (id: number) => Promise<void>;
  onDeleteMessage: (id: number) => Promise<void>;
  loading: boolean;
  onSubscribe?: () => void;
  subscribing?: boolean;
}

export const ChatView: React.FC<ChatViewProps> = ({
  user,
  messages,
  onBack,
  onSendMessage,
  onEditMessage,
  onUnsendMessage,
  onDeleteMessage,
  loading,
  onSubscribe,
  subscribing,
}) => {
  const isAdmin = Boolean(user?.is_admin);
  const isPremium = Boolean(user?.subscription?.active || isAdmin);

  // Admin / Sanya Inbox State
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConv, setSelectedConv] = useState<Conversation | null>(null);
  const [adminMsgs, setAdminMsgs] = useState<Message[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingConv, setLoadingConv] = useState(false);

  // Message Composer & Editing State
  const [input, setInput] = useState('');
  const [editingMsg, setEditingMsg] = useState<Message | null>(null);
  const [selectedMsg, setSelectedMsg] = useState<Message | null>(null);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Poll conversations & admin messages if Admin/Sanya
  const fetchConversations = async () => {
    if (!isAdmin) return;
    try {
      const res = await api.getConversations();
      setConversations(res.conversations);
    } catch (err) {
      console.error('Error fetching conversations:', err);
    }
  };

  const fetchAdminMessages = async (userId: number) => {
    try {
      const res = await api.getAdminMessages(userId);
      setAdminMsgs(res.messages);
    } catch (err) {
      console.error('Error fetching admin messages:', err);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      fetchConversations();
      const interval = setInterval(() => {
        fetchConversations();
        if (selectedConv) {
          fetchAdminMessages(selectedConv.user_id);
        }
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [isAdmin, selectedConv?.user_id]);

  const activeMessages = isAdmin && selectedConv ? adminMsgs : messages;

  useEffect(() => {
    scrollToBottom();
  }, [activeMessages, selectedConv]);

  const handleSelectConv = async (conv: Conversation) => {
    setSelectedConv(conv);
    setLoadingConv(true);
    await fetchAdminMessages(conv.user_id);
    setLoadingConv(false);
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;

    setSending(true);
    try {
      if (isAdmin && selectedConv) {
        if (editingMsg) {
          await onEditMessage(editingMsg.id, text);
        } else {
          await api.sendAdminMessage(selectedConv.user_id, text);
        }
        await fetchAdminMessages(selectedConv.user_id);
        await fetchConversations();
      } else {
        if (editingMsg) {
          await onEditMessage(editingMsg.id, text);
        } else {
          await onSendMessage(text);
        }
      }
      setInput('');
      setEditingMsg(null);
    } catch (err: any) {
      alert(err.message || 'Error sending message');
    } finally {
      setSending(false);
    }
  };

  const startEdit = (msg: Message) => {
    setEditingMsg(msg);
    setInput(msg.text);
    setSelectedMsg(null);
  };

  const cancelEdit = () => {
    setEditingMsg(null);
    setInput('');
  };

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text);
    setSelectedMsg(null);
  };

  const handleUnsend = async (msg: Message) => {
    setSelectedMsg(null);
    if (confirm('Unsend message for everyone?')) {
      if (isAdmin && selectedConv) {
        await api.deleteAdminMessage(msg.id);
        await fetchAdminMessages(selectedConv.user_id);
      } else {
        await onUnsendMessage(msg.id);
      }
    }
  };

  const formatDateGroup = (isoString: string) => {
    const d = new Date(isoString);
    return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatTime = (isoString: string) => {
    const d = new Date(isoString);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const currentUserId = user?.id || 10001;

  const filteredConversations = conversations.filter(
    (c) =>
      (c.first_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.username || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.last_message || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Paywall View for Unsubscribed Regular Users
  if (!isPremium) {
    return (
      <div className="flex-1 flex flex-col bg-slate-50 dark:bg-slate-950 overflow-y-auto p-5 relative animate-fade-in items-center justify-center">
        {/* Top Header */}
        <div className="w-full max-w-sm flex items-center mb-4">
          <button
            onClick={onBack}
            className="w-9 h-9 rounded-full flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 transition-all"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <span className="font-extrabold text-sm text-slate-900 dark:text-white ml-2">Back to Home</span>
        </div>

        {/* Sanya Paywall Card */}
        <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl p-6 border border-rose-100 dark:border-slate-800 shadow-xl text-center relative overflow-hidden">
          {/* Instagram Story Ring */}
          <div className="w-22 h-22 rounded-full p-[3px] bg-gradient-to-tr from-amber-500 via-rose-500 to-purple-600 mx-auto mb-3 shadow-lg shadow-rose-500/20">
            <div className="w-full h-full rounded-full bg-white dark:bg-slate-900 p-[2px] overflow-hidden">
              <div className="w-full h-full rounded-full bg-gradient-to-tr from-purple-600 via-pink-500 to-rose-500 flex items-center justify-center text-white font-black text-2xl">
                S
              </div>
            </div>
          </div>

          <h2 className="text-xl font-black text-slate-900 dark:text-white flex items-center justify-center gap-1.5">
            <span>Sanya Chouhan</span>
            <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-sky-500 text-white text-[9px] font-black">✓</span>
          </h2>
          <p className="text-xs font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-pink-500 mt-0.5">@sanyachouhaan_bot</p>

          <div className="my-5 p-4 rounded-2xl bg-rose-50/70 dark:bg-rose-950/40 border border-rose-200/80 dark:border-rose-900/80 text-left space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-rose-800 dark:text-rose-300">
              <Lock className="w-4 h-4 text-rose-500 flex-shrink-0" />
              <span>Private Chat Locked</span>
            </div>
            <p className="text-xs text-rose-950 dark:text-rose-200/90 leading-relaxed font-medium">
              Subscribe with 199 Stars to unlock direct 1-on-1 private messaging with Sanya Chouhan.
            </p>
          </div>

          <button
            onClick={onSubscribe}
            disabled={subscribing}
            className="w-full py-4 px-5 rounded-2xl bg-gradient-to-r from-purple-600 via-pink-500 to-amber-500 hover:opacity-95 text-white font-black text-sm shadow-xl shadow-pink-500/25 flex items-center justify-center gap-2 active:scale-97 transition-all disabled:opacity-60"
          >
            <Star className="w-4 h-4 fill-current text-amber-200 animate-bounce" />
            <span>{subscribing ? 'Processing…' : 'Subscribe · 199 Stars'}</span>
          </button>
        </div>
      </div>
    );
  }

  // Render Conversations List in Messages Page for Admin/Sanya if no conversation selected
  if (isAdmin && !selectedConv) {
    return (
      <div className="flex-1 flex flex-col bg-slate-50 dark:bg-slate-950 overflow-hidden relative animate-fade-in">
        {/* Messages List Top Header */}
        <div className="h-16 px-4 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border-b border-slate-200/80 dark:border-slate-800/80 flex items-center gap-3 sticky top-0 z-30 shadow-sm">
          <button
            onClick={onBack}
            className="w-9 h-9 rounded-full flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 active:scale-95 transition-all"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <div className="flex-1 min-w-0">
            <h2 className="font-extrabold text-base text-slate-900 dark:text-white leading-none">
              Messages
            </h2>
            <p className="text-xs text-indigo-600 dark:text-indigo-400 font-medium mt-0.5">
              All User Conversations ({conversations.length})
            </p>
          </div>
        </div>

        {/* Search Bar */}
        <div className="px-4 py-3 bg-white dark:bg-slate-900 border-b border-slate-200/60 dark:border-slate-800/60">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search user messages…"
              className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pl-10 pr-4 py-2 text-xs text-slate-900 dark:text-white placeholder-slate-400 outline-none focus:border-indigo-500 transition-all font-medium"
            />
          </div>
        </div>

        {/* Conversations Feed */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {filteredConversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-6 text-slate-400 dark:text-slate-500 py-12">
              <div className="w-16 h-16 rounded-full bg-indigo-50 dark:bg-slate-900 flex items-center justify-center mb-3">
                <MessageSquare className="w-8 h-8 text-indigo-500" />
              </div>
              <p className="font-bold text-slate-700 dark:text-slate-300 text-base">No user messages yet</p>
              <p className="text-xs mt-1 max-w-xs">When users send messages to Sanya, they will appear right here in your Messages page.</p>
            </div>
          ) : (
            filteredConversations.map((conv) => (
              <div
                key={conv.user_id}
                onClick={() => handleSelectConv(conv)}
                className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 flex items-center gap-3.5 hover:border-indigo-300 dark:hover:border-indigo-800 cursor-pointer active:scale-99 transition-all shadow-sm"
              >
                <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500 text-white font-extrabold text-base flex items-center justify-center overflow-hidden flex-shrink-0 shadow-sm">
                  {conv.avatar_url ? (
                    <img src={conv.avatar_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    (conv.first_name || 'U').charAt(0).toUpperCase()
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-extrabold text-sm text-slate-900 dark:text-white truncate flex items-center gap-1.5">
                      {conv.first_name || `User #${conv.user_id}`}
                      {conv.is_premium && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 font-bold">
                          ★ Premium
                        </span>
                      )}
                      {conv.is_banned && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-rose-100 text-rose-800 font-bold">
                          Banned
                        </span>
                      )}
                    </span>
                    <span className="text-[10px] text-slate-400 font-medium">
                      {new Date(conv.last_message_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[220px]">
                      {conv.last_message}
                    </p>

                    {conv.unread_count > 0 && (
                      <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] font-black flex items-center justify-center animate-pulse">
                        {conv.unread_count}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  // Active Chat View (Regular User OR Admin Chatting with Selected User)
  const chatPartnerName = isAdmin && selectedConv ? (selectedConv.first_name || `User #${selectedConv.user_id}`) : 'Sanya Chouhan';
  const chatPartnerAvatar = isAdmin && selectedConv ? selectedConv.avatar_url : null;
  const chatPartnerInitial = chatPartnerName.charAt(0).toUpperCase();

  return (
    <div className="flex-1 flex flex-col bg-slate-50 dark:bg-slate-950 overflow-hidden relative">
      {/* Chat Top Header */}
      <div className="h-16 px-4 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border-b border-slate-200/80 dark:border-slate-800/80 flex items-center gap-3 sticky top-0 z-30 shadow-sm">
        <button
          onClick={() => {
            if (isAdmin && selectedConv) {
              setSelectedConv(null);
            } else {
              onBack();
            }
          }}
          className="w-9 h-9 rounded-full flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 active:scale-95 transition-all"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center text-white font-extrabold text-sm overflow-hidden shadow-sm">
          {chatPartnerAvatar ? (
            <img src={chatPartnerAvatar} alt="" className="w-full h-full object-cover" />
          ) : (
            chatPartnerInitial
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="font-extrabold text-sm text-slate-900 dark:text-white truncate">
            {chatPartnerName}
          </div>
          <div className="text-xs text-indigo-600 dark:text-indigo-400 font-medium flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            {isAdmin ? `ID: ${selectedConv?.user_id}` : 'Private Messaging'}
          </div>
        </div>
      </div>

      {/* Messages Feed */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {activeMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-6 text-slate-400 dark:text-slate-500">
            <div className="w-16 h-16 rounded-full bg-indigo-50 dark:bg-slate-900 flex items-center justify-center mb-3">
              <Send className="w-8 h-8 text-indigo-500" />
            </div>
            <p className="font-bold text-slate-700 dark:text-slate-300 text-base">No messages yet</p>
            <p className="text-xs mt-1 max-w-xs">
              {isAdmin
                ? `Send a message to ${chatPartnerName}.`
                : 'Send a private message to Sanya. Messages are securely stored.'}
            </p>
          </div>
        ) : (
          activeMessages.map((msg, index) => {
            const isMine = isAdmin ? msg.sender_id === 10001 : msg.sender_id === currentUserId;
            const prevMsg = activeMessages[index - 1];
            const showDate = !prevMsg || formatDateGroup(prevMsg.created_at) !== formatDateGroup(msg.created_at);

            return (
              <React.Fragment key={msg.id}>
                {showDate && (
                  <div className="flex items-center justify-center my-3">
                    <span className="px-3 py-1 rounded-full bg-slate-200/80 dark:bg-slate-800/80 text-[11px] font-bold text-slate-600 dark:text-slate-400">
                      {formatDateGroup(msg.created_at)}
                    </span>
                  </div>
                )}

                <div className={`flex flex-col ${isMine ? 'items-end' : 'items-start'} group`}>
                  <div
                    onClick={() => setSelectedMsg(msg)}
                    className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed transition-all cursor-pointer relative ${
                      msg.deleted_at
                        ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 italic border border-slate-200 dark:border-slate-700'
                        : isMine
                        ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-br-xs shadow-md shadow-indigo-500/15'
                        : 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 rounded-bl-xs border border-slate-200/90 dark:border-slate-800 shadow-sm'
                    }`}
                  >
                    {msg.deleted_at ? (
                      <span>This message was unsent</span>
                    ) : (
                      <span>{msg.text}</span>
                    )}

                    {/* Metadata: time, edited badge, read ticks */}
                    <div className={`flex items-center gap-1 mt-1 text-[10px] font-medium ${isMine ? 'justify-end text-indigo-100' : 'text-slate-400 dark:text-slate-500'}`}>
                      {msg.edited_at && !msg.deleted_at && <span>edited · </span>}
                      <span>{formatTime(msg.created_at)}</span>

                      {isMine && !msg.deleted_at && (
                        msg.seen_at ? (
                          <CheckCheck className="w-3.5 h-3.5 text-emerald-300" title="Seen" />
                        ) : (
                          <Check className="w-3.5 h-3.5 text-indigo-200" title="Sent" />
                        )
                      )}
                    </div>
                  </div>
                </div>
              </React.Fragment>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Editing Banner */}
      {editingMsg && (
        <div className="px-4 py-2 bg-indigo-50 dark:bg-indigo-950/80 border-t border-indigo-200 dark:border-indigo-800 flex items-center justify-between text-xs text-indigo-700 dark:text-indigo-300 font-bold">
          <div className="flex items-center gap-2 truncate">
            <Edit2 className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="truncate">Editing message: "{editingMsg.text}"</span>
          </div>
          <button onClick={cancelEdit} className="p-1 hover:bg-indigo-100 dark:hover:bg-indigo-900 rounded-full">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Bottom Composer Bar */}
      <div className="p-3 bg-white dark:bg-slate-900 border-t border-slate-200/80 dark:border-slate-800 flex items-end gap-2 sticky bottom-0 z-20 pb-safe">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder={isAdmin ? `Reply to ${chatPartnerName}…` : 'Write a message…'}
          rows={1}
          maxLength={4000}
          className="flex-1 bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 outline-none focus:border-indigo-500 focus:bg-white dark:focus:bg-slate-800 transition-all resize-none max-h-32 font-medium"
        />

        <button
          onClick={handleSend}
          disabled={!input.trim() || sending}
          className="w-11 h-11 rounded-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white flex items-center justify-center shadow-md shadow-indigo-500/20 hover:opacity-95 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>

      {/* Context Menu Sheet */}
      {selectedMsg && (
        <div 
          onClick={() => setSelectedMsg(null)}
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-end sm:items-center justify-center p-4 animate-fade-in"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-2 animate-slide-up"
          >
            <div className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2 px-1">
              Message Options
            </div>

            <button
              onClick={() => copyText(selectedMsg.text)}
              className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold text-sm transition-colors"
            >
              <Copy className="w-4 h-4 text-indigo-500" />
              <span>Copy Text</span>
            </button>

            {((isAdmin && selectedMsg.sender_id === 10001) || (!isAdmin && selectedMsg.sender_id === currentUserId)) && !selectedMsg.deleted_at && (
              <>
                <button
                  onClick={() => startEdit(selectedMsg)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold text-sm transition-colors"
                >
                  <Edit2 className="w-4 h-4 text-amber-500" />
                  <span>Edit Message</span>
                </button>

                <button
                  onClick={() => handleUnsend(selectedMsg)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600 dark:text-rose-400 font-semibold text-sm transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Unsend (Delete for Everyone)</span>
                </button>
              </>
            )}

            <button
              onClick={() => setSelectedMsg(null)}
              className="w-full py-2.5 mt-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-bold text-sm text-center"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

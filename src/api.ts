import { UserProfile, Message, Conversation, AdminUser, AdminStats } from './types';

// Helper to extract Telegram WebApp initData if available
function getHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  const tg = (window as any).Telegram?.WebApp;
  if (tg?.initData) {
    headers['x-telegram-init-data'] = tg.initData;
  }
  return headers;
}

export const api = {
  async getMe(): Promise<UserProfile> {
    const res = await fetch('/api/me', { headers: getHeaders() });
    if (!res.ok) throw new Error('Failed to load user profile');
    return res.json();
  },

  async getMessages(): Promise<{ messages: Message[] }> {
    const res = await fetch('/api/messages', { headers: getHeaders() });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to fetch messages');
    }
    return res.json();
  },

  async sendMessage(text: string): Promise<{ ok: boolean }> {
    const res = await fetch('/api/messages', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ text }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to send message');
    }
    return res.json();
  },

  async editMessage(id: number, text: string): Promise<{ ok: boolean }> {
    const res = await fetch(`/api/messages/${id}`, {
      method: 'PATCH',
      headers: getHeaders(),
      body: JSON.stringify({ text }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to edit message');
    }
    return res.json();
  },

  async unsendMessage(id: number): Promise<{ ok: boolean }> {
    const res = await fetch(`/api/messages/${id}/unsend`, {
      method: 'POST',
      headers: getHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to unsend message');
    }
    return res.json();
  },

  async deleteMessage(id: number): Promise<{ ok: boolean }> {
    const res = await fetch(`/api/messages/${id}`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to delete message');
    }
    return res.json();
  },

  async updateProfile(data: {
    first_name?: string;
    bio?: string;
    username?: string;
    avatar_data_url?: string;
  }): Promise<{ ok: boolean }> {
    const res = await fetch('/api/profile', {
      method: 'PATCH',
      headers: getHeaders(),
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to update profile');
    return res.json();
  },

  async createInvoice(): Promise<{ ok: boolean; invoice_url?: string }> {
    const res = await fetch('/api/create-invoice', {
      method: 'POST',
      headers: getHeaders(),
    });
    if (!res.ok) throw new Error('Failed to create invoice');
    return res.json();
  },

  // Admin Endpoints
  async getConversations(): Promise<{ conversations: Conversation[] }> {
    const res = await fetch('/api/conversations', { headers: getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch conversations');
    return res.json();
  },

  async getAdminMessages(userId: number): Promise<{ messages: Message[] }> {
    const res = await fetch(`/api/admin-messages?user_id=${userId}`, {
      headers: getHeaders(),
    });
    if (!res.ok) throw new Error('Failed to fetch admin messages');
    return res.json();
  },

  async sendAdminMessage(userId: number, text: string): Promise<{ ok: boolean }> {
    const res = await fetch('/api/admin-messages', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ user_id: userId, text }),
    });
    if (!res.ok) throw new Error('Failed to send admin message');
    return res.json();
  },

  async deleteAdminMessage(id: number): Promise<{ ok: boolean }> {
    const res = await fetch(`/api/admin-messages/${id}`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    if (!res.ok) throw new Error('Failed to delete message');
    return res.json();
  },

  async getAdminUsers(): Promise<{ users: AdminUser[] }> {
    const res = await fetch('/api/admin-users', { headers: getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch users');
    return res.json();
  },

  async getAdminStats(): Promise<AdminStats> {
    const res = await fetch('/api/admin-stats', { headers: getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch stats');
    return res.json();
  },

  async adminGrant(userId: number): Promise<{ ok: boolean }> {
    const res = await fetch('/api/admin-grant', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ user_id: userId }),
    });
    if (!res.ok) throw new Error('Failed to grant premium');
    return res.json();
  },

  async adminBan(userId: number): Promise<{ ok: boolean }> {
    const res = await fetch('/api/admin-ban', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ user_id: userId }),
    });
    if (!res.ok) throw new Error('Failed to ban user');
    return res.json();
  },

  async adminUnban(userId: number): Promise<{ ok: boolean }> {
    const res = await fetch('/api/admin-unban', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ user_id: userId }),
    });
    if (!res.ok) throw new Error('Failed to unban user');
    return res.json();
  },
};

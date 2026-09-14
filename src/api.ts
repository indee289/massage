import { UserProfile, Message, Conversation, AdminUser, AdminStats } from './types';

/*
|--------------------------------------------------------------------------
| SUPABASE EDGE FUNCTION
|--------------------------------------------------------------------------
|
| Use the existing Supabase backend directly.
|
| This is important because the frontend may be hosted on GitHub Pages
| or another static host where /api/... does not exist.
|
*/

const API_BASE =
  'https://emqseukhovnzgrmsvlag.supabase.co/functions/v1/api';

/*
|--------------------------------------------------------------------------
| TELEGRAM INIT DATA
|--------------------------------------------------------------------------
*/

function getHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  try {
    if (typeof window !== 'undefined') {
      const tg = (window as any).Telegram?.WebApp;

      if (
        tg &&
        typeof tg.initData === 'string' &&
        tg.initData.length > 0
      ) {
        headers['x-telegram-init-data'] = tg.initData;
      }
    }
  } catch {
    // Ignore Telegram WebApp access errors.
  }

  return headers;
}

/*
|--------------------------------------------------------------------------
| RESPONSE ERROR HELPER
|--------------------------------------------------------------------------
*/

async function getErrorMessage(
  response: Response,
  fallback: string,
): Promise<string> {
  try {
    const data = await response.json();

    if (typeof data?.error === 'string' && data.error.length > 0) {
      return data.error;
    }

    if (
      typeof data?.message === 'string' &&
      data.message.length > 0
    ) {
      return data.message;
    }

    return fallback;
  } catch {
    return fallback;
  }
}

/*
|--------------------------------------------------------------------------
| API
|--------------------------------------------------------------------------
*/

export const api = {
  /*
   * ---------------------------------------------------------
   * CURRENT USER
   * ---------------------------------------------------------
   */

  async getMe(): Promise<UserProfile> {
    const res = await fetch(`${API_BASE}/me`, {
      method: 'GET',
      headers: getHeaders(),
    });

    if (!res.ok) {
      throw new Error(
        await getErrorMessage(
          res,
          'Failed to load user profile',
        ),
      );
    }

    const data = await res.json();

    if (data.me) {
      return {
        ...data.me,
        owner: data.owner,
      };
    }

    return data;
  },

  /*
   * ---------------------------------------------------------
   * MESSAGES
   * ---------------------------------------------------------
   */

  async getMessages(): Promise<{ messages: Message[] }> {
    const res = await fetch(`${API_BASE}/messages`, {
      method: 'GET',
      headers: getHeaders(),
    });

    if (!res.ok) {
      throw new Error(
        await getErrorMessage(
          res,
          'Failed to fetch messages',
        ),
      );
    }

    return res.json();
  },

  async sendMessage(
    text: string,
  ): Promise<{ ok: boolean }> {
    const res = await fetch(`${API_BASE}/messages`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        text,
      }),
    });

    if (!res.ok) {
      throw new Error(
        await getErrorMessage(
          res,
          'Failed to send message',
        ),
      );
    }

    return res.json();
  },

  async editMessage(
    id: string,
    text: string,
  ): Promise<{ ok: boolean }> {
    const res = await fetch(
      `${API_BASE}/messages/${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        headers: getHeaders(),
        body: JSON.stringify({
          text,
        }),
      },
    );

    if (!res.ok) {
      throw new Error(
        await getErrorMessage(
          res,
          'Failed to edit message',
        ),
      );
    }

    return res.json();
  },

  async unsendMessage(
    id: string,
  ): Promise<{ ok: boolean }> {
    const res = await fetch(
      `${API_BASE}/messages/${encodeURIComponent(id)}/unsend`,
      {
        method: 'POST',
        headers: getHeaders(),
      },
    );

    if (!res.ok) {
      throw new Error(
        await getErrorMessage(
          res,
          'Failed to unsend message',
        ),
      );
    }

    return res.json();
  },

  async deleteMessage(
    id: string,
  ): Promise<{ ok: boolean }> {
    const res = await fetch(
      `${API_BASE}/messages/${encodeURIComponent(id)}`,
      {
        method: 'DELETE',
        headers: getHeaders(),
      },
    );

    if (!res.ok) {
      throw new Error(
        await getErrorMessage(
          res,
          'Failed to delete message',
        ),
      );
    }

    return res.json();
  },

  /*
   * ---------------------------------------------------------
   * PROFILE
   * ---------------------------------------------------------
   */

  async updateProfile(data: {
    first_name?: string;
    bio?: string;
    username?: string;
    avatar_data_url?: string;
  }): Promise<{ ok: boolean }> {
    const res = await fetch(`${API_BASE}/profile`, {
      method: 'PATCH',
      headers: getHeaders(),
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      throw new Error(
        await getErrorMessage(
          res,
          'Failed to update profile',
        ),
      );
    }

    return res.json();
  },

  /*
   * ---------------------------------------------------------
   * TELEGRAM STARS
   * ---------------------------------------------------------
   *
   * Premium:
   * 199 Telegram Stars
   * 30 days
   * One-time payment
   *
   * The actual invoice is created server-side by
   * the Supabase Edge Function.
   */

  async createInvoice(): Promise<{
    ok: boolean;
    invoice_url?: string;
  }> {
    const headers = getHeaders();

    /*
     * Make sure the app is actually running inside Telegram
     * with valid initData before asking the backend to create
     * a user-specific invoice.
     */

    if (
      !headers['x-telegram-init-data']
    ) {
      throw new Error(
        'Telegram login data is missing. Please open this Mini App from Telegram.',
      );
    }

    const res = await fetch(
      `${API_BASE}/create-invoice`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({}),
      },
    );

    const data = await res.json().catch(
      () => ({}),
    );

    if (!res.ok) {
      throw new Error(
        data?.error ||
          data?.message ||
          `Failed to create invoice (${res.status})`,
      );
    }

    if (
      !data?.invoice_url ||
      typeof data.invoice_url !== 'string'
    ) {
      throw new Error(
        'Invoice was not returned by the payment server.',
      );
    }

    return data;
  },

  /*
   * ---------------------------------------------------------
   * ADMIN
   * ---------------------------------------------------------
   */

  async getConversations(): Promise<{
    conversations: Conversation[];
  }> {
    const res = await fetch(
      `${API_BASE}/conversations`,
      {
        method: 'GET',
        headers: getHeaders(),
      },
    );

    if (!res.ok) {
      throw new Error(
        await getErrorMessage(
          res,
          'Failed to fetch conversations',
        ),
      );
    }

    return res.json();
  },

  async getAdminMessages(
    userId: number,
  ): Promise<{ messages: Message[] }> {
    const res = await fetch(
      `${API_BASE}/admin-messages?user_id=${encodeURIComponent(
        userId,
      )}`,
      {
        method: 'GET',
        headers: getHeaders(),
      },
    );

    if (!res.ok) {
      throw new Error(
        await getErrorMessage(
          res,
          'Failed to fetch admin messages',
        ),
      );
    }

    return res.json();
  },

  async sendAdminMessage(
    userId: number,
    text: string,
  ): Promise<{ ok: boolean }> {
    const res = await fetch(
      `${API_BASE}/admin-messages`,
      {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          user_id: userId,
          text,
        }),
      },
    );

    if (!res.ok) {
      throw new Error(
        await getErrorMessage(
          res,
          'Failed to send admin message',
        ),
      );
    }

    return res.json();
  },

  async deleteAdminMessage(
    id: string,
  ): Promise<{ ok: boolean }> {
    const res = await fetch(
      `${API_BASE}/admin-messages/${encodeURIComponent(id)}`,
      {
        method: 'DELETE',
        headers: getHeaders(),
      },
    );

    if (!res.ok) {
      throw new Error(
        await getErrorMessage(
          res,
          'Failed to delete message',
        ),
      );
    }

    return res.json();
  },

  async getAdminUsers(): Promise<{
    users: AdminUser[];
  }> {
    const res = await fetch(
      `${API_BASE}/admin-users`,
      {
        method: 'GET',
        headers: getHeaders(),
      },
    );

    if (!res.ok) {
      throw new Error(
        await getErrorMessage(
          res,
          'Failed to fetch users',
        ),
      );
    }

    return res.json();
  },

  async getAdminStats(): Promise<AdminStats> {
    const res = await fetch(
      `${API_BASE}/admin-stats`,
      {
        method: 'GET',
        headers: getHeaders(),
      },
    );

    if (!res.ok) {
      throw new Error(
        await getErrorMessage(
          res,
          'Failed to fetch stats',
        ),
      );
    }

    return res.json();
  },

  async adminGrant(
    userId: number,
  ): Promise<{ ok: boolean }> {
    const res = await fetch(
      `${API_BASE}/admin-grant`,
      {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          user_id: userId,
        }),
      },
    );

    if (!res.ok) {
      throw new Error(
        await getErrorMessage(
          res,
          'Failed to grant premium',
        ),
      );
    }

    return res.json();
  },

  async adminBan(
    userId: number,
  ): Promise<{ ok: boolean }> {
    const res = await fetch(
      `${API_BASE}/admin-ban`,
      {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          user_id: userId,
        }),
      },
    );

    if (!res.ok) {
      throw new Error(
        await getErrorMessage(
          res,
          'Failed to ban user',
        ),
      );
    }

    return res.json();
  },

  async adminUnban(
    userId: number,
  ): Promise<{ ok: boolean }> {
    const res = await fetch(
      `${API_BASE}/admin-unban`,
      {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          user_id: userId,
        }),
      },
    );

    if (!res.ok) {
      throw new Error(
        await getErrorMessage(
          res,
          'Failed to unban user',
        ),
      );
    }

    return res.json();
  },
};

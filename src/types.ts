export interface OwnerProfile {
  id: number;
  first_name: string;
  username: string;
  bio: string;
  avatar_url: string | null;
}

export interface UserProfile {
  id: number;
  first_name: string | null;
  last_name: string | null;
  username: string | null;
  bio: string;
  avatar_url: string | null;
  is_admin: boolean;
  subscription: {
    active: boolean;
    lifetime: boolean;
    start: string | null;
    end: string | null;
  } | null;
  owner?: OwnerProfile;
}

export interface Message {
  id: string;
  user_id: number;
  sender_id: number;
  text: string;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  seen_at: string | null;
}

export interface Conversation {
  user_id: number;
  last_message: string;
  last_message_at: string;
  unread_count: number;
  first_name: string | null;
  username: string | null;
  avatar_url: string | null;
  is_banned: boolean;
  is_premium: boolean;
}

export interface AdminUser {
  id: number;
  user_id: number;
  first_name: string | null;
  last_name: string | null;
  username: string | null;
  bio: string | null;
  avatar_url: string | null;
  photo_url: string | null;
  is_banned: boolean;
  created_at: string;
  subscription: {
    active: boolean;
    lifetime: boolean;
    end: string | null;
  } | null;
}

export interface AdminStats {
  total_users: number;
  premium_users: number;
  total_messages: number;
  banned_users: number;
  active_today: number;
  revenue_stars: number;
}

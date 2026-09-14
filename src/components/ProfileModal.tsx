import React, { useState } from 'react';
import { X, Camera, User, AtSign, FileText } from 'lucide-react';
import { UserProfile } from '../types';

interface ProfileModalProps {
  user: UserProfile | null;
  onClose: () => void;
  onSave: (data: {
    first_name?: string;
    bio?: string;
    username?: string;
    avatar_data_url?: string;
  }) => Promise<void>;
}

export const ProfileModal: React.FC<ProfileModalProps> = ({
  user,
  onClose,
  onSave,
}) => {
  const [firstName, setFirstName] = useState(user?.first_name || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [username, setUsername] = useState(user?.username || '');

  // IMPORTANT:
  // Existing avatar_url is NOT treated as a new uploaded photo.
  const [avatarPreview, setAvatarPreview] = useState<string | null>(
    user?.avatar_url || null
  );

  const [avatarDataUrl, setAvatarDataUrl] = useState<string | undefined>(
    undefined
  );

  const [saving, setSaving] = useState(false);

  const handleFileChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please select an image.');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert('Image must be smaller than 5MB.');
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      const result = reader.result as string;

      // Preview
      setAvatarPreview(result);

      // ONLY this newly selected image is sent to backend.
      setAvatarDataUrl(result);
    };

    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!firstName.trim()) {
      alert('Please enter your display name.');
      return;
    }

    setSaving(true);

    try {
      const data: {
        first_name: string;
        bio: string;
        username: string;
        avatar_data_url?: string;
      } = {
        first_name: firstName.trim(),
        bio: bio.trim(),
        username: username.trim().replace(/^@/, ''),
      };

      // IMPORTANT:
      // Don't send existing Telegram/backend avatar.
      // Send avatar only when user actually selected a new photo.
      if (avatarDataUrl) {
        data.avatar_data_url = avatarDataUrl;
      }

      await onSave(data);

      onClose();
    } catch (err: any) {
      alert(err?.message || 'Error updating profile');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-5 animate-slide-up"
      >
        <div className="w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-700 mx-auto -mt-2 sm:hidden" />

        <div className="flex items-center justify-between">
          <h3 className="font-extrabold text-lg text-slate-900 dark:text-white">
            Edit Profile
          </h3>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Avatar */}
        <div className="flex flex-col items-center">
          <div className="relative">
            <div className="w-24 h-24 rounded-full p-[3px] bg-gradient-to-tr from-amber-500 via-rose-500 to-purple-600 shadow-lg">
              <div className="w-full h-full rounded-full bg-white dark:bg-slate-900 p-[2px] overflow-hidden">
                {avatarPreview ? (
                  <img
                    src={avatarPreview}
                    alt=""
                    className="w-full h-full object-cover rounded-full"
                  />
                ) : (
                  <div className="w-full h-full rounded-full bg-gradient-to-tr from-purple-600 via-pink-500 to-rose-500 flex items-center justify-center text-white font-black text-3xl">
                    {(firstName || 'U').charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
            </div>

            <label
              htmlFor="avatarInput"
              className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-gradient-to-r from-purple-600 to-pink-500 text-white flex items-center justify-center shadow-md cursor-pointer"
            >
              <Camera className="w-4 h-4" />
            </label>

            <input
              type="file"
              id="avatarInput"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>

          <span className="text-xs font-bold text-pink-600 dark:text-pink-400 mt-2">
            Change Photo
          </span>
        </div>

        {/* Display Name */}
        <div className="space-y-1">
          <label className="text-xs font-bold text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
            <User className="w-3.5 h-3.5" />
            Display Name
          </label>

          <input
            type="text"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="Your Name"
            maxLength={64}
            className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-white outline-none focus:border-indigo-500 font-medium"
          />
        </div>

        {/* Bio */}
        <div className="space-y-1">
          <label className="text-xs font-bold text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5" />
            Bio
          </label>

          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Tell something about yourself…"
            maxLength={160}
            rows={3}
            className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 text-sm text-slate-900 dark:text-white outline-none focus:border-indigo-500 resize-none font-medium"
          />
        </div>

        {/* Username */}
        <div className="space-y-1">
          <label className="text-xs font-bold text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
            <AtSign className="w-3.5 h-3.5" />
            Username
          </label>

          <input
            type="text"
            value={username}
            onChange={(e) =>
              setUsername(e.target.value.replace(/^@/, ''))
            }
            placeholder="username"
            maxLength={32}
            className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-white outline-none focus:border-indigo-500 font-medium"
          />
        </div>

        {/* Buttons */}
        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={onClose}
            disabled={saving}
            className="flex-1 py-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-bold text-sm"
          >
            Cancel
          </button>

          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-3 rounded-xl bg-gradient-to-r from-purple-600 via-pink-500 to-rose-500 text-white font-extrabold text-sm shadow-md disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
};

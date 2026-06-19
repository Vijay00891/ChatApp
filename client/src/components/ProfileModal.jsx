import React, { useRef, useState } from 'react';
import Avatar from './Avatar';
import { Camera, X, Loader2 } from 'lucide-react';
import { usersAPI } from '../lib/api';
import { useAuth } from '../context/AuthContext';

export default function ProfileModal({ isOpen, onClose }) {
  const { user, updateUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef(null);

  if (!isOpen || !user) return null;

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  const resizeImage = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const maxDim = 512;
          let { width, height } = img;

          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL(file.type || 'image/jpeg', 0.8));
        };
        img.onerror = () => reject(new Error('Image load error'));
        img.src = e.target.result;
      };
      reader.onerror = () => reject(new Error('File read error'));
      reader.readAsDataURL(file);
    });
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please select an image file.');
      return;
    }

    try {
      setLoading(true);
      const base64 = await resizeImage(file);
      const res = await usersAPI.updateProfile({ avatar: base64 });
      updateUser({ avatar: res.data.user.avatar });
    } catch (err) {
      console.error('Failed to update avatar:', err);
      alert('Failed to update avatar. Please try again.');
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-fade-in"
      onClick={handleOverlayClick}
    >
      <div className="bg-surface rounded-2xl w-full max-w-md shadow-xl flex flex-col overflow-hidden animate-slide-up relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full hover:bg-hover-bg text-subtle-text hover:text-text transition-colors z-10"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="p-6 flex flex-col items-center">
          <h2 className="text-xl font-bold mb-6 text-text font-ui">Profile Details</h2>
          
          <div className="relative group cursor-pointer mb-6" onClick={() => fileInputRef.current?.click()}>
            <Avatar name={user.name} src={user.avatar || ''} size={200} />
            <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              {loading ? (
                <Loader2 className="w-10 h-10 text-white animate-spin" />
              ) : (
                <div className="flex flex-col items-center text-white">
                  <Camera className="w-8 h-8 mb-2" />
                  <span className="text-sm font-medium">Change Photo</span>
                </div>
              )}
            </div>
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileChange} 
              accept="image/*" 
              className="hidden" 
            />
          </div>

          <div className="w-full text-center">
            <h3 className="text-2xl font-bold text-text mb-1">{user.name}</h3>
            <p className="text-subtle-text mb-6">{user.email}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

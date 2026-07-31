import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

const BASE_URL = process.env.EXPO_PUBLIC_SERVER_URL || 'https://chatapp-lewz.onrender.com';

const api = axios.create({
  baseURL: `${BASE_URL}/api`,
  withCredentials: true,
});

api.interceptors.request.use(async (config) => {
  try {
    const token = await SecureStore.getItemAsync('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  } catch (err) {
    console.warn('Error reading token from SecureStore', err);
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    if (err.response?.status === 401) {
      await SecureStore.deleteItemAsync('token');
    }
    return Promise.reject(err);
  }
);

export default api;

export const authAPI = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  getMe: () => api.get('/auth/me'),
};

export const usersAPI = {
  search: (query) => api.get(`/users/search?q=${encodeURIComponent(query)}`),
  getContacts: () => api.get('/users/contacts'),
  addContact: (userId) => api.post(`/users/contacts/${userId}`),
  getAll: () => api.get('/users'),
  updateProfile: (data) => api.put('/users/profile', data),
};

export const roomsAPI = {
  getAll: () => api.get('/rooms'),
  createDM: (userId) => api.post('/rooms/dm', { targetUserId: userId }),
  createGroup: (name, memberIds) => api.post('/rooms/group', { name, memberIds }),
  update: (roomId, data) => api.put(`/rooms/${roomId}`, data),
  addMember: (roomId, userId) => api.post(`/rooms/${roomId}/members`, { userId }),
  removeMember: (roomId, userId) => api.delete(`/rooms/${roomId}/members/${userId}`),
};

export const notificationsAPI = {
  getVapidPublicKey: () => api.get('/notifications/vapidPublicKey'),
  subscribe: (subscription) => api.post('/notifications/subscribe', subscription),
};

export const messagesAPI = {
  getByRoom: (roomId, page = 1) => api.get(`/messages/${roomId}?page=${page}`),
  uploadAttachment: (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/messages/attachment', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};

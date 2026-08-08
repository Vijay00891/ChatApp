import axios from 'axios';

const BASE_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:5000';

const api = axios.create({
  baseURL: `${BASE_URL}/api`,
  withCredentials: false,
});

// Attach JWT token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 globally
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default api;

// --- Auth ---
export const authAPI = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  getMe: () => api.get('/auth/me'),
};

// --- Users ---
export const usersAPI = {
  search: (query) => api.get(`/users/search?q=${encodeURIComponent(query)}`),
  updateProfile: (data) => api.put('/users/profile', data),
  block: (userId) => api.post(`/users/block/${userId}`),
  unblock: (userId) => api.post(`/users/unblock/${userId}`),
};

// --- Rooms ---
export const roomsAPI = {
  getAll: () => api.get('/rooms'),
  getById: (id) => api.get(`/rooms/${id}`),
  createDM: (memberId) => api.post('/rooms/dm', { memberId }),
  createGroup: (data) => api.post('/rooms/group', data),
  updateGroup: (id, data) => api.put(`/rooms/group/${id}`, data),
  addMember: (id, memberId) => api.post(`/rooms/group/${id}/add`, { memberId }),
  removeMember: (id, memberId) => api.post(`/rooms/group/${id}/remove`, { memberId }),
  archive: (id) => api.post(`/rooms/${id}/archive`),
  mute: (id) => api.post(`/rooms/${id}/mute`),
};

// --- Notifications ---
export const notificationsAPI = {
  getVapidPublicKey: () => api.get('/notifications/vapidPublicKey'),
  subscribe: (subscription) => api.post('/notifications/subscribe', subscription),
};

// --- Messages ---
export const messagesAPI = {
  getByRoom: (roomId, page = 1) => api.get(`/messages/${roomId}?page=${page}`),
  send: (data) => api.post('/messages', data),
  getPreview: (url) => api.get(`/messages/preview?url=${encodeURIComponent(url)}`),
};

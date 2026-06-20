import { useCallback, useEffect, useState } from 'react';
import { notificationsAPI } from '../lib/api';

// Utility to convert Base64 string to Uint8Array
const urlBase64ToUint8Array = (base64String) => {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
};

export function useNotification() {
  const [permission, setPermission] = useState('default');

  const subscribeToPush = async () => {
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
      const registration = await navigator.serviceWorker.ready;
      
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        const { data } = await notificationsAPI.getVapidPublicKey();
        const convertedVapidKey = urlBase64ToUint8Array(data.publicKey);
        
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: convertedVapidKey
        });
      }
      
      // Send to backend
      await notificationsAPI.subscribe(subscription);
    } catch (err) {
      console.error('Failed to subscribe to push notifications:', err);
    }
  };

  // Request notification permission on first load
  useEffect(() => {
    if (!('Notification' in window)) {
      console.warn('Notifications not supported in this browser');
      return;
    }

    setPermission(Notification.permission);

    if (Notification.permission === 'granted') {
      subscribeToPush();
    } else if (Notification.permission === 'default') {
      Notification.requestPermission().then((p) => {
        setPermission(p);
        if (p === 'granted') {
          subscribeToPush();
        }
      });
    }
  }, []);

  // Send a notification with sender name and message content (foreground fallback)
  const sendNotification = useCallback((senderName, messageContent, options = {}) => {
    if (Notification.permission !== 'granted') return;

    // Try to use service worker if available, otherwise fallback to standard Notification
    navigator.serviceWorker.ready.then(registration => {
      registration.showNotification(`Message from ${senderName}`, {
        body: messageContent,
        icon: '/favicon.svg',
        badge: '/favicon.svg',
        tag: 'message-notification',
        ...options,
      });
    }).catch(() => {
      try {
        const title = `Message from ${senderName}`;
        const notificationOptions = {
          body: messageContent,
          icon: '/favicon.svg',
          tag: 'message-notification',
          ...options,
        };
        const notification = new Notification(title, notificationOptions);
        notification.onclick = () => {
          window.focus();
          notification.close();
        };
        setTimeout(() => notification.close(), 5000);
      } catch (err) {
        console.error('Failed to send fallback notification:', err);
      }
    });
  }, []);

  return { sendNotification, permission };
}

import { useCallback, useEffect, useState } from 'react';

export function useNotification() {
  const [permission, setPermission] = useState('default');

  // Request notification permission on first load
  useEffect(() => {
    if (!('Notification' in window)) {
      console.warn('Notifications not supported in this browser');
      return;
    }

    setPermission(Notification.permission);

    // Only request if not denied and not already granted
    if (Notification.permission === 'default') {
      Notification.requestPermission().then((p) => {
        setPermission(p);
      });
    }
  }, []);

  // Send a notification with sender name and message content
  const sendNotification = useCallback((senderName, messageContent, options = {}) => {
    if (Notification.permission !== 'granted') return;

    try {
      const title = `Message from ${senderName}`;
      const notificationOptions = {
        body: messageContent,
        icon: '/assets/app-icon.png', // optional, update path if you have an icon
        tag: 'message-notification',
        ...options,
      };

      const notification = new Notification(title, notificationOptions);

      // Focus window on notification click
      notification.onclick = () => {
        window.focus();
        notification.close();
      };

      // Auto-close after 5 seconds
      setTimeout(() => notification.close(), 5000);
    } catch (err) {
      console.error('Failed to send notification:', err);
    }
  }, []);

  return { sendNotification, permission };
}

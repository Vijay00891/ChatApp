export function formatLastSeen(status, lastSeenTime) {
  if (status === 'online') {
    return 'Active now';
  }
  if (!lastSeenTime) return '';

  const d = new Date(lastSeenTime);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 5 && diffMins >= 0) {
    return 'Active recently';
  }

  // Format HH:MM AM/PM
  const formatTime = (date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Check if today, yesterday or older
  const isToday = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();

  if (isToday) {
    return `Last seen today at ${formatTime(d)}`;
  } else if (isYesterday) {
    return `Last seen yesterday at ${formatTime(d)}`;
  } else {
    return `Last seen ${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
  }
}

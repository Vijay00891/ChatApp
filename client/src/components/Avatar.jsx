/**
 * Avatar component — generates an initials-based colored circle.
 * Falls back gracefully if name is empty.
 */

const PALETTE = [
  ['#4285F4', '#fff'], // Google Blue
  ['#EA4335', '#fff'], // Google Red
  ['#34A853', '#fff'], // Google Green
  ['#FBBC04', '#202124'], // Google Yellow
  ['#FF6D00', '#fff'], // Orange
  ['#9C27B0', '#fff'], // Purple
  ['#00BCD4', '#fff'], // Cyan
  ['#E91E63', '#fff'], // Pink
];

function colorFor(name = '') {
  const idx =
    name.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0) % PALETTE.length;
  return PALETTE[idx];
}

function initials(name = '') {
  return name
    .trim()
    .split(/\s+/)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .slice(0, 2)
    .join('');
}

export default function Avatar({ name = '', size = 40, className = '', online = false }) {
  const [bg, fg] = colorFor(name);
  const letters = initials(name) || '?';
  const fontSize = Math.round(size * 0.38);

  return (
    <div className={`relative inline-flex shrink-0 ${className}`}>
      <div
        style={{
          width: size,
          height: size,
          backgroundColor: bg,
          color: fg,
          fontSize,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: '"DM Sans", "Google Sans", Roboto, sans-serif',
          fontWeight: 600,
          userSelect: 'none',
          letterSpacing: '0.03em',
        }}
        aria-label={`Avatar for ${name}`}
      >
        {letters}
      </div>
      {online && (
        <span
          style={{
            position: 'absolute',
            bottom: 1,
            right: 1,
            width: Math.max(10, size * 0.27),
            height: Math.max(10, size * 0.27),
            backgroundColor: '#34A853',
            borderRadius: '50%',
            border: '2px solid #fff',
          }}
        />
      )}
    </div>
  );
}

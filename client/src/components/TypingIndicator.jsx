/**
 * TypingIndicator — three animated bouncing dots shown when a peer is typing.
 */
export default function TypingIndicator() {
  return (
    <div className="flex items-end gap-1 px-4 py-1 animate-fade-in">
      <div
        className="flex items-center gap-[4px] bg-received-bubble border border-border-color
                   px-4 py-3 rounded-bubble rounded-bl-sm shadow-google"
        style={{ minWidth: 52 }}
      >
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              backgroundColor: '#9E9E9E',
              display: 'inline-block',
              animation: `bounceDot 1.2s ${i * 0.2}s infinite ease-in-out`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

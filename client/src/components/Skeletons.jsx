/**
 * Skeleton screen components for perceived-instant loading.
 * These render shimmering placeholder UI while real data loads,
 * matching the WhatsApp Web approach of showing the app shell immediately.
 */

/** Full-page loading skeleton shown during route-level code splitting */
export function AppSkeleton() {
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar skeleton */}
      <div className="hidden md:flex flex-col w-80 lg:w-96 shrink-0 bg-surface border-r border-border-color">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-4 border-b border-border-color">
          <div className="w-10 h-10 rounded-full bg-border-color animate-pulse" />
          <div className="h-4 bg-border-color rounded w-24 animate-pulse" />
        </div>
        {/* Search */}
        <div className="px-3 py-2">
          <div className="h-9 bg-background border border-border-color rounded-full animate-pulse" />
        </div>
        {/* Room items */}
        <SidebarSkeletonItems />
      </div>

      {/* Divider */}
      <div className="hidden md:block w-px bg-border-color" />

      {/* Chat area skeleton */}
      <div className="flex-1 flex flex-col min-w-0">
        <ChatHeaderSkeleton />
        <div className="flex-1 flex items-center justify-center bg-background">
          <div className="flex flex-col items-center gap-4">
            <div className="w-20 h-20 rounded-full bg-border-color/50 animate-pulse" />
            <div className="h-4 bg-border-color rounded w-32 animate-pulse" />
            <div className="h-3 bg-border-color/60 rounded w-48 animate-pulse" />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Sidebar room list skeleton items */
export function SidebarSkeletonItems({ count = 8 }) {
  return (
    <div className="flex-1 overflow-hidden px-2">
      {[...Array(count)].map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 px-3 py-3 rounded-xl"
          style={{ opacity: 1 - i * 0.08 }}
        >
          <div className="w-[46px] h-[46px] rounded-full bg-border-color animate-pulse shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex justify-between items-baseline mb-2">
              <div
                className="h-3.5 bg-border-color rounded animate-pulse"
                style={{ width: `${60 + Math.random() * 30}%` }}
              />
              <div className="h-2.5 bg-border-color/60 rounded animate-pulse w-8 shrink-0 ml-2" />
            </div>
            <div
              className="h-2.5 bg-border-color/50 rounded animate-pulse"
              style={{ width: `${40 + Math.random() * 40}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Chat header skeleton */
export function ChatHeaderSkeleton() {
  return (
    <div className="flex items-center gap-3 px-3 py-3 bg-surface border-b border-border-color shadow-google">
      <div className="w-12 h-12 rounded-full bg-border-color animate-pulse" />
      <div className="flex-1 min-w-0">
        <div className="h-3.5 bg-border-color rounded w-28 mb-1.5 animate-pulse" />
        <div className="h-2.5 bg-border-color/60 rounded w-16 animate-pulse" />
      </div>
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-full bg-border-color/40 animate-pulse" />
        <div className="w-8 h-8 rounded-full bg-border-color/40 animate-pulse" />
      </div>
    </div>
  );
}

/** Message list skeleton */
export function MessageListSkeleton() {
  const items = [
    { mine: false, width: '55%' },
    { mine: false, width: '40%' },
    { mine: true, width: '60%' },
    { mine: true, width: '35%' },
    { mine: false, width: '70%' },
    { mine: true, width: '45%' },
  ];

  return (
    <div className="flex-1 overflow-hidden py-4 px-4">
      {items.map((item, i) => (
        <div
          key={i}
          className={`flex mb-3 ${item.mine ? 'justify-end' : 'justify-start'}`}
          style={{ opacity: 1 - i * 0.1 }}
        >
          <div
            className={`rounded-2xl animate-pulse ${
              item.mine ? 'bg-primary/15' : 'bg-border-color/60'
            }`}
            style={{
              width: item.width,
              height: `${28 + Math.floor(Math.random() * 20)}px`,
              maxWidth: '280px',
            }}
          />
        </div>
      ))}
    </div>
  );
}

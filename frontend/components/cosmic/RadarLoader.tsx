interface RadarLoaderProps {
  message?: string;
  size?: 'sm' | 'md' | 'lg';
}

export default function RadarLoader({ message = 'SCANNING...', size = 'md' }: RadarLoaderProps) {
  const sizeMap = { sm: 'w-12 h-12', md: 'w-20 h-20', lg: 'w-28 h-28' };
  const ringSize = sizeMap[size];

  return (
    <div className="flex flex-col items-center gap-3">
      <div className={`relative ${ringSize}`}>
        {/* Outer ring */}
        <div className="absolute inset-0 rounded-full border border-cosmic-glow/20" />
        {/* Middle ring */}
        <div className="absolute inset-2 rounded-full border border-cosmic-glow/15" />
        {/* Inner ring */}
        <div className="absolute inset-4 rounded-full border border-cosmic-glow/10" />
        {/* Sweep gradient */}
        <div className="absolute inset-0 rounded-full animate-radar-sweep"
          style={{
            background: 'conic-gradient(from 0deg, transparent 0%, transparent 70%, rgba(0, 229, 255, 0.3) 90%, transparent 100%)',
          }}
        />
        {/* Center dot */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-2 h-2 rounded-full bg-cosmic-glow animate-cosmic-pulse" />
        </div>
      </div>
      {message && (
        <p className="text-xs font-mono text-cosmic-glow/60 uppercase tracking-widest animate-cosmic-pulse">
          {message}
        </p>
      )}
    </div>
  );
}

import { type ReactNode } from 'react';

interface HudPanelProps {
  title?: string;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}

export default function HudPanel({ title, icon, children, className = '' }: HudPanelProps) {
  return (
    <div className={`hud-panel hud-scanline p-4 ${className}`}>
      {title && (
        <div className="flex items-center gap-2 mb-3 pb-2 border-b border-cosmic-glow/10">
          {icon && <span className="text-cosmic-glow/70">{icon}</span>}
          <h3 className="text-xs font-mono font-medium uppercase tracking-widest text-cosmic-glow/80">
            {title}
          </h3>
          <div className="flex-1" />
          <div className="w-1.5 h-1.5 rounded-full bg-cosmic-glow/50 animate-cosmic-pulse" />
        </div>
      )}
      {children}
    </div>
  );
}

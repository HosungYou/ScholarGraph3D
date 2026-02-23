import { type ReactNode } from 'react';

interface HudPanelProps {
  title?: string;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Variant: 'default' has corner brackets, 'clean' has no corners, 'elevated' adds stronger glow */
  variant?: 'default' | 'clean' | 'elevated';
  /** Show active status indicator */
  status?: 'active' | 'idle' | 'warning' | 'error';
  /** Additional controls in the title bar */
  actions?: ReactNode;
}

export default function HudPanel({
  title,
  icon,
  children,
  className = '',
  variant = 'default',
  status,
  actions,
}: HudPanelProps) {
  const baseClass = variant === 'clean' ? 'hud-panel-clean' : 'hud-panel';
  const elevatedClass = variant === 'elevated'
    ? 'shadow-[0_0_60px_rgba(0,229,255,0.04),inset_0_1px_0_rgba(0,229,255,0.08)]'
    : '';

  const statusColor = {
    active: 'hud-status',
    idle: 'hud-status opacity-40',
    warning: 'hud-status-warn',
    error: 'hud-status-error',
  };

  return (
    <div className={`${baseClass} ${elevatedClass} p-4 ${className}`}>
      {title && (
        <div className="flex items-center gap-2 mb-3 pb-2 border-b border-[rgba(0,229,255,0.08)]">
          {icon && <span className="text-cosmic-glow/60">{icon}</span>}
          <h3 className="hud-label text-cosmic-glow/70">
            {title}
          </h3>
          <div className="flex-1" />
          {actions}
          {status && (
            <span className={statusColor[status]} />
          )}
        </div>
      )}
      {children}
    </div>
  );
}

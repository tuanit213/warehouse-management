'use client';

import { ReactNode } from 'react';

type EmptyStateProps = {
  icon?: ReactNode;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
};

export function EmptyState({ icon, title, description, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="empty-state rich-empty-state">
      {icon && <div className="empty-icon" aria-hidden="true">{icon}</div>}
      <div>
        <h3>{title}</h3>
        {description && <p>{description}</p>}
      </div>
      {actionLabel && onAction && <button className="btn secondary" type="button" onClick={onAction}>{actionLabel}</button>}
    </div>
  );
}

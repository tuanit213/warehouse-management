'use client';

type InlineAlertProps = {
  type?: 'info' | 'warning' | 'danger' | 'success';
  title?: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
};

export function InlineAlert({ type = 'info', title, message, actionLabel, onAction }: InlineAlertProps) {
  return (
    <div className={`inline-alert ${type}`} role={type === 'danger' ? 'alert' : 'status'}>
      <div>
        {title && <strong>{title}</strong>}
        <p>{message}</p>
      </div>
      {actionLabel && onAction && <button className="btn ghost" type="button" onClick={onAction}>{actionLabel}</button>}
    </div>
  );
}

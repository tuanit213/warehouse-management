'use client';

import { LogOut, Moon, Sun } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

type UserMenuProps = {
  user: { email: string; fullName?: string; role: string };
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onLogout: () => void;
};

function initials(user: UserMenuProps['user']) {
  const source = user.fullName || user.email;
  return source
    .split(/[ @._-]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'U';
}

export function UserMenu({ user, theme, onToggleTheme, onLogout }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className="user-menu" ref={rootRef}>
      <button
        className="user-menu-trigger"
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="user-avatar">{initials(user)}</span>
        <span className="user-menu-copy">
          <strong>{user.fullName || user.email}</strong>
          <small>{user.role}</small>
        </span>
      </button>
      {open && (
        <section className="user-menu-panel" role="menu" aria-label="Tai khoan">
          <div className="user-menu-profile">
            <span className="user-avatar large">{initials(user)}</span>
            <div>
              <strong>{user.fullName || 'WMS operator'}</strong>
              <span>{user.email}</span>
              <small>{user.role}</small>
            </div>
          </div>
          <button className="user-menu-item" type="button" role="menuitem" onClick={onToggleTheme}>
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            <span>{theme === 'dark' ? 'Chuyen sang Light' : 'Chuyen sang Dark'}</span>
            <span className={theme === 'dark' ? 'switch mini is-on' : 'switch mini'} aria-hidden="true"><span /></span>
          </button>
          <button className="user-menu-item danger-item" type="button" role="menuitem" onClick={onLogout}>
            <LogOut size={16} />
            <span>Dang xuat</span>
          </button>
        </section>
      )}
    </div>
  );
}

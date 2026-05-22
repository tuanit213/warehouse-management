'use client';

import { ReactNode, RefObject, useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

type FocusTrapProps = {
  active: boolean;
  children: ReactNode;
  className?: string;
  restoreFocus?: boolean;
  initialFocusRef?: RefObject<HTMLElement | null>;
};

export function FocusTrap({ active, children, className, restoreFocus = true, initialFocusRef }: FocusTrapProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const root = rootRef.current;

    window.setTimeout(() => {
      const target = initialFocusRef?.current || root?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      target?.focus();
    }, 0);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || !root) return;
      const focusable = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((node) => node.offsetParent !== null);
      if (!focusable.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const current = document.activeElement;

      if (event.shiftKey && current === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && current === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      if (restoreFocus) previousFocusRef.current?.focus();
    };
  }, [active, initialFocusRef, restoreFocus]);

  return (
    <div ref={rootRef} className={className}>
      {children}
    </div>
  );
}

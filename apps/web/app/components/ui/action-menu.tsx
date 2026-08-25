'use client';

import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export type ActionMenuItem = {
  id: string;
  label: ReactNode;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
};

export function ActionMenu({
  label,
  items,
  compact = false,
  triggerContent,
  secondary = false,
}: {
  label: string;
  items: ActionMenuItem[];
  compact?: boolean;
  triggerContent?: ReactNode;
  secondary?: boolean;
}) {
  const triggerId = useId();
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<CSSProperties>();

  useLayoutEffect(() => {
    if (!open) return;

    function placeMenu() {
      const trigger = triggerRef.current;
      const menu = menuRef.current;
      if (!trigger || !menu) return;
      const triggerRect = trigger.getBoundingClientRect();
      const menuRect = menu.getBoundingClientRect();
      const gutter = 8;
      const left = Math.min(
        Math.max(gutter, triggerRect.right - menuRect.width),
        window.innerWidth - menuRect.width - gutter,
      );
      const below = triggerRect.bottom + 6;
      const top =
        below + menuRect.height <= window.innerHeight - gutter
          ? below
          : Math.max(gutter, triggerRect.top - menuRect.height - 6);
      setPosition({ left, top });
    }

    placeMenu();
    window.addEventListener('resize', placeMenu);
    window.addEventListener('scroll', placeMenu, true);
    return () => {
      window.removeEventListener('resize', placeMenu);
      window.removeEventListener('scroll', placeMenu, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]:not(:disabled)')?.focus();

    function closeFromOutside(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setOpen(false);
    }

    function closeWithEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    }

    document.addEventListener('pointerdown', closeFromOutside);
    document.addEventListener('keydown', closeWithEscape);
    return () => {
      document.removeEventListener('pointerdown', closeFromOutside);
      document.removeEventListener('keydown', closeWithEscape);
    };
  }, [open]);

  function handleMenuKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const menuItems = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)') ?? [],
    );
    if (menuItems.length === 0) return;
    const currentIndex = Math.max(0, menuItems.indexOf(document.activeElement as HTMLElement));
    let nextIndex: number | undefined;
    if (event.key === 'ArrowDown') nextIndex = (currentIndex + 1) % menuItems.length;
    if (event.key === 'ArrowUp')
      nextIndex = (currentIndex - 1 + menuItems.length) % menuItems.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = menuItems.length - 1;
    if (nextIndex === undefined) return;
    event.preventDefault();
    menuItems[nextIndex]?.focus();
  }

  return (
    <div className="action-menu">
      <button
        aria-controls={menuId}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={label}
        className={`action-menu__trigger${compact ? ' action-menu__trigger--compact' : ''}${triggerContent ? ` action-menu__trigger--label button${secondary ? ' button--secondary' : ''}` : ''}`}
        id={triggerId}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowDown') return;
          event.preventDefault();
          setOpen(true);
        }}
        ref={triggerRef}
        title={label}
        type="button"
      >
        {triggerContent ?? <span aria-hidden="true">⋯</span>}
      </button>
      {open
        ? createPortal(
            <div
              aria-labelledby={triggerId}
              className="action-menu__popover"
              id={menuId}
              onKeyDown={handleMenuKeyDown}
              ref={menuRef}
              role="menu"
              style={position}
            >
              {items.map((item) => (
                <button
                  className={item.danger ? 'action-menu__danger' : undefined}
                  disabled={item.disabled}
                  key={item.id}
                  onClick={() => {
                    setOpen(false);
                    triggerRef.current?.focus();
                    item.onSelect();
                  }}
                  role="menuitem"
                  type="button"
                >
                  {item.label}
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

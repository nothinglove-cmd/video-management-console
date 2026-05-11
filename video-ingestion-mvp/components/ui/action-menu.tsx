"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { LucideIcon } from "lucide-react";

import { skin } from "@/components/theme/skin";
import { cn } from "@/lib/utils";

export type ActionMenuItem = {
  label: string;
  icon?: LucideIcon;
  onSelect?: () => void;
  href?: string;
  tone?: "normal" | "primary" | "danger";
  disabled?: boolean;
};

export function ActionMenu({
  items,
  trigger,
  ariaLabel = "操作菜单",
  width = 256,
  align = "end",
  className
}: {
  items: ActionMenuItem[];
  trigger: (props: { ref: React.RefObject<HTMLButtonElement | null>; open: boolean; toggle: () => void }) => ReactNode;
  ariaLabel?: string;
  width?: number;
  align?: "start" | "end";
  className?: string;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [position, setPosition] = useState<ActionMenuPosition>({ mode: "dropdown", left: 0, top: 0, maxHeight: 360 });
  const availableItems = useMemo(() => items.filter(Boolean), [items]);

  useEffect(() => setMounted(true), []);

  useLayoutEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      setPosition(getMenuPosition(rect, width, align));
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [align, open, width]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  const menu = open && mounted
    ? createPortal(
        <>
          {position.mode === "sheet" ? (
            <button
              type="button"
              className="fixed inset-0 z-[70] bg-transparent"
              aria-label="关闭操作菜单"
              onClick={() => setOpen(false)}
            />
          ) : null}
          <div
            ref={menuRef}
            style={{
              left: position.mode === "dropdown" ? position.left : undefined,
              top: position.mode === "dropdown" ? position.top : undefined,
              width: position.mode === "dropdown" ? width : undefined,
              maxHeight: position.maxHeight
            }}
            className={cn(
              "fixed z-[80] overflow-hidden border border-[color:var(--skin-border)] bg-[color:var(--skin-panel-bg)] p-1 shadow-[var(--skin-shadow-elevated)]",
              position.mode === "sheet"
                ? "inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] max-h-[min(22rem,calc(100dvh-2rem))] rounded-[var(--skin-radius-panel)]"
                : "rounded-[var(--skin-radius-panel)]",
              className
            )}
            role="menu"
            aria-label={ariaLabel}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="thin-scrollbar max-h-[inherit] overflow-auto">
              <div className="grid gap-0.5">
                {availableItems.map((item, index) => (
                  <ActionMenuRow key={`${item.label}-${index}`} item={item} onClose={() => setOpen(false)} />
                ))}
              </div>
            </div>
          </div>
        </>,
        document.body
      )
    : null;

  return (
    <>
      {trigger({
        ref: triggerRef,
        open,
        toggle: () => setOpen((current) => !current)
      })}
      {menu}
    </>
  );
}

type ActionMenuPosition = {
  mode: "dropdown" | "sheet";
  left: number;
  top: number;
  maxHeight: number;
};

function getMenuPosition(rect: DOMRect, width: number, align: "start" | "end"): ActionMenuPosition {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const gutter = 12;
  const maxHeight = Math.min(384, viewportHeight - gutter * 2);
  const useSheet = viewportWidth < 640 && viewportHeight - rect.bottom < 240;
  if (useSheet) {
    return { mode: "sheet", left: gutter, top: viewportHeight - maxHeight - gutter, maxHeight };
  }

  const preferredLeft = align === "end" ? rect.right - width : rect.left;
  const left = Math.min(Math.max(gutter, preferredLeft), Math.max(gutter, viewportWidth - width - gutter));
  const belowTop = rect.bottom + 8;
  const aboveTop = rect.top - maxHeight - 8;
  const top = belowTop + maxHeight <= viewportHeight - gutter ? belowTop : Math.max(gutter, aboveTop);

  return { mode: "dropdown", left, top, maxHeight };
}

function ActionMenuRow({ item, onClose }: { item: ActionMenuItem; onClose: () => void }) {
  const Icon = item.icon;
  const className = cn(
    "flex min-h-[var(--skin-touch-target-min-height)] w-full items-center rounded-[var(--skin-radius-sm)] px-3 text-left font-medium transition",
    skin.typography.button,
    item.tone === "primary" && "text-primary hover:bg-[color:var(--skin-surface-selected)]",
    item.tone === "danger" && "text-red-700 hover:bg-red-50",
    (!item.tone || item.tone === "normal") && "text-foreground hover:bg-[color:var(--skin-surface-hover)]",
    item.disabled && "pointer-events-none opacity-45"
  );
  const content = (
    <>
      {Icon ? <Icon className="mr-2 h-4 w-4 shrink-0" /> : null}
      <span className="truncate">{item.label}</span>
    </>
  );

  if (item.href) {
    return (
      <a href={item.href} className={className} onClick={onClose} role="menuitem" aria-disabled={item.disabled}>
        {content}
      </a>
    );
  }

  return (
    <button
      type="button"
      className={className}
      role="menuitem"
      disabled={item.disabled}
      onClick={() => {
        item.onSelect?.();
        onClose();
      }}
    >
      {content}
    </button>
  );
}

'use client';

import { ReactNode } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Shared presentational UI kit for all menu/non-game pages.
 *
 * These components only standardize layout + styling — they hold no app state
 * and change no behavior. The goal is one consistent look for navigation,
 * cards, headers, currency pills, and alerts across every screen.
 */

/** White content surface — the standard card used on every menu page. */
export function Card({
  className = '',
  interactive = false,
  children,
}: {
  className?: string;
  interactive?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={`bg-white rounded-3xl ring-1 ring-black/5 shadow-glow ${
        interactive
          ? 'transition-all duration-200 hover:-translate-y-1 cursor-pointer'
          : ''
      } ${className}`}
    >
      {children}
    </div>
  );
}

/** Translucent pill button that sits directly on the gradient background. */
export function NavPill({
  onClick,
  children,
  ariaLabel,
  className = '',
}: {
  onClick?: () => void;
  children: ReactNode;
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={`inline-flex items-center gap-2 min-h-[44px] px-4 rounded-full bg-white/15 backdrop-blur-md text-white font-medium text-sm shadow-glow-sm ring-1 ring-white/25 hover:bg-white/25 hover:-translate-y-0.5 active:translate-y-0 active:scale-95 transition-all duration-200 ${className}`}
    >
      {children}
    </button>
  );
}

/** Read-only translucent pill, used for currency balances on the gradient. */
export function StatPill({
  icon,
  children,
  className = '',
}: {
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`inline-flex items-center gap-1.5 min-h-[44px] px-4 rounded-full bg-white/15 backdrop-blur-md text-white font-semibold text-sm shadow-glow-sm ring-1 ring-white/25 ${className}`}
    >
      {icon != null && <span className="text-lg leading-none">{icon}</span>}
      <span className="whitespace-nowrap">{children}</span>
    </div>
  );
}

/**
 * Consistent sub-page header: a back pill on the left and optional content
 * (currency pills, etc.) on the right. Defaults to navigating home.
 */
export function PageHeader({
  onBack,
  backLabel = 'Menu',
  right,
  className = '',
}: {
  onBack?: () => void;
  backLabel?: string;
  right?: ReactNode;
  className?: string;
}) {
  const router = useRouter();
  return (
    <div className={`flex items-center justify-between gap-3 mb-5 sm:mb-6 ${className}`}>
      <NavPill onClick={onBack ?? (() => router.push('/'))} ariaLabel="Back to menu">
        <span aria-hidden className="text-base leading-none">←</span>
        <span>{backLabel}</span>
      </NavPill>
      {right != null && (
        <div className="flex flex-wrap items-center justify-end gap-2 min-w-0">{right}</div>
      )}
    </div>
  );
}

/** Big friendly page title shown over the gradient (white text). */
export function PageHero({
  title,
  subtitle,
  className = '',
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`text-center mb-6 ${className}`}>
      <h1 className="text-3xl sm:text-4xl font-extrabold text-white drop-shadow-lg tracking-tight">
        {title}
      </h1>
      {subtitle != null && (
        <p className="text-white/90 text-sm sm:text-base mt-1.5 drop-shadow">{subtitle}</p>
      )}
    </div>
  );
}

/** Inline status banner for errors, successes, and notices. */
export function Alert({
  tone = 'error',
  className = '',
  children,
}: {
  tone?: 'error' | 'success' | 'info';
  className?: string;
  children: ReactNode;
}) {
  const tones = {
    error: 'bg-red-50 border-red-200 text-red-700',
    success: 'bg-green-50 border-green-200 text-green-700',
    info: 'bg-amber-50 border-amber-200 text-amber-800',
  } as const;
  return (
    <div
      className={`animate-pop-in rounded-xl border p-3 text-sm text-center shadow-glow-sm ${tones[tone]} ${className}`}
    >
      {children}
    </div>
  );
}

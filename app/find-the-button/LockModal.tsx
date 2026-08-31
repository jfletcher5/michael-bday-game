'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Combination lock keypad.
 *
 * Opened by aiming at a lock panel and pressing E / clicking. Digits can be
 * tapped on screen or typed; the code submits itself once every digit is in.
 * A wrong code shakes the display and clears it — no lockout, this is a
 * birthday game, not a bank vault.
 */
export default function LockModal({
  hint,
  codeLength,
  onSubmit,
  onClose,
}: {
  /** Clue text telling the player how to work out the code. */
  hint: string;
  codeLength: number;
  /** Returns true when the attempt is correct (the page then opens the door). */
  onSubmit: (attempt: string) => boolean;
  onClose: () => void;
}) {
  const [entry, setEntry] = useState('');
  /** True briefly after a wrong attempt, driving the shake + red display. */
  const [wrong, setWrong] = useState(false);

  const pushDigit = useCallback(
    (digit: string) => {
      if (entry.length >= codeLength) return;
      const next = entry + digit;
      setEntry(next);
      if (next.length === codeLength) {
        // Brief pause so the final digit renders before the verdict arrives.
        setTimeout(() => {
          if (!onSubmit(next)) {
            setWrong(true);
            setTimeout(() => {
              setWrong(false);
              setEntry('');
            }, 450);
          }
        }, 120);
      }
    },
    [entry, codeLength, onSubmit]
  );

  // Physical keyboard entry. The game canvas ignores keys while the modal is
  // open (it gets `paused`), so there is no double handling to suppress here.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) pushDigit(e.key);
      else if (e.code === 'Backspace') setEntry((v) => v.slice(0, -1));
      else if (e.code === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pushDigit, onClose]);

  return (
    <div className="absolute inset-0 z-10 grid place-items-center bg-black/60 backdrop-blur-sm">
      <div
        className={`bg-white rounded-3xl shadow-glow p-6 w-72 mx-4 animate-pop-in ${
          wrong ? 'animate-shake' : ''
        }`}
        role="dialog"
        aria-label="Combination lock"
      >
        <h2 className="text-xl font-extrabold text-gray-800 text-center mb-1">
          Combination Lock
        </h2>
        <p className="text-xs text-gray-500 text-center mb-4">{hint}</p>

        {/* Entered digits, one box per digit. */}
        <div
          className={`flex justify-center gap-2 mb-4 rounded-xl p-2 transition-colors ${
            wrong ? 'bg-red-100 ring-2 ring-red-400' : 'bg-gray-100'
          }`}
        >
          {Array.from({ length: codeLength }, (_, i) => (
            <span
              key={i}
              className={`h-10 w-8 grid place-items-center rounded-lg text-xl font-mono font-bold ${
                wrong ? 'text-red-600' : 'text-gray-800'
              } bg-white shadow-inner`}
            >
              {entry[i] ?? ''}
            </span>
          ))}
        </div>

        {/* Keypad: 1-9, then clear / 0 / backspace. */}
        <div className="grid grid-cols-3 gap-2">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
            <button
              key={digit}
              type="button"
              onClick={() => pushDigit(digit)}
              className="min-h-[44px] rounded-xl bg-gray-100 text-lg font-bold text-gray-800 hover:bg-gray-200 active:scale-95 transition-all"
            >
              {digit}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setEntry('')}
            className="min-h-[44px] rounded-xl bg-gray-100 text-sm font-semibold text-gray-500 hover:bg-gray-200 active:scale-95 transition-all"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={() => pushDigit('0')}
            className="min-h-[44px] rounded-xl bg-gray-100 text-lg font-bold text-gray-800 hover:bg-gray-200 active:scale-95 transition-all"
          >
            0
          </button>
          <button
            type="button"
            onClick={() => setEntry((v) => v.slice(0, -1))}
            className="min-h-[44px] rounded-xl bg-gray-100 text-lg font-bold text-gray-800 hover:bg-gray-200 active:scale-95 transition-all"
            aria-label="Delete last digit"
          >
            ⌫
          </button>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full bg-gray-100 text-gray-600 font-semibold min-h-[44px] rounded-xl hover:bg-gray-200 transition-all"
        >
          Step away (Esc)
        </button>
      </div>
    </div>
  );
}

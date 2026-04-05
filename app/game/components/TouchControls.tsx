'use client';

import { Controls } from '@/app/lib/types';

interface TouchControlsProps {
  controls: Controls;
  setControls: (controls: Controls) => void;
  disabled: boolean;
}

export default function TouchControls({ controls, setControls, disabled }: TouchControlsProps) {
  const handleButtonPress = (direction: 'left' | 'right' | 'jump') => {
    if (disabled) return;
    setControls({ ...controls, [direction]: true });
  };

  const handleButtonRelease = (direction: 'left' | 'right' | 'jump') => {
    if (disabled) return;
    setControls({ ...controls, [direction]: false });
  };

  const buttonBaseClass = "w-14 h-14 sm:w-16 sm:h-16 rounded-lg bg-white/20 backdrop-blur-sm border-2 border-white/40 flex items-center justify-center text-white text-xl sm:text-2xl font-bold active:bg-white/40 transition-all select-none touch-none";
  const buttonActiveClass = "bg-white/40 scale-95";

  return (
    <div className="fixed bottom-0 left-0 right-0 z-30 pointer-events-none pb-[env(safe-area-inset-bottom)]">
      {/* Left and Right arrows - Bottom Left */}
      <div className="absolute bottom-4 sm:bottom-8 left-4 sm:left-8 flex gap-2 sm:gap-3 pointer-events-auto">
        <button
          onTouchStart={() => handleButtonPress('left')}
          onTouchEnd={() => handleButtonRelease('left')}
          onMouseDown={() => handleButtonPress('left')}
          onMouseUp={() => handleButtonRelease('left')}
          onMouseLeave={() => handleButtonRelease('left')}
          className={`${buttonBaseClass} ${controls.left ? buttonActiveClass : ''}`}
          disabled={disabled}
        >
          &larr;
        </button>

        <button
          onTouchStart={() => handleButtonPress('right')}
          onTouchEnd={() => handleButtonRelease('right')}
          onMouseDown={() => handleButtonPress('right')}
          onMouseUp={() => handleButtonRelease('right')}
          onMouseLeave={() => handleButtonRelease('right')}
          className={`${buttonBaseClass} ${controls.right ? buttonActiveClass : ''}`}
          disabled={disabled}
        >
          &rarr;
        </button>
      </div>

      {/* Jump button - Bottom Right */}
      <div className="absolute bottom-4 sm:bottom-8 right-4 sm:right-8 pointer-events-auto">
        <button
          onTouchStart={() => handleButtonPress('jump')}
          onTouchEnd={() => handleButtonRelease('jump')}
          onMouseDown={() => handleButtonPress('jump')}
          onMouseUp={() => handleButtonRelease('jump')}
          onMouseLeave={() => handleButtonRelease('jump')}
          className={`${buttonBaseClass} ${controls.jump ? buttonActiveClass : ''}`}
          disabled={disabled}
        >
          &uarr;
        </button>
      </div>
    </div>
  );
}

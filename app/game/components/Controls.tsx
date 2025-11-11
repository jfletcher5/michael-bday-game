'use client';

import { useEffect } from 'react';
import { Controls } from '@/app/lib/types';

interface ControlsProps {
  controls: Controls;
  setControls: (controls: Controls) => void;
  disabled: boolean;
}

/**
 * Controls Component
 * Handles keyboard input for left/right movement and jumping
 */
export default function ControlsComponent({ controls, setControls, disabled }: ControlsProps) {
  // Keyboard event handlers
  useEffect(() => {
    if (disabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Prevent default for all arrow keys to stop scrolling in Safari
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        e.stopPropagation();
      }

      switch (e.key) {
        case 'ArrowLeft':
          setControls({ ...controls, left: true });
          break;
        case 'ArrowRight':
          setControls({ ...controls, right: true });
          break;
        case 'ArrowUp':
          setControls({ ...controls, jump: true });
          break;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      // Prevent default for all arrow keys to stop scrolling in Safari
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        e.stopPropagation();
      }

      switch (e.key) {
        case 'ArrowLeft':
          setControls({ ...controls, left: false });
          break;
        case 'ArrowRight':
          setControls({ ...controls, right: false });
          break;
        case 'ArrowUp':
          setControls({ ...controls, jump: false });
          break;
      }
    };

    // Use capture phase to prevent Safari from handling arrow keys
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    window.addEventListener('keyup', handleKeyUp, { capture: true });

    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
      window.removeEventListener('keyup', handleKeyUp, { capture: true });
    };
  }, [controls, setControls, disabled]);

  // This component only manages keyboard events, no visual UI needed
  return null;
}

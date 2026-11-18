/**
 * Enrollment step definitions
 */

import type { EnrollmentStep } from '../types';

// Check for E2E test mode via query param
function isE2EMode(): boolean {
  if (typeof window === 'undefined' || !window.location) return false;
  return new URLSearchParams(window.location.search).get('e2e') === '1';
}

// Check for debug mode via query param
export function isDebugMode(): boolean {
  if (typeof window === 'undefined' || !window.location) return false;
  return new URLSearchParams(window.location.search).get('debug') === '1';
}

const E2E_MODE = isE2EMode();

// Easy, forgiving pose targets - just need a small turn in the right direction
export const ENROLLMENT_STEPS: EnrollmentStep[] = [
  {
    id: 'straight',
    instruction: 'Look straight at the camera',
    targetPose: { yaw: 0, pitch: 0, roll: 0 },
    tolerances: E2E_MODE ? { yaw: 50, pitch: 50, roll: 50 } : { yaw: 15, pitch: 15, roll: 30 },
    requireEyesOpen: true
  },
  {
    id: 'left',
    instruction: 'Turn your head to the left',
    targetPose: { yaw: 20, pitch: 0, roll: 0 }, // Positive yaw for left turn
    tolerances: E2E_MODE ? { yaw: 50, pitch: 50, roll: 50 } : { yaw: 100, pitch: 20, roll: 45 },
    requireEyesOpen: true,
    requireDirectionalTurn: 'left' // Special handling: must turn left
  },
  {
    id: 'right',
    instruction: 'Turn your head to the right',
    targetPose: { yaw: -20, pitch: 0, roll: 0 }, // Negative yaw for right turn  
    tolerances: E2E_MODE ? { yaw: 50, pitch: 50, roll: 50 } : { yaw: 100, pitch: 20, roll: 45 },
    requireEyesOpen: true,
    requireDirectionalTurn: 'right' // Special handling: must turn right
  },
  {
    id: 'up',
    instruction: 'Tilt your head up slightly',
    targetPose: { yaw: 0, pitch: -10, roll: 0 },
    tolerances: E2E_MODE ? { yaw: 50, pitch: 50, roll: 50 } : { yaw: 20, pitch: 10, roll: 30 },
    requireEyesOpen: true
  },
  {
    id: 'down',
    instruction: 'Tilt your head down slightly',
    targetPose: { yaw: 0, pitch: 10, roll: 0 },
    tolerances: E2E_MODE ? { yaw: 50, pitch: 50, roll: 50 } : { yaw: 20, pitch: 10, roll: 30 },
    requireEyesOpen: true
  },
  {
    id: 'blink',
    instruction: 'Blink your eyes',
    targetPose: { yaw: 0, pitch: 0, roll: 0 },
    tolerances: E2E_MODE ? { yaw: 50, pitch: 50, roll: 50 } : { yaw: 25, pitch: 25, roll: 30 },
    requireBlink: E2E_MODE ? false : true
  }
];

export const HOLD_DURATION_MS = E2E_MODE ? 300 : 800; // Hold each pose
export const STEP_COMPLETE_DELAY_MS = 600; // "Got it" confirmation delay
export const CAPTURE_INTERVAL_MS = 150; // How often to evaluate frames while holding
export const MAX_FRAMES_PER_STEP = 5; // Keep best N frames per step
export const MIN_SHARPNESS_THRESHOLD = 30; // Reject blurry frames
export const TARGET_FRAMES_PER_STEP = E2E_MODE ? 1 : 3; // Minimum sharp frames per step

/**
 * Enrollment step definitions
 */

import type { EnrollmentStep } from '../types';

export const ENROLLMENT_STEPS: EnrollmentStep[] = [
  {
    id: 'straight',
    instruction: 'Look straight at the camera',
    targetPose: { yaw: 0, pitch: 0, roll: 0 },
    tolerances: { yaw: 15, pitch: 15, roll: 15 },
    requireEyesOpen: true
  },
  {
    id: 'left',
    instruction: 'Turn your head to the left',
    targetPose: { yaw: -35, pitch: 0, roll: 0 },
    tolerances: { yaw: 15, pitch: 15, roll: 15 },
    requireEyesOpen: true
  },
  {
    id: 'right',
    instruction: 'Turn your head to the right',
    targetPose: { yaw: 35, pitch: 0, roll: 0 },
    tolerances: { yaw: 15, pitch: 15, roll: 15 },
    requireEyesOpen: true
  },
  {
    id: 'up',
    instruction: 'Tilt your head up slightly',
    targetPose: { yaw: 0, pitch: -20, roll: 0 },
    tolerances: { yaw: 15, pitch: 12, roll: 15 },
    requireEyesOpen: true
  },
  {
    id: 'down',
    instruction: 'Tilt your head down slightly',
    targetPose: { yaw: 0, pitch: 20, roll: 0 },
    tolerances: { yaw: 15, pitch: 12, roll: 15 },
    requireEyesOpen: true
  },
  {
    id: 'blink',
    instruction: 'Blink your eyes',
    targetPose: { yaw: 0, pitch: 0, roll: 0 },
    tolerances: { yaw: 20, pitch: 20, roll: 20 },
    requireBlink: true
  }
];

export const HOLD_DURATION_MS = 800; // How long to hold pose before advancing
export const CAPTURE_INTERVAL_MS = 100; // How often to evaluate frames while holding
export const MAX_FRAMES_PER_STEP = 5; // Keep best N frames per step

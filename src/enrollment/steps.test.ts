/**
 * Unit tests for enrollment steps and pose detection logic
 */

import { describe, it, expect } from 'vitest';
import { ENROLLMENT_STEPS, HOLD_DURATION_MS, CAPTURE_INTERVAL_MS, MAX_FRAMES_PER_STEP } from './steps';
import { isPoseMatched } from '../utils/faceDetection';
import type { HeadPose } from '../types';

describe('Enrollment Steps Configuration', () => {
  it('should have all required steps', () => {
    expect(ENROLLMENT_STEPS).toHaveLength(6);
    
    const stepIds = ENROLLMENT_STEPS.map(s => s.id);
    expect(stepIds).toEqual(['straight', 'left', 'right', 'up', 'down', 'blink']);
  });

  it('should have proper straight pose configuration', () => {
    const straight = ENROLLMENT_STEPS.find(s => s.id === 'straight');
    expect(straight).toBeDefined();
    expect(straight!.targetPose).toEqual({ yaw: 0, pitch: 0, roll: 0 });
    expect(straight!.requireEyesOpen).toBe(true);
    expect(straight!.requireBlink).toBeUndefined();
  });

  it('should have proper left pose configuration', () => {
    const left = ENROLLMENT_STEPS.find(s => s.id === 'left');
    expect(left).toBeDefined();
    expect(left!.targetPose.yaw).toBe(20); // Positive for left turn (mirrored video)
    expect(left!.targetPose.pitch).toBe(0);
    expect(left!.requireEyesOpen).toBe(true);
    expect(left!.requireDirectionalTurn).toBe('left');
  });

  it('should have proper right pose configuration', () => {
    const right = ENROLLMENT_STEPS.find(s => s.id === 'right');
    expect(right).toBeDefined();
    expect(right!.targetPose.yaw).toBe(-20); // Negative for right turn (mirrored video)
    expect(right!.targetPose.pitch).toBe(0);
    expect(right!.requireEyesOpen).toBe(true);
    expect(right!.requireDirectionalTurn).toBe('right');
  });

  it('should have proper up pose configuration', () => {
    const up = ENROLLMENT_STEPS.find(s => s.id === 'up');
    expect(up).toBeDefined();
    expect(up!.targetPose.pitch).toBe(-10); // Reduced for easier completion
    expect(up!.requireEyesOpen).toBe(true);
  });

  it('should have proper down pose configuration', () => {
    const down = ENROLLMENT_STEPS.find(s => s.id === 'down');
    expect(down).toBeDefined();
    expect(down!.targetPose.pitch).toBe(10); // Reduced for easier completion
    expect(down!.requireEyesOpen).toBe(true);
  });

  it('should have proper blink configuration', () => {
    const blink = ENROLLMENT_STEPS.find(s => s.id === 'blink');
    expect(blink).toBeDefined();
    expect(blink!.requireBlink).toBe(true);
    expect(blink!.requireEyesOpen).toBeUndefined();
  });

  it('should have reasonable timing constants', () => {
    expect(HOLD_DURATION_MS).toBeGreaterThan(0);
    expect(HOLD_DURATION_MS).toBeLessThan(3000); // Not too long
    
    expect(CAPTURE_INTERVAL_MS).toBeGreaterThan(0);
    expect(CAPTURE_INTERVAL_MS).toBeLessThan(HOLD_DURATION_MS);
    
    expect(MAX_FRAMES_PER_STEP).toBeGreaterThan(0);
    expect(MAX_FRAMES_PER_STEP).toBeLessThan(20); // Reasonable limit
  });
});

describe('Pose Matching Logic', () => {
  const createPose = (yaw: number, pitch: number, roll: number): HeadPose => ({
    yaw, pitch, roll
  });

  it('should match straight pose when within tolerance', () => {
    const target = createPose(0, 0, 0);
    const tolerances = { yaw: 15, pitch: 15, roll: 15 };
    
    // Perfect match
    expect(isPoseMatched(createPose(0, 0, 0), target, tolerances)).toBe(true);
    
    // Within tolerance
    expect(isPoseMatched(createPose(10, 10, 10), target, tolerances)).toBe(true);
    expect(isPoseMatched(createPose(-10, -10, -10), target, tolerances)).toBe(true);
    
    // Edge of tolerance
    expect(isPoseMatched(createPose(15, 15, 15), target, tolerances)).toBe(true);
    expect(isPoseMatched(createPose(-15, -15, -15), target, tolerances)).toBe(true);
  });

  it('should not match when outside tolerance', () => {
    const target = createPose(0, 0, 0);
    const tolerances = { yaw: 15, pitch: 15, roll: 15 };
    
    // Just outside tolerance
    expect(isPoseMatched(createPose(16, 0, 0), target, tolerances)).toBe(false);
    expect(isPoseMatched(createPose(0, 16, 0), target, tolerances)).toBe(false);
    expect(isPoseMatched(createPose(0, 0, 16), target, tolerances)).toBe(false);
    
    // Way outside
    expect(isPoseMatched(createPose(45, 0, 0), target, tolerances)).toBe(false);
    expect(isPoseMatched(createPose(0, -30, 0), target, tolerances)).toBe(false);
  });

  it('should match left turn pose', () => {
    const target = createPose(-35, 0, 0);
    const tolerances = { yaw: 15, pitch: 15, roll: 15 };
    
    // At target
    expect(isPoseMatched(createPose(-35, 0, 0), target, tolerances)).toBe(true);
    
    // Within range
    expect(isPoseMatched(createPose(-25, 0, 0), target, tolerances)).toBe(true);
    expect(isPoseMatched(createPose(-45, 0, 0), target, tolerances)).toBe(true);
    
    // Outside range
    expect(isPoseMatched(createPose(0, 0, 0), target, tolerances)).toBe(false);
    expect(isPoseMatched(createPose(-60, 0, 0), target, tolerances)).toBe(false);
  });

  it('should match right turn pose', () => {
    const target = createPose(35, 0, 0);
    const tolerances = { yaw: 15, pitch: 15, roll: 15 };
    
    // At target
    expect(isPoseMatched(createPose(35, 0, 0), target, tolerances)).toBe(true);
    
    // Within range
    expect(isPoseMatched(createPose(25, 0, 0), target, tolerances)).toBe(true);
    expect(isPoseMatched(createPose(45, 0, 0), target, tolerances)).toBe(true);
    
    // Outside range
    expect(isPoseMatched(createPose(0, 0, 0), target, tolerances)).toBe(false);
    expect(isPoseMatched(createPose(60, 0, 0), target, tolerances)).toBe(false);
  });

  it('should match up tilt pose', () => {
    const target = createPose(0, -20, 0);
    const tolerances = { yaw: 15, pitch: 12, roll: 15 };
    
    expect(isPoseMatched(createPose(0, -20, 0), target, tolerances)).toBe(true);
    expect(isPoseMatched(createPose(0, -15, 0), target, tolerances)).toBe(true);
    expect(isPoseMatched(createPose(0, -30, 0), target, tolerances)).toBe(true);
    
    // Too far
    expect(isPoseMatched(createPose(0, 0, 0), target, tolerances)).toBe(false);
    expect(isPoseMatched(createPose(0, -40, 0), target, tolerances)).toBe(false);
  });

  it('should match down tilt pose', () => {
    const target = createPose(0, 20, 0);
    const tolerances = { yaw: 15, pitch: 12, roll: 15 };
    
    expect(isPoseMatched(createPose(0, 20, 0), target, tolerances)).toBe(true);
    expect(isPoseMatched(createPose(0, 15, 0), target, tolerances)).toBe(true);
    expect(isPoseMatched(createPose(0, 30, 0), target, tolerances)).toBe(true);
    
    // Too far
    expect(isPoseMatched(createPose(0, 0, 0), target, tolerances)).toBe(false);
    expect(isPoseMatched(createPose(0, 40, 0), target, tolerances)).toBe(false);
  });

  it('should require all axes to be within tolerance', () => {
    const target = createPose(0, 0, 0);
    const tolerances = { yaw: 10, pitch: 10, roll: 10 };
    
    // Yaw within, pitch outside
    expect(isPoseMatched(createPose(5, 15, 0), target, tolerances)).toBe(false);
    
    // Pitch within, roll outside
    expect(isPoseMatched(createPose(0, 5, 15), target, tolerances)).toBe(false);
    
    // All must be within
    expect(isPoseMatched(createPose(5, 5, 5), target, tolerances)).toBe(true);
  });

  it('should work with asymmetric tolerances', () => {
    const target = createPose(0, 0, 0);
    const tolerances = { yaw: 20, pitch: 10, roll: 5 };
    
    // Within yaw, outside pitch
    expect(isPoseMatched(createPose(15, 12, 0), target, tolerances)).toBe(false);
    
    // Within pitch, outside roll
    expect(isPoseMatched(createPose(0, 8, 6), target, tolerances)).toBe(false);
    
    // All within different tolerances
    expect(isPoseMatched(createPose(18, 8, 4), target, tolerances)).toBe(true);
  });
});

describe('Hold Duration Logic', () => {
  it('should use 800ms hold duration', () => {
    expect(HOLD_DURATION_MS).toBe(800); // 800ms for quality capture (300ms in E2E mode)
  });

  it('should capture multiple frames during hold', () => {
    const capturesPerHold = Math.floor(HOLD_DURATION_MS / CAPTURE_INTERVAL_MS);
    expect(capturesPerHold).toBeGreaterThanOrEqual(3);
    expect(capturesPerHold).toBeLessThanOrEqual(10);
  });

  it('should keep limited frames per step', () => {
    expect(MAX_FRAMES_PER_STEP).toBe(5);
  });
});

describe('Step Instruction Text', () => {
  it('should have clear instructions for all steps', () => {
    ENROLLMENT_STEPS.forEach(step => {
      expect(step.instruction).toBeTruthy();
      expect(step.instruction.length).toBeGreaterThan(10);
      expect(step.instruction.length).toBeLessThan(100);
    });
  });

  it('should have unique instructions', () => {
    const instructions = ENROLLMENT_STEPS.map(s => s.instruction);
    const uniqueInstructions = new Set(instructions);
    expect(uniqueInstructions.size).toBe(ENROLLMENT_STEPS.length);
  });
});

describe('Step Progression', () => {
  it('should have logical step order', () => {
    const stepOrder = ENROLLMENT_STEPS.map(s => s.id);
    
    // Starts with frontal
    expect(stepOrder[0]).toBe('straight');
    
    // Has lateral movements
    expect(stepOrder).toContain('left');
    expect(stepOrder).toContain('right');
    
    // Has vertical movements
    expect(stepOrder).toContain('up');
    expect(stepOrder).toContain('down');
    
    // Ends with liveness check
    expect(stepOrder[stepOrder.length - 1]).toBe('blink');
  });

  it('should have consistent tolerance ranges', () => {
    ENROLLMENT_STEPS.forEach(step => {
      expect(step.tolerances.yaw).toBeGreaterThan(0);
      expect(step.tolerances.yaw).toBeLessThanOrEqual(100); // Very wide for left/right
      
      expect(step.tolerances.pitch).toBeGreaterThan(0);
      expect(step.tolerances.pitch).toBeLessThanOrEqual(50); // Very forgiving tolerances
      
      expect(step.tolerances.roll).toBeGreaterThan(0);
      expect(step.tolerances.roll).toBeLessThanOrEqual(50); // Very forgiving
    });
  });
});

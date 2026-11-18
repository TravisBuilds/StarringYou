/**
 * IndexedDB storage for enrollment data
 * Privacy-focused: data stays in browser, can be deleted anytime
 */

import type { EnrollmentData, CapturedFrame } from '../types';

const DB_NAME = 'starringyou-db';
const DB_VERSION = 1;
const STORE_NAME = 'enrollment';

let db: IDBDatabase | null = null;

/**
 * Initialize IndexedDB
 */
export async function initStorage(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      resolve();
    };
    
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
  });
}

/**
 * Save enrollment data
 * Note: Strips ImageData from frames since it's not structured-cloneable
 * and can be reconstructed from dataUrl if needed
 */
export async function saveEnrollment(data: EnrollmentData): Promise<void> {
  if (!db) await initStorage();
  
  // Strip ImageData from frames (not structured-cloneable, reconstructable from dataUrl)
  const storableData = {
    frames: data.frames.map(frame => ({
      dataUrl: frame.dataUrl,
      landmarks: frame.landmarks,
      pose: frame.pose,
      quality: frame.quality,
      stepId: frame.stepId,
      timestamp: frame.timestamp,
      yaw: frame.yaw,
      pitch: frame.pitch
    })),
    bestFrontalFrame: data.bestFrontalFrame ? {
      dataUrl: data.bestFrontalFrame.dataUrl,
      landmarks: data.bestFrontalFrame.landmarks,
      pose: data.bestFrontalFrame.pose,
      quality: data.bestFrontalFrame.quality,
      stepId: data.bestFrontalFrame.stepId,
      timestamp: data.bestFrontalFrame.timestamp,
      yaw: data.bestFrontalFrame.yaw,
      pitch: data.bestFrontalFrame.pitch
    } : null,
    completedAt: data.completedAt
  };
  
  return new Promise((resolve, reject) => {
    const transaction = db!.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put({ id: 'current', ...storableData });
    
    request.onsuccess = () => {
      console.log('Enrollment saved to IndexedDB successfully');
      resolve();
    };
    request.onerror = () => {
      console.error('IndexedDB put error:', request.error);
      reject(request.error);
    };
  });
}

/**
 * Load enrollment data
 * Note: Loaded frames won't have imageData (stripped during save),
 * but it can be reconstructed from dataUrl if needed
 */
export async function loadEnrollment(): Promise<EnrollmentData | null> {
  if (!db) await initStorage();
  
  return new Promise((resolve, reject) => {
    const transaction = db!.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get('current');
    
    request.onsuccess = () => {
      const result = request.result;
      if (result) {
        const { id, ...data } = result;
        console.log('Loaded enrollment from IndexedDB:', {
          frameCount: data.frames?.length || 0,
          hasBestFrontal: !!data.bestFrontalFrame,
          completedAt: data.completedAt
        });
        
        // Add placeholder imageData (not needed for swap, uses dataUrl)
        if (data.frames) {
          data.frames = data.frames.map((f: any) => ({
            ...f,
            imageData: null as any // Placeholder, actual swap uses dataUrl
          }));
        }
        if (data.bestFrontalFrame) {
          data.bestFrontalFrame = {
            ...data.bestFrontalFrame,
            imageData: null as any
          };
        }
        
        resolve(data as EnrollmentData);
      } else {
        console.log('No enrollment found in IndexedDB');
        resolve(null);
      }
    };
    request.onerror = () => {
      console.error('IndexedDB get error:', request.error);
      reject(request.error);
    };
  });
}

/**
 * Delete all enrollment data
 */
export async function deleteEnrollment(): Promise<void> {
  if (!db) await initStorage();
  
  return new Promise((resolve, reject) => {
    const transaction = db!.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete('current');
    
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Convert captured frames to downloadable zip
 */
export async function createEnrollmentZip(frames: CapturedFrame[]): Promise<Blob> {
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  
  // Add images
  frames.forEach((frame, idx) => {
    const base64Data = frame.dataUrl.split(',')[1];
    zip.file(`frame_${idx + 1}_${frame.stepId}.jpg`, base64Data, { base64: true });
  });
  
  // Add metadata
  const metadata = {
    capturedAt: new Date().toISOString(),
    frameCount: frames.length,
    frames: frames.map((f, idx) => ({
      index: idx + 1,
      stepId: f.stepId,
      timestamp: f.timestamp,
      quality: f.quality,
      pose: f.pose
    }))
  };
  
  zip.file('metadata.json', JSON.stringify(metadata, null, 2));
  
  return zip.generateAsync({ type: 'blob' });
}

/**
 * Trigger download of a blob
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

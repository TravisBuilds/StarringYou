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
 * Note: Strips ImageData from frames (not needed for swap, uses dataUrl)
 * Landmarks are kept as plain arrays (structured-cloneable)
 */
export async function saveEnrollment(data: EnrollmentData): Promise<void> {
  if (!db) await initStorage();
  
  // Strip ImageData but keep landmarks as plain objects
  const storableData = {
    frames: data.frames.map(frame => ({
      dataUrl: frame.dataUrl,
      landmarks: {
        landmarks: frame.landmarks.landmarks.map(lm => ({ x: lm.x, y: lm.y, z: lm.z })),
        blendshapes: frame.landmarks.blendshapes?.map(bs => ({
          categoryName: bs.categoryName,
          score: bs.score
        }))
      },
      pose: frame.pose,
      quality: frame.quality,
      stepId: frame.stepId,
      timestamp: frame.timestamp,
      yaw: frame.yaw,
      pitch: frame.pitch
    })),
    bestFrontalFrame: data.bestFrontalFrame ? {
      dataUrl: data.bestFrontalFrame.dataUrl,
      landmarks: {
        landmarks: data.bestFrontalFrame.landmarks.landmarks.map(lm => ({ x: lm.x, y: lm.y, z: lm.z })),
        blendshapes: data.bestFrontalFrame.landmarks.blendshapes?.map(bs => ({
          categoryName: bs.categoryName,
          score: bs.score
        }))
      },
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
 * Note: Loaded frames won't have imageData (stripped during save)
 * ImageData will be reconstructed from dataUrl when needed for swap
 */
export async function loadEnrollment(): Promise<EnrollmentData | null> {
  if (!db) await initStorage();
  
  return new Promise(async (resolve, reject) => {
    const transaction = db!.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get('current');
    
    request.onsuccess = async () => {
      const result = request.result;
      if (result) {
        const { id, ...data } = result;
        console.log('Loaded enrollment from IndexedDB:', {
          frameCount: data.frames?.length || 0,
          hasBestFrontal: !!data.bestFrontalFrame,
          hasLandmarks: data.frames?.[0]?.landmarks != null,
          completedAt: data.completedAt
        });
        
        // Reconstruct ImageData from dataUrl for each frame
        if (data.frames) {
          data.frames = await Promise.all(data.frames.map(async (f: any) => ({
            ...f,
            imageData: await dataUrlToImageData(f.dataUrl)
          })));
        }
        if (data.bestFrontalFrame) {
          data.bestFrontalFrame = {
            ...data.bestFrontalFrame,
            imageData: await dataUrlToImageData(data.bestFrontalFrame.dataUrl)
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
 * Convert dataUrl back to ImageData
 */
async function dataUrlToImageData(dataUrl: string): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      resolve(ctx.getImageData(0, 0, canvas.width, canvas.height));
    };
    img.onerror = reject;
    img.src = dataUrl;
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

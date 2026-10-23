import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import NetInfo from '@react-native-community/netinfo';
import * as Crypto from 'expo-crypto';
import { postFieldReport } from './client';
import type { FieldReportSubmission } from './types';

const QUEUE_KEY = 'raah_report_queue';

export interface QueuedReport {
  clientId: string;
  submission: FieldReportSubmission;
  photoUri?: string | null;
  status: 'waiting' | 'pending' | 'verified' | 'rejected';
  createdAt: number;
  serverId?: number;
}

let isFlushing = false;
let retryDelay = 1000;
const MAX_RETRY_DELAY = 30000;

export async function getReports(): Promise<QueuedReport[]> {
  try {
    const data = await AsyncStorage.getItem(QUEUE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export async function saveReports(reports: QueuedReport[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(reports));
}

export async function enqueueReport(
  submission: FieldReportSubmission,
  tempPhotoUri?: string | null
): Promise<QueuedReport> {
  const clientId = Crypto.randomUUID();
  let permanentPhotoUri: string | null = null;

  if (tempPhotoUri) {
    const filename = tempPhotoUri.split('/').pop() || `${clientId}.jpg`;
    const docDir = (FileSystem as any).documentDirectory || 'file:///tmp/';
    permanentPhotoUri = `${docDir}${filename}`;
    try {
      await FileSystem.copyAsync({
        from: tempPhotoUri,
        to: permanentPhotoUri,
      });
    } catch {
      permanentPhotoUri = tempPhotoUri; // fallback
    }
  }

  const newReport: QueuedReport = {
    clientId,
    submission,
    photoUri: permanentPhotoUri,
    status: 'waiting',
    createdAt: Date.now(),
  };

  const reports = await getReports();
  reports.push(newReport);
  await saveReports(reports);

  flushQueue();
  return newReport;
}

export async function flushQueue() {
  if (isFlushing) return;

  const state = await NetInfo.fetch();
  if (!state.isConnected) return;

  isFlushing = true;

  try {
    const reports = await getReports();
    const waitingReports = reports
      .filter(r => r.status === 'waiting')
      .sort((a, b) => a.createdAt - b.createdAt);

    for (const report of waitingReports) {
      try {
        const result = await postFieldReport(report.submission);

        const idx = reports.findIndex(r => r.clientId === report.clientId);
        if (idx >= 0) {
          reports[idx].status = 'pending';
          reports[idx].serverId = result.id;
        }
        await saveReports(reports);
        retryDelay = 1000;
      } catch (err: any) {
        if (err.name === 'HttpError') {
          const status = err.status;
          if (status === 422 || status === 409) {
            // Unrecoverable or already exists
            const idx = reports.findIndex(r => r.clientId === report.clientId);
            if (idx >= 0) {
              reports[idx].status = 'rejected';
            }
            await saveReports(reports);
            continue;
          }
        }
        throw err; // Network error or 429, retry later
      }
    }
  } catch (error) {
    setTimeout(flushQueue, retryDelay);
    retryDelay = Math.min(retryDelay * 2, MAX_RETRY_DELAY);
  } finally {
    isFlushing = false;
  }
}

NetInfo.addEventListener(state => {
  if (state.isConnected) {
    retryDelay = 1000;
    flushQueue();
  }
});

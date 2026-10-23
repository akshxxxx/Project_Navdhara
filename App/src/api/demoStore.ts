import { create } from 'zustand';

interface DemoState {
  simulateRainMm: number | null;
  asOf: string | null;
  useSavedData: boolean;
  userForcedSavedData: boolean;
  setSimulateRainMm: (mm: number | null) => void;
  setAsOf: (date: string | null) => void;
  setUseSavedData: (val: boolean, isUserForced?: boolean) => void;
  reset: () => void;
}

export const useDemoStore = create<DemoState>((set) => ({
  simulateRainMm: null,
  asOf: null,
  useSavedData: false,
  userForcedSavedData: false,
  setSimulateRainMm: (mm) => set({ simulateRainMm: mm }),
  setAsOf: (date) => set({ asOf: date }),
  setUseSavedData: (val, isUserForced = false) => set({ useSavedData: val, userForcedSavedData: isUserForced ? val : false }),
  reset: () => set({ simulateRainMm: null, asOf: null, useSavedData: false, userForcedSavedData: false }),
}));

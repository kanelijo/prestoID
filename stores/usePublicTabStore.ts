import { create } from 'zustand';

interface PublicTabState {
  activeTab: number; // 0: Test, 1: Leaderboard, 2: Feed
  setActiveTab: (tab: number) => void;
  // Trigger pager scroll to specific page
  targetPage: number | null;
  setTargetPage: (page: number | null) => void;
}

export const usePublicTabStore = create<PublicTabState>((set) => ({
  activeTab: 0,
  setActiveTab: (tab: number) => set({ activeTab: tab }),
  targetPage: null,
  setTargetPage: (page: number | null) => set({ targetPage: page }),
}));

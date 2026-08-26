import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import * as FileSystem from 'expo-file-system/legacy';

interface QuizState {
  answers: Record<string, number>; // { questionId: selectedIndex }
  setAnswer: (questionId: string, index: number) => void;
  submitToLocal: (testId: string) => Promise<void>;
  loadFromLocal: (testId: string) => Promise<void>;
  clearAnswers: () => void;
}

export const useQuizStore = create<QuizState>((set, get) => ({
  answers: {},
  setAnswer: (id, index) => set((state) => ({
    answers: { ...state.answers, [id]: index }
  })),
  submitToLocal: async (testId: string) => {
    // Background sync to save progress locally so nothing is lost if app dies
    try {
      const answers = get().answers;
      const path = `${FileSystem.documentDirectory}test_${testId}_progress.json`;
      await FileSystem.writeAsStringAsync(path, JSON.stringify(answers));
    } catch (e) {
      console.warn('Failed to save test progress locally', e);
    }
  },
  loadFromLocal: async (testId: string) => {
    try {
      const path = `${FileSystem.documentDirectory}test_${testId}_progress.json`;
      const fileInfo = await FileSystem.getInfoAsync(path);
      if (fileInfo.exists) {
        const content = await FileSystem.readAsStringAsync(path);
        const loadedAnswers = JSON.parse(content);
        set({ answers: loadedAnswers });
      }
    } catch (e) {
      console.warn('Failed to load local test progress', e);
    }
  },
  clearAnswers: () => set({ answers: {} })
}));

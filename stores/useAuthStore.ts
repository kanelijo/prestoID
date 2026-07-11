import { create } from 'zustand';

export type UserRole = 'student' | 'admin';

interface AuthState {
  user: any | null;
  session: any | null;
  role: UserRole | null;
  businessId: string | null;       // Internal Supabase UUID of the business
  businessCode: string | null;     // Human-friendly ID e.g. "ALP-7X9K"
  businessName: string | null;
  businessType: string | null;     // e.g. "Coaching", "Library", etc.
  isLoading: boolean;
  isOnboarded: boolean;
  verified: boolean;
  avatarUrl: string | null;
  studentData: any | null;

  setUser: (user: any) => void;
  setSession: (session: any) => void;
  setRole: (role: UserRole) => void;
  setBusiness: (businessId: string, businessCode: string, businessName: string, businessType?: string) => void;
  setLoading: (loading: boolean) => void;
  setOnboarded: (onboarded: boolean) => void;
  setVerified: (verified: boolean) => void;
  setAvatarUrl: (avatarUrl: string | null) => void;
  setStudentData: (data: any | null) => void;
  reset: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  session: null,
  role: null,
  businessId: null,
  businessCode: null,
  businessName: null,
  businessType: null,
  isLoading: true,
  isOnboarded: false,
  verified: true,
  avatarUrl: null,
  studentData: null,

  setUser: (user) => set({ user }),
  setSession: (session) => set({ session }),
  setRole: (role) => set({ role }),
  setBusiness: (businessId, businessCode, businessName, businessType = 'Coaching') =>
    set({ businessId, businessCode, businessName, businessType }),
  setLoading: (isLoading) => set({ isLoading }),
  setOnboarded: (isOnboarded) => set({ isOnboarded }),
  setVerified: (verified) => set({ verified }),
  setAvatarUrl: (avatarUrl) => set({ avatarUrl }),
  setStudentData: (studentData) => set({ studentData }),
  reset: () =>
    set({
      user: null,
      session: null,
      role: null,
      businessId: null,
      businessCode: null,
      businessName: null,
      businessType: null,
      isLoading: false,
      verified: true,
      avatarUrl: null,
      studentData: null,
    }),
}));

import { create } from 'zustand';

export interface PeerMessage {
  id: string | number;
  sender_id: string;
  receiver_id: string;
  text: string;
  created_at: string;
  is_read?: boolean;
  is_delivered?: boolean;
  reply_to_id?: string | null;
  is_deleted_for_me?: boolean;
  is_deleted_for_everyone?: boolean;
}

interface ChatStore {
  // Dictionary of peerId -> array of messages
  messagesByPeer: Record<string, PeerMessage[]>;
  
  // Set messages for a specific peer
  setMessages: (peerId: string, messages: PeerMessage[]) => void;
  
  // Add new messages (or update existing ones) for a specific peer
  addOrUpdateMessages: (peerId: string, newMessages: PeerMessage[]) => void;
  
  // Clear RAM cache
  clearCache: () => void;
}

export const useChatStore = create<ChatStore>((set) => ({
  messagesByPeer: {},
  
  setMessages: (peerId, messages) => 
    set((state) => ({
      messagesByPeer: {
        ...state.messagesByPeer,
        [peerId]: [...messages].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      }
    })),
    
  addOrUpdateMessages: (peerId, newMessages) =>
    set((state) => {
      const existing = state.messagesByPeer[peerId] || [];
      const updated = [...existing];
      
      newMessages.forEach((newMsg) => {
        const index = updated.findIndex((m) => m.id === newMsg.id);
        if (index >= 0) {
          updated[index] = { ...updated[index], ...newMsg };
        } else {
          updated.push(newMsg);
        }
      });
      
      return {
        messagesByPeer: {
          ...state.messagesByPeer,
          [peerId]: updated.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
        }
      };
    }),
    
  clearCache: () => set({ messagesByPeer: {} }),
}));

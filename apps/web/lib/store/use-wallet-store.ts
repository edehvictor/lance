import { create } from "zustand";

export interface WalletInfo {
  address: string;
  walletId: string;
  walletName: string;
  walletIcon: string;
}

interface WalletState {
  info: WalletInfo | null;
  setWallet: (info: WalletInfo) => void;
  clearWallet: () => void;
}

export const useWalletStore = create<WalletState>((set) => ({
  info: null,
  setWallet: (info) => set({ info }),
  clearWallet: () => set({ info: null }),
}));

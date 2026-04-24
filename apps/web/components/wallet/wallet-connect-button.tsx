"use client";

import { useEffect, useState } from "react";
import { Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WalletProviderIcon } from "@/components/wallet/wallet-provider-icon";
import { useWalletStore } from "@/lib/store/use-wallet-store";
import {
  connectWalletWithInfo,
  getConnectedWalletAddress,
  getSelectedWalletId,
  getWalletInfo,
} from "@/lib/stellar";

function truncate(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/**
 * Top-nav pill that shows the connected wallet provider's icon + truncated
 * address, or a "Connect wallet" CTA when no session is active. On mount it
 * restores provider metadata for a previously-selected wallet so the icon is
 * visible immediately after a page refresh.
 */
export function WalletConnectButton() {
  const info = useWalletStore((state) => state.info);
  const setWallet = useWalletStore((state) => state.setWallet);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    if (info) return;
    const walletId = getSelectedWalletId();
    if (!walletId) return;

    let cancelled = false;
    (async () => {
      const [address, meta] = await Promise.all([
        getConnectedWalletAddress(),
        getWalletInfo(walletId),
      ]);
      if (cancelled || !address || !meta) return;
      setWallet({
        address,
        walletId: meta.id,
        walletName: meta.name,
        walletIcon: meta.icon,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [info, setWallet]);

  async function handleConnect() {
    if (connecting) return;
    setConnecting(true);
    try {
      const wallet = await connectWalletWithInfo();
      setWallet(wallet);
    } catch {
      // User dismissed modal or extension errored; silent fail keeps UI stable.
    } finally {
      setConnecting(false);
    }
  }

  if (info) {
    return (
      <div
        className="hidden items-center gap-2 rounded-full border border-border/70 bg-card/70 px-3 py-1.5 text-sm md:flex"
        aria-label={`Connected to ${info.walletName}`}
      >
        <WalletProviderIcon
          walletName={info.walletName}
          walletIcon={info.walletIcon}
          size={18}
        />
        <span className="font-medium text-foreground">{info.walletName}</span>
        <span className="text-xs text-muted-foreground">
          {truncate(info.address)}
        </span>
      </div>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleConnect}
      disabled={connecting}
      className="rounded-full"
      aria-label="Connect Stellar wallet"
    >
      <Wallet className="mr-2 h-4 w-4" />
      {connecting ? "Connecting…" : "Connect wallet"}
    </Button>
  );
}

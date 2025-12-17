import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "./SolanaProvider";
import { Button } from "@/components/ui/button";
import { Wallet, ChevronDown, LogOut } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function WalletButton() {
  const { connected, connecting, publicKey, disconnect, wallet } = useWallet();
  const { setVisible } = useWalletModal();

  const formatAddress = (address: string) =>
    `${address.slice(0, 4)}...${address.slice(-4)}`;

  if (connecting) {
    return (
      <Button variant="outline" size="sm" disabled className="gap-2">
        <Wallet size={16} className="text-primary/50" />
        Connecting...
      </Button>
    );
  }

  if (!connected || !publicKey) {
    return (
      <Button 
        size="sm" 
        onClick={() => setVisible(true)} 
        className="group gap-2 border border-transparent hover:border-primary/30 transition-all"
      >
        <Wallet 
          size={16} 
          className="text-primary-foreground group-hover:drop-shadow-[0_0_4px_hsl(45_93%_54%_/_0.5)] transition-all" 
        />
        Select Wallet
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="outline" 
          size="sm" 
          className="group gap-2 border-primary/30 hover:border-primary/50 transition-all"
        >
          {wallet?.adapter.icon && (
            <img 
              src={wallet.adapter.icon} 
              alt={wallet.adapter.name}
              className="w-4 h-4 rounded"
            />
          )}
          {formatAddress(publicKey.toBase58())}
          <ChevronDown size={14} className="text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="bg-popover z-50">
        <DropdownMenuItem className="gap-2 text-muted-foreground">
          <Wallet size={16} />
          {wallet?.adapter.name}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setVisible(true)} className="gap-2 cursor-pointer">
          <Wallet size={16} className="text-primary" />
          Change Wallet
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => disconnect()} className="gap-2 cursor-pointer text-destructive">
          <LogOut size={16} />
          Disconnect
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

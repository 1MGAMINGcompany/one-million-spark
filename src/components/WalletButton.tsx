import { useWeb3Modal } from "@web3modal/wagmi/react";
import { Button } from "@/components/ui/button";
import { useWallet } from "@/hooks/useWallet";
import { Wallet, AlertTriangle, LogOut } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function WalletButton() {
  const { open } = useWeb3Modal();
  const { address, isConnected, isConnecting, isWrongNetwork, disconnect, switchToPolygon } =
    useWallet();

  const formatAddress = (addr: string) =>
    `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  if (isConnecting) {
    return (
      <Button variant="outline" size="sm" disabled className="gap-2">
        <Wallet size={16} className="text-primary/50" />
        Connecting...
      </Button>
    );
  }

  if (!isConnected) {
    return (
      <Button 
        size="sm" 
        onClick={() => open()} 
        className="group gap-2 border border-transparent hover:border-primary/30 transition-all"
      >
        <Wallet 
          size={16} 
          className="text-primary-foreground group-hover:drop-shadow-[0_0_4px_hsl(45_93%_54%_/_0.5)] transition-all" 
        />
        Connect Wallet
      </Button>
    );
  }

  if (isWrongNetwork) {
    return (
      <Button
        variant="destructive"
        size="sm"
        onClick={switchToPolygon}
        className="gap-2"
      >
        <AlertTriangle size={16} />
        Switch to Polygon
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
          <Wallet 
            size={16} 
            className="text-primary group-hover:drop-shadow-[0_0_4px_hsl(45_93%_54%_/_0.5)] transition-all" 
          />
          {formatAddress(address!)}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="bg-popover z-50">
        <DropdownMenuItem onClick={() => open()} className="gap-2 cursor-pointer">
          <Wallet size={16} className="text-primary" />
          Wallet Details
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => disconnect()} className="gap-2 cursor-pointer">
          <LogOut size={16} className="text-primary" />
          Disconnect
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

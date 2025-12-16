import { Button } from "@/components/ui/button";
import { useSmartAccount } from "@/components/ThirdwebSmartProvider";
import { Wallet, AlertTriangle, LogOut, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function SmartWalletButton() {
  const { 
    address, 
    isConnected, 
    isConnecting, 
    connectMetaMask, 
    connectWalletConnect,
    disconnect 
  } = useSmartAccount();

  const formatAddress = (addr: string) =>
    `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  const handleConnectMetaMask = async () => {
    try {
      await connectMetaMask();
      toast.success("Smart Account connected!");
    } catch (error: any) {
      toast.error(error?.message || "Failed to connect");
    }
  };

  const handleConnectWalletConnect = async () => {
    try {
      await connectWalletConnect();
      toast.success("Smart Account connected!");
    } catch (error: any) {
      toast.error(error?.message || "Failed to connect");
    }
  };

  if (isConnecting) {
    return (
      <Button variant="outline" size="sm" disabled className="gap-2">
        <Loader2 size={16} className="animate-spin text-primary/50" />
        Connecting...
      </Button>
    );
  }

  if (!isConnected) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button 
            size="sm" 
            className="group gap-2 border border-transparent hover:border-primary/30 transition-all"
          >
            <Wallet 
              size={16} 
              className="text-primary-foreground group-hover:drop-shadow-[0_0_4px_hsl(45_93%_54%_/_0.5)] transition-all" 
            />
            Connect Wallet
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="bg-popover z-50">
          <DropdownMenuItem onClick={handleConnectMetaMask} className="gap-2 cursor-pointer">
            <Wallet size={16} className="text-primary" />
            MetaMask
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleConnectWalletConnect} className="gap-2 cursor-pointer">
            <Wallet size={16} className="text-primary" />
            WalletConnect
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
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
          <span className="text-xs text-primary/60 ml-1">⚡</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="bg-popover z-50">
        <DropdownMenuItem className="gap-2 cursor-default text-muted-foreground text-xs">
          Smart Account (Gasless)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => disconnect()} className="gap-2 cursor-pointer">
          <LogOut size={16} className="text-primary" />
          Disconnect
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

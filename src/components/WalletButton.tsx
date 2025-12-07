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
      <Button variant="outline" size="sm" disabled>
        <Wallet size={16} />
        Connecting...
      </Button>
    );
  }

  if (!isConnected) {
    return (
      <Button variant="outline" size="sm" onClick={() => open()}>
        <Wallet size={16} />
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
        <Button variant="outline" size="sm" className="gap-2">
          <Wallet size={16} />
          {formatAddress(address!)}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="bg-popover z-50">
        <DropdownMenuItem onClick={() => open()}>
          <Wallet size={16} />
          Wallet Details
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => disconnect()}>
          <LogOut size={16} />
          Disconnect
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

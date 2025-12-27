/**
 * WalletLink - Clickable wallet address that navigates to player profile
 * Displays shortened wallet with hover affordance
 */

import { useNavigate } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';

interface WalletLinkProps {
  wallet: string;
  className?: string;
  showIcon?: boolean;
  prefix?: string; // e.g., "You vs "
  suffix?: string; // e.g., " (Creator)"
}

// Shorten wallet for display
function shortenWallet(address: string): string {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

export function WalletLink({ wallet, className = '', showIcon = false, prefix = '', suffix = '' }: WalletLinkProps) {
  const navigate = useNavigate();

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    navigate(`/player/${wallet}`);
  };

  return (
    <button
      onClick={handleClick}
      className={`
        inline-flex items-center gap-1
        font-mono
        text-foreground hover:text-primary
        underline-offset-2 hover:underline
        transition-colors duration-150
        cursor-pointer
        ${className}
      `}
      title="View player record"
    >
      {prefix && <span className="no-underline">{prefix}</span>}
      {shortenWallet(wallet)}
      {showIcon && <ExternalLink className="h-3 w-3 opacity-50" />}
      {suffix && <span className="no-underline">{suffix}</span>}
    </button>
  );
}

// Utility for getting shortened wallet (for use without link)
export function getShortenedWallet(address: string): string {
  return shortenWallet(address);
}

import { useRef, useCallback } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { Copy, Download, Check } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface Props {
  subdomain: string;
  size?: number;
}

export default function OperatorQRCode({ subdomain, size = 180 }: Props) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const url = `https://1mg.live/${subdomain}`;

  const copyLink = useCallback(() => {
    navigator.clipboard.writeText(url);
    setCopied(true);
    toast.success("Link copied!");
    setTimeout(() => setCopied(false), 2000);
  }, [url]);

  const downloadQR = useCallback(() => {
    const canvas = canvasRef.current?.querySelector("canvas");
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = `${subdomain}-qr.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
    toast.success("QR code downloaded!");
  }, [subdomain]);

  return (
    <div className="flex flex-col items-center gap-4">
      <div ref={canvasRef} className="bg-white rounded-xl p-3">
        <QRCodeCanvas value={url} size={size} level="H" includeMargin={false} />
      </div>
      <p className="text-xs text-white/40 text-center break-all">{url}</p>
      <div className="flex gap-2">
        <Button onClick={copyLink} size="sm" variant="outline" className="border-white/10 text-white hover:bg-white/5 text-xs gap-1.5">
          {copied ? <Check size={12} /> : <Copy size={12} />}
          Copy Link
        </Button>
        <Button onClick={downloadQR} size="sm" variant="outline" className="border-white/10 text-white hover:bg-white/5 text-xs gap-1.5">
          <Download size={12} /> Download QR
        </Button>
      </div>
    </div>
  );
}

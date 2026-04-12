import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Upload, Link, X, AlertCircle, Image as ImageIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
const ALLOWED_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".svg"];
const MAX_SIZE_BYTES = 2 * 1024 * 1024; // 2MB
const MAX_SIZE_LABEL = "2MB";

interface Props {
  value: string; // current logo URL
  onChange: (url: string) => void;
  operatorId: string;
}

export default function OperatorLogoUpload({ value, onChange, operatorId }: Props) {
  const [mode, setMode] = useState<"url" | "upload">("url");
  const [urlInput, setUrlInput] = useState(value || "");
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(value || "");
  const [previewError, setPreviewError] = useState(false);
  const [validationError, setValidationError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const validateUrl = (url: string): boolean => {
    if (!url) return true; // empty is ok (clear logo)
    try {
      const u = new URL(url);
      if (!["http:", "https:"].includes(u.protocol)) {
        setValidationError("URL must start with https://");
        return false;
      }
      const ext = u.pathname.toLowerCase().split(".").pop();
      if (ext && !["png", "jpg", "jpeg", "webp", "svg"].includes(ext)) {
        // Don't block — some CDN URLs don't have extensions
      }
      setValidationError("");
      return true;
    } catch {
      setValidationError("Invalid URL format");
      return false;
    }
  };

  const handleUrlApply = () => {
    if (!validateUrl(urlInput)) return;
    setPreviewUrl(urlInput);
    setPreviewError(false);
    onChange(urlInput);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate type
    if (!ALLOWED_TYPES.includes(file.type)) {
      setValidationError(`Unsupported file type. Use: ${ALLOWED_EXTENSIONS.join(", ")}`);
      return;
    }

    // Validate size
    if (file.size > MAX_SIZE_BYTES) {
      setValidationError(`File too large (max ${MAX_SIZE_LABEL})`);
      return;
    }

    setValidationError("");
    setUploading(true);

    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      const path = `${operatorId}/logo.${ext}`;

      const { error } = await supabase.storage
        .from("operator-logos")
        .upload(path, file, { upsert: true, contentType: file.type });

      if (error) {
        toast.error("Upload failed: " + error.message);
        return;
      }

      const { data: publicData } = supabase.storage
        .from("operator-logos")
        .getPublicUrl(path);

      // Add cache-bust to force refresh
      const publicUrl = publicData.publicUrl + "?t=" + Date.now();
      setPreviewUrl(publicUrl);
      setPreviewError(false);
      setUrlInput(publicUrl);
      onChange(publicUrl);
      toast.success("Logo uploaded");
    } catch (err: any) {
      toast.error("Upload failed");
    } finally {
      setUploading(false);
      // Reset file input
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const clearLogo = () => {
    setPreviewUrl("");
    setUrlInput("");
    setPreviewError(false);
    setValidationError("");
    onChange("");
  };

  return (
    <div className="space-y-3">
      <label className="text-xs text-white/40 block">Logo</label>

      {/* Preview */}
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center overflow-hidden shrink-0">
          {previewUrl && !previewError ? (
            <img
              src={previewUrl}
              alt="Logo preview"
              className="w-full h-full object-contain p-1"
              onError={() => setPreviewError(true)}
            />
          ) : previewUrl && previewError ? (
            <div className="text-center">
              <AlertCircle size={16} className="text-red-400 mx-auto" />
              <span className="text-[8px] text-red-400">Failed</span>
            </div>
          ) : (
            <ImageIcon size={20} className="text-white/20" />
          )}
        </div>

        {previewUrl && (
          <button
            onClick={clearLogo}
            className="text-[10px] text-white/30 hover:text-white/60 flex items-center gap-1"
          >
            <X size={10} /> Remove
          </button>
        )}
      </div>

      {/* Mode toggle */}
      <div className="flex gap-1 bg-white/[0.03] p-0.5 rounded-md w-fit">
        <button
          onClick={() => setMode("url")}
          className={`px-3 py-1 rounded text-xs font-medium transition-colors flex items-center gap-1 ${
            mode === "url" ? "bg-white/10 text-white" : "text-white/40 hover:text-white/60"
          }`}
        >
          <Link size={12} /> URL
        </button>
        <button
          onClick={() => setMode("upload")}
          className={`px-3 py-1 rounded text-xs font-medium transition-colors flex items-center gap-1 ${
            mode === "upload" ? "bg-white/10 text-white" : "text-white/40 hover:text-white/60"
          }`}
        >
          <Upload size={12} /> Upload
        </button>
      </div>

      {/* URL input */}
      {mode === "url" && (
        <div className="flex gap-2">
          <Input
            value={urlInput}
            onChange={(e) => {
              setUrlInput(e.target.value);
              setValidationError("");
            }}
            placeholder="https://example.com/logo.png"
            className="bg-white/5 border-white/10 text-white text-sm flex-1"
          />
          <Button
            size="sm"
            onClick={handleUrlApply}
            className="bg-white/10 hover:bg-white/15 border-0 text-xs whitespace-nowrap"
          >
            Apply
          </Button>
        </div>
      )}

      {/* Upload input */}
      {mode === "upload" && (
        <div>
          <input
            ref={fileRef}
            type="file"
            accept=".png,.jpg,.jpeg,.webp,.svg"
            onChange={handleFileSelect}
            className="hidden"
          />
          <Button
            size="sm"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="bg-white/10 hover:bg-white/15 border-0 text-xs gap-1"
          >
            <Upload size={14} />
            {uploading ? "Uploading..." : "Choose File"}
          </Button>
          <p className="text-[10px] text-white/20 mt-1">
            PNG, JPG, WebP, or SVG • max {MAX_SIZE_LABEL} • square recommended
          </p>
        </div>
      )}

      {/* Validation error */}
      {validationError && (
        <div className="text-xs text-red-400 flex items-center gap-1">
          <AlertCircle size={12} /> {validationError}
        </div>
      )}

      {/* Fallback warning */}
      {previewError && (
        <div className="text-xs text-yellow-400 flex items-center gap-1">
          <AlertCircle size={12} /> Logo URL failed to load. Your app will show a fallback icon.
        </div>
      )}
    </div>
  );
}

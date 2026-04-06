"use client";

import { useState, useRef, useCallback } from "react";
import { Camera, Trash2, Loader2, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";

function getCsrfToken(): string {
  const match = document.cookie
    .split("; ")
    .find((c) => c.startsWith("csrf-token="));
  return match?.split("=")[1] ?? "";
}

interface LogoUploadProps {
  currentLogo?: string;
  companyName?: string;
  onUploadComplete: (url: string) => void;
  onRemove: () => void;
}

const MAX_SIZE = 2 * 1024 * 1024; // 2MB
const ALLOWED = ["image/jpeg", "image/png", "image/webp"];

export function LogoUpload({ currentLogo, companyName, onUploadComplete, onRemove }: LogoUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const displayUrl = preview ?? currentLogo;

  const handleSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");

    if (!ALLOWED.includes(file.type)) {
      setError("Only JPEG, PNG, and WebP images are allowed.");
      return;
    }
    if (file.size > MAX_SIZE) {
      setError("Image must be under 2MB.");
      return;
    }

    // Show preview immediately
    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result as string);
    reader.readAsDataURL(file);

    // Upload
    setUploading(true);
    try {
      const form = new FormData();
      form.append("logo", file);
      const res = await fetch("/api/employers/logo", {
        method: "POST",
        body: form,
        headers: { "x-csrf-token": getCsrfToken() },
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Upload failed");
        setPreview(null);
        return;
      }
      const data = await res.json();
      onUploadComplete(data.url);
    } catch {
      setError("Network error. Please try again.");
      setPreview(null);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }, [onUploadComplete]);

  const handleRemove = useCallback(async () => {
    setUploading(true);
    setError("");
    try {
      const res = await fetch("/api/employers/logo", {
        method: "DELETE",
        headers: { "x-csrf-token": getCsrfToken() },
      });
      if (res.ok) {
        setPreview(null);
        onRemove();
      }
    } catch {
      setError("Failed to remove logo.");
    } finally {
      setUploading(false);
    }
  }, [onRemove]);

  const initials = companyName
    ? companyName.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase()
    : "CO";

  return (
    <div className="flex items-center gap-5">
      <div className="relative group">
        <div className="w-20 h-20 rounded-xl border-2 border-dashed border-border/60 bg-muted/30 flex items-center justify-center overflow-hidden transition-colors group-hover:border-primary/40">
          {displayUrl ? (
            <img
              src={displayUrl}
              alt="Company logo"
              className="w-full h-full object-cover rounded-xl"
            />
          ) : (
            <span className="text-xl font-bold text-muted-foreground/60">{initials}</span>
          )}
          {uploading && (
            <div className="absolute inset-0 bg-background/70 flex items-center justify-center rounded-xl">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-primary text-white flex items-center justify-center shadow-md hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          <Camera className="w-3.5 h-3.5" />
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleSelect}
          className="hidden"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <p className="text-sm font-medium">Company Logo</p>
        <p className="text-xs text-muted-foreground">JPEG, PNG or WebP. Max 2MB.</p>
        <div className="flex gap-2 mt-1">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="h-7 text-xs"
          >
            {displayUrl ? "Change" : "Upload"}
          </Button>
          {displayUrl && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={handleRemove}
              disabled={uploading}
              className="h-7 text-xs text-destructive hover:text-destructive"
            >
              <Trash2 className="w-3 h-3 me-1" />
              Remove
            </Button>
          )}
        </div>
        {error && <p className="text-xs text-destructive mt-0.5">{error}</p>}
      </div>
    </div>
  );
}

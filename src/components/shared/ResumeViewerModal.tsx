"use client";

import { useState } from "react";
import { X, Download, FileText, ZoomIn, ZoomOut, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ResumeViewerModalProps {
  url: string;
  fileName?: string;
  candidateName?: string;
  onClose: () => void;
}

export function ResumeViewerModal({
  url,
  fileName,
  candidateName,
  onClose,
}: ResumeViewerModalProps) {
  const isPdf = url.toLowerCase().includes(".pdf") || url.includes("application/pdf");
  const [imgScale, setImgScale] = useState(1);
  const [imgRotation, setImgRotation] = useState(0);

  const displayName = fileName ?? (candidateName ? `${candidateName}'s CV` : "Resume");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative flex flex-col bg-background rounded-xl shadow-2xl w-full max-w-4xl h-[90vh] mx-4">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className="text-sm font-medium truncate">{displayName}</span>
          </div>
          <div className="flex items-center gap-1 shrink-0 ms-2">
            {!isPdf && (
              <>
                <Button
                  variant="ghost" size="icon" className="h-8 w-8"
                  onClick={() => setImgScale((s) => Math.max(0.5, s - 0.25))}
                  title="Zoom out"
                >
                  <ZoomOut className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost" size="icon" className="h-8 w-8"
                  onClick={() => setImgScale((s) => Math.min(3, s + 0.25))}
                  title="Zoom in"
                >
                  <ZoomIn className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost" size="icon" className="h-8 w-8"
                  onClick={() => setImgRotation((r) => (r + 90) % 360)}
                  title="Rotate"
                >
                  <RotateCw className="w-4 h-4" />
                </Button>
              </>
            )}
            <a href={url} download={displayName} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                <Download className="w-3.5 h-3.5" />
                Download
              </Button>
            </a>
            <Button variant="ghost" size="icon" className="h-8 w-8 ms-1" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Viewer */}
        <div className="flex-1 overflow-auto bg-muted/30 rounded-b-xl">
          {isPdf ? (
            <iframe
              src={url}
              className="w-full h-full rounded-b-xl"
              title={displayName}
            />
          ) : (
            <div className="flex items-center justify-center min-h-full p-4">
              <img
                src={url}
                alt={displayName}
                style={{
                  transform: `scale(${imgScale}) rotate(${imgRotation}deg)`,
                  transition: "transform 0.2s ease",
                  maxWidth: "100%",
                  transformOrigin: "center",
                }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

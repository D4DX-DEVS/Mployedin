"use client";

/* ── Lightweight rich-text editor for resume descriptions ──
   Toolbar: bold / italic / underline / bullet list / numbered list / link.
   Emits sanitized, constrained HTML (see rich-text.ts). No external editor lib.
*/

import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  Bold, Italic, Underline as UnderlineIcon, List, ListOrdered, Link2, Check,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { sanitizeHtml } from "./rich-text";

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  minHeight?: number;
  className?: string;
}

export function RichTextEditor({
  value, onChange, placeholder, ariaLabel, minHeight = 88, className,
}: RichTextEditorProps) {
  const t = useTranslations("cvBuilderPage.richText");
  const editorRef = useRef<HTMLDivElement>(null);
  const savedRange = useRef<Range | null>(null);
  const [isEmpty, setIsEmpty] = useState(!value);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");

  /* Sync external value into the DOM only when it differs (preserves caret). */
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    const incoming = value || "";
    if (el.innerHTML !== incoming && document.activeElement !== el) {
      el.innerHTML = incoming;
      setIsEmpty(!el.textContent?.trim());
    }
  }, [value]);

  const emit = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    setIsEmpty(!el.textContent?.trim());
    onChange(sanitizeHtml(el.innerHTML));
  }, [onChange]);

  const exec = useCallback((command: string, arg?: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false, arg);
    emit();
  }, [emit]);

  const saveSelection = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && editorRef.current?.contains(sel.anchorNode)) {
      savedRange.current = sel.getRangeAt(0).cloneRange();
    }
  };

  const applyLink = () => {
    const url = linkUrl.trim();
    setLinkOpen(false);
    setLinkUrl("");
    if (!url) return;
    const href = /^(https?:|mailto:|tel:)/i.test(url) ? url : `https://${url}`;
    const el = editorRef.current;
    el?.focus();
    const sel = window.getSelection();
    if (savedRange.current && sel) {
      sel.removeAllRanges();
      sel.addRange(savedRange.current);
    }
    if (sel && sel.toString()) {
      document.execCommand("createLink", false, href);
    } else {
      document.execCommand("insertHTML", false, `<a href="${href}">${href}</a>`);
    }
    emit();
  };

  const ToolbarButton = ({
    onClick, icon: Icon, label,
  }: { onClick: () => void; icon: typeof Bold; label: string }) => (
    <button
      type="button"
      title={label}
      aria-label={label}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );

  return (
    <div className={cn("rounded-md border bg-background", className)}>
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 border-b px-1.5 py-1">
        <ToolbarButton onClick={() => exec("bold")} icon={Bold} label={t("bold")} />
        <ToolbarButton onClick={() => exec("italic")} icon={Italic} label={t("italic")} />
        <ToolbarButton onClick={() => exec("underline")} icon={UnderlineIcon} label={t("underline")} />
        <span className="mx-1 h-4 w-px bg-border" />
        <ToolbarButton onClick={() => exec("insertUnorderedList")} icon={List} label={t("bulletList")} />
        <ToolbarButton onClick={() => exec("insertOrderedList")} icon={ListOrdered} label={t("numberedList")} />
        <span className="mx-1 h-4 w-px bg-border" />
        <Popover open={linkOpen} onOpenChange={(open) => { if (open) saveSelection(); setLinkOpen(open); }}>
          <PopoverTrigger asChild>
            <button
              type="button"
              title={t("link")}
              aria-label={t("link")}
              onMouseDown={(e) => { e.preventDefault(); saveSelection(); }}
              className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Link2 className="h-3.5 w-3.5" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64 p-2">
            <div className="flex items-center gap-1.5">
              <Input
                autoFocus
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyLink(); } }}
                placeholder="https://..."
                className="h-8 text-sm"
              />
              <Button type="button" size="sm" className="h-8 px-2" onClick={applyLink}>
                <Check className="h-4 w-4" />
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Editable area */}
      <div className="relative">
        {isEmpty && placeholder && (
          <span className="pointer-events-none absolute left-3 top-2 text-sm text-muted-foreground">
            {placeholder}
          </span>
        )}
        <div
          ref={editorRef}
          role="textbox"
          aria-multiline="true"
          aria-label={ariaLabel ?? placeholder}
          contentEditable
          suppressContentEditableWarning
          onInput={emit}
          onBlur={emit}
          style={{ minHeight }}
          className="cv-rich-text px-3 py-2 text-sm leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [&_a]:text-primary [&_a]:underline [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5"
        />
      </div>
    </div>
  );
}

"use client";

import { Share2, Link2, MessageCircle, PencilLine, Copy, RotateCcw } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { buildJobShareMessage } from "@/lib/jobs/shareMessage";

/** What a job share says besides its title; every part optional. */
export interface SocialShareDetails {
  company?: string;
  location?: string;
  salary?: string;
  type?: string;
  skills?: string[];
}

interface SocialShareProps {
  url: string;
  title: string;
  description?: string;
  /** When given, the share carries a full job message the sharer can edit first. */
  details?: SocialShareDetails;
}

const MESSAGE_MAX = 1000;

export default function SocialShare({ url, title, details }: SocialShareProps) {
  const t = useTranslations("socialShare");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);

  const defaultMessage = useMemo(() => {
    if (!details) return `${title}\n${url}`;
    const skills = (details.skills ?? []).map((s) => s.trim()).filter(Boolean).slice(0, 5);
    return buildJobShareMessage({
      headline: t("messageHeadline", { title }),
      company: details.company,
      location: details.location,
      salary: details.salary,
      type: details.type,
      skills: skills.length > 0 ? t("messageSkills", { skills: skills.join(", ") }) : undefined,
      apply: t("messageApply", { url }),
    });
  }, [details, t, title, url]);
  const [draft, setDraft] = useState<string | null>(null);
  const message = (draft ?? defaultMessage).slice(0, MESSAGE_MAX);

  const encodedUrl = encodeURIComponent(url);
  const whatsappHref = `https://wa.me/?text=${encodeURIComponent(message)}`;
  const xHref = `https://twitter.com/intent/tweet?text=${encodeURIComponent(message)}`;

  const shareLinks = [
    {
      label: "WhatsApp",
      href: whatsappHref,
      color: "hover:bg-green-50 hover:text-green-600",
      icon: <MessageCircle className="w-4 h-4" />,
    },
    {
      label: "LinkedIn",
      href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
      color: "hover:bg-blue-50 hover:text-blue-600",
      icon: <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>,
    },
    {
      label: "Twitter",
      href: xHref,
      color: "hover:bg-sky-50 hover:text-sky-600",
      icon: <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>,
    },
    {
      label: "Facebook",
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
      color: "hover:bg-blue-50 hover:text-blue-700",
      icon: <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>,
    },
  ];

  const copy = async (text: string, done: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(done);
      setOpen(false);
    } catch {
      toast.error(t("failedCopy"));
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 text-sm border border-border rounded-lg hover:bg-accent transition-colors chip-pad"
        aria-label={t("shareJob")}
      >
        <Share2 className="w-4 h-4" />
        {t("share")}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 z-50 bg-popover border border-border rounded-xl shadow-lg min-w-[200px] chip-pad">
            {shareLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-foreground transition-colors ${link.color}`}
                onClick={() => setOpen(false)}
              >
                {link.icon}
                {link.label}
              </a>
            ))}
            <button
              onClick={() => void copy(url, t("linkCopied"))}
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-foreground hover:bg-accent transition-colors w-full"
            >
              <Link2 className="w-4 h-4" />
              {t("copyLink")}
            </button>
            {details && (
              <>
                <div className="my-1 border-t border-border" />
                <button
                  onClick={() => { setOpen(false); setEditing(true); }}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-foreground hover:bg-accent transition-colors w-full"
                >
                  <PencilLine className="w-4 h-4" />
                  {t("editMessage")}
                </button>
              </>
            )}
          </div>
        </>
      )}

      {details && (
        <Dialog open={editing} onOpenChange={setEditing}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{t("editMessageTitle")}</DialogTitle>
              <DialogDescription>{t("editMessageHint")}</DialogDescription>
            </DialogHeader>
            <label htmlFor="share-message" className="sr-only">{t("editMessageTitle")}</label>
            <Textarea
              id="share-message"
              dir="auto"
              rows={9}
              maxLength={MESSAGE_MAX}
              value={message}
              onChange={(e) => setDraft(e.target.value)}
            />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{t("editMessageCount", { count: message.length, max: MESSAGE_MAX })}</span>
              <Button type="button" variant="ghost" size="sm" onClick={() => setDraft(null)} disabled={draft === null}>
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                {t("resetMessage")}
              </Button>
            </div>
            <DialogFooter className="flex-col gap-2 sm:flex-row">
              <Button type="button" variant="outline" onClick={() => void copy(message, t("messageCopied"))}>
                <Copy className="h-4 w-4" aria-hidden="true" />
                {t("copyMessage")}
              </Button>
              <Button asChild variant="outline">
                <a href={xHref} target="_blank" rel="noopener noreferrer" onClick={() => setEditing(false)}>X</a>
              </Button>
              <Button asChild>
                <a href={whatsappHref} target="_blank" rel="noopener noreferrer" onClick={() => setEditing(false)}>
                  <MessageCircle className="h-4 w-4" aria-hidden="true" />
                  {t("sendOnWhatsApp")}
                </a>
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

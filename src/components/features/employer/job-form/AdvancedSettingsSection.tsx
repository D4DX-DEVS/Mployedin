"use client";

import { useState } from "react";
import { useFormContext } from "react-hook-form";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Settings, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { JobFormValues } from "./jobFormSchema";

export function AdvancedSettingsSection() {
  const [open, setOpen] = useState(false);
  const { register, watch, setValue } = useFormContext<JobFormValues>();

  const autoScreening = watch("autoScreeningEnabled");
  const minMatchScore = watch("minMatchScore");
  const visibility = watch("visibility");
  const tags = watch("tags") ?? [];
  const applicationMode = watch("applicationMode");

  const [tagInput, setTagInput] = useState("");

  function addTag(value: string) {
    const trimmed = value.trim().toLowerCase();
    if (!trimmed || tags.includes(trimmed) || tags.length >= 20) return;
    setValue("tags", [...tags, trimmed], { shouldValidate: false });
    setTagInput("");
  }

  function removeTag(tag: string) {
    setValue("tags", tags.filter((t) => t !== tag), { shouldValidate: false });
  }

  return (
    <div className="rounded-xl border border-border bg-background overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center justify-between w-full px-5 py-4 text-sm font-medium hover:bg-muted/40 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Settings className="w-4 h-4 text-muted-foreground" />
          Advanced Settings
        </div>
        <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        </motion.div>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="advanced"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 space-y-5 border-t border-border pt-4">

              {/* Application Mode */}
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Application Mode</Label>
                <Select
                  value={applicationMode}
                  onValueChange={(v) =>
                    setValue("applicationMode", v as "auto" | "manual", { shouldValidate: false })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">Manual Review — You review every applicant</SelectItem>
                    <SelectItem value="auto">Auto Match — AI shortlists top candidates</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Auto Screening */}
              <div className="space-y-3">
                <div className="flex items-center gap-3 p-3 rounded-lg border border-border">
                  <div className="flex-1">
                    <p className="text-sm font-medium">Auto Screening</p>
                    <p className="text-xs text-muted-foreground">
                      Automatically reject candidates below the match threshold
                    </p>
                  </div>
                  <Switch
                    checked={autoScreening}
                    onCheckedChange={(v) =>
                      setValue("autoScreeningEnabled", v, { shouldValidate: false })
                    }
                  />
                </div>

                <AnimatePresence>
                  {autoScreening && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="pl-4 border-l-2 border-primary/30 space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs text-muted-foreground">
                            Minimum Match Score
                          </Label>
                          <span className="text-sm font-semibold text-primary">
                            {minMatchScore}%
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          step={5}
                          value={minMatchScore}
                          onChange={(e) =>
                            setValue("minMatchScore", Number(e.target.value), {
                              shouldValidate: false,
                            })
                          }
                          className="w-full accent-primary"
                        />
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>0% (All)</span>
                          <span>50% (Moderate)</span>
                          <span>100% (Exact)</span>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Visibility */}
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Visibility</Label>
                <Select
                  value={visibility}
                  onValueChange={(v) =>
                    setValue("visibility", v as "public" | "private" | "invite_only", {
                      shouldValidate: false,
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="public">Public — Visible on job board</SelectItem>
                    <SelectItem value="private">Private — Only via direct link</SelectItem>
                    <SelectItem value="invite_only">Invite Only — Specific candidates</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Expiry Date */}
              <div className="space-y-1.5">
                <Label htmlFor="expires-at" className="text-sm font-medium">
                  Expiry Date
                </Label>
                <Input
                  id="expires-at"
                  type="date"
                  {...register("expiresAt")}
                  min={new Date().toISOString().split("T")[0]}
                  className="w-48"
                />
                <p className="text-xs text-muted-foreground">
                  Job auto-closes on this date (optional)
                </p>
              </div>

              {/* Max Applicants */}
              <div className="space-y-1.5">
                <Label htmlFor="max-applicants" className="text-sm font-medium">
                  Max Applicants
                </Label>
                <Input
                  id="max-applicants"
                  type="number"
                  min={1}
                  max={10000}
                  {...register("maxApplicants", { valueAsNumber: true, setValueAs: (v) => v === "" || isNaN(v) ? undefined : Number(v) })}
                  placeholder="No limit"
                  className="w-36"
                />
                <p className="text-xs text-muted-foreground">
                  Job auto-closes when this many applications are received (optional)
                </p>
              </div>

              {/* Tags */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Tags</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="Add tag (press Enter)"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addTag(tagInput);
                      } else if (e.key === ",") {
                        e.preventDefault();
                        addTag(tagInput);
                      }
                    }}
                    className="flex-1"
                  />
                </div>
                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {tags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="gap-1 text-xs">
                        {tag}
                        <button type="button" onClick={() => removeTag(tag)}>
                          <X className="w-3 h-3 hover:text-destructive" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Tags improve search visibility. Max 20.
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

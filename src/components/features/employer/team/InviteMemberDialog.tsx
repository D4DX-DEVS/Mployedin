"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Check, Copy, Mail, UserPlus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FormMultiSelect } from "@/components/shared/AppForm";
import { CompanyFunctionChecklist } from "@/components/features/employer/team/CompanyFunctionChecklist";
import { TeamInviteError, useInviteTeamMember } from "@/hooks/useTeam";
import type { CompanyRole, TeamInvitePayload } from "@/hooks/useTeam";
import type { PermissionFlag } from "@/lib/permissions/companyRoles";

type Mode = NonNullable<TeamInvitePayload["mode"]>;

interface Option {
  value: string;
  label: string;
}

interface Credentials {
  name: string;
  email: string;
  password: string;
  emailSent: boolean;
}

interface InviteMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roleOptions: Option[];
  jobOptions: Option[];
  showJobAccessForRoles: (roles: CompanyRole[]) => boolean;
}

const DEFAULT_ROLES: CompanyRole[] = ["hiring_manager"];

/**
 * Two ways in for a colleague: an emailed join link where they choose their
 * own password, or an account created on the spot with a temporary password
 * the employer hands over. The temporary password is shown here once — the
 * server keeps only its hash and never emails it.
 */
export function InviteMemberDialog({
  open,
  onOpenChange,
  roleOptions,
  jobOptions,
  showJobAccessForRoles,
}: InviteMemberDialogProps) {
  const t = useTranslations("employerTeam");
  const { locale } = useParams<{ locale: string }>();
  const inviteMutation = useInviteTeamMember();

  const [mode, setMode] = useState<Mode>("invite");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [companyRoles, setCompanyRoles] = useState<CompanyRole[]>(DEFAULT_ROLES);
  const [jobAccess, setJobAccess] = useState<string[]>([]);
  const [overrides, setOverrides] = useState<Partial<Record<PermissionFlag, boolean>>>({});
  const [emailError, setEmailError] = useState("");
  const [error, setError] = useState("");
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const saving = inviteMutation.isPending;
  const isTempPassword = mode === "temp_password";

  function reset() {
    setMode("invite");
    setName("");
    setEmail("");
    setCompanyRoles(DEFAULT_ROLES);
    setJobAccess([]);
    setOverrides({});
    setEmailError("");
    setError("");
    setCredentials(null);
    setCopiedField(null);
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (companyRoles.length === 0) {
      setError(t("selectAtLeastOneRole"));
      return;
    }
    setEmailError("");
    setError("");

    const payload: TeamInvitePayload = { email, companyRoles, mode };
    if (isTempPassword) payload.name = name.trim();
    if (Object.keys(overrides).length > 0) payload.permissionOverrides = overrides;
    // Only send jobAccess for restricted roles
    if (showJobAccessForRoles(companyRoles) && jobAccess.length > 0) payload.jobAccess = jobAccess;

    try {
      const result = await inviteMutation.mutateAsync(payload);
      if (result.credentials) {
        setCredentials({
          name: payload.name ?? result.credentials.email,
          email: result.credentials.email,
          password: result.credentials.password,
          emailSent: result.emailSent !== false,
        });
        return;
      }
      toast.success(t("inviteModal.inviteSent", { email: payload.email }));
      handleOpenChange(false);
    } catch (err: unknown) {
      const code = err instanceof TeamInviteError ? err.code : undefined;
      if (code === "email_in_use") setEmailError(t("inviteModal.errors.emailInUse"));
      else if (code === "already_member") setEmailError(t("inviteModal.errors.alreadyMember"));
      else setError(t("failedToSendInvite"));
    }
  }

  async function copyValue(field: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      setTimeout(() => setCopiedField((current) => (current === field ? null : current)), 2000);
    } catch {
      toast.error(t("credentials.copyFailed"));
    }
  }

  const signInUrl = typeof window !== "undefined" ? `${window.location.origin}/${locale}/login` : "";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {/* No overflow override: the role/job pickers portal their lists, and
          DialogContent's own overflow-y-auto is what lets the phone sheet
          (85dvh) scroll down to the submit button. */}
      <DialogContent className="w-full max-w-md mx-auto">
        {credentials ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-status-selected-bg flex items-center justify-center">
                  <Check className="h-4 w-4 text-status-selected" />
                </div>
                {t("credentials.title")}
              </DialogTitle>
              <DialogDescription>{t("credentials.intro", { name: credentials.name })}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-1">
              {[
                { field: "email", label: t("credentials.email"), value: credentials.email },
                { field: "password", label: t("credentials.password"), value: credentials.password },
              ].map(({ field, label, value }) => (
                <div key={field} className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
                  <div className="flex items-center gap-2">
                    <code className="min-w-0 flex-1 truncate rounded-lg border border-border bg-secondary/60 px-3 py-2 font-mono text-sm text-foreground">
                      {value}
                    </code>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => copyValue(field, value)}
                      aria-label={t("credentials.copyLabel", { label })}
                      className="h-10 shrink-0 gap-1.5 rounded-lg px-3 text-xs font-semibold"
                    >
                      {copiedField === field ? <Check className="h-3.5 w-3.5 text-status-selected" /> : <Copy className="h-3.5 w-3.5" />}
                      {copiedField === field ? t("credentials.copied") : t("credentials.copy")}
                    </Button>
                  </div>
                </div>
              ))}

              <div className="flex items-start gap-2 rounded-lg border border-status-shortlisted/20 bg-status-shortlisted-bg chip-pad text-sm text-status-shortlisted">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="space-y-1">
                  <p className="font-semibold">{t("credentials.onceWarning")}</p>
                  <p className="text-xs">
                    {credentials.emailSent
                      ? t("credentials.emailSent", { email: credentials.email })
                      : t("credentials.emailFailed")}
                  </p>
                  <p className="text-xs">{t("credentials.changeLater")}</p>
                </div>
              </div>

              <DialogFooter className="gap-2 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    copyValue(
                      "both",
                      [
                        `${t("credentials.signIn")}: ${signInUrl}`,
                        `${t("credentials.email")}: ${credentials.email}`,
                        `${t("credentials.password")}: ${credentials.password}`,
                      ].join("\n"),
                    )
                  }
                  className="flex-1 sm:flex-none gap-1.5"
                >
                  {copiedField === "both" ? <Check className="h-4 w-4 text-status-selected" /> : <Copy className="h-4 w-4" />}
                  {t("credentials.copyAll")}
                </Button>
                <Button type="button" onClick={() => handleOpenChange(false)} className="flex-1 sm:flex-none">
                  {t("credentials.done")}
                </Button>
              </DialogFooter>
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Users className="h-4 w-4 text-primary" />
                </div>
                {t("inviteModal.title")}
              </DialogTitle>
              <DialogDescription className="sr-only">{t("inviteModal.description")}</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 pt-1">
              <div className="field">
                <Label htmlFor="invite-email">{t("inviteModal.emailLabel")}</Label>
                <Input
                  id="invite-email"
                  type="email"
                  placeholder={t("inviteModal.emailPlaceholder")}
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setEmailError(""); }}
                  required
                  autoComplete="off"
                  aria-invalid={emailError ? true : undefined}
                  aria-describedby={emailError ? "invite-email-error" : undefined}
                />
                {emailError && (
                  <p id="invite-email-error" role="alert" className="text-sm text-status-rejected">
                    {emailError}
                  </p>
                )}
              </div>

              {/* One form, one optional switch: the whole row is the label, so
                  the hit area is the row rather than the 16px box. */}
              <label
                htmlFor="invite-temp-password"
                className={`relative flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${
                  isTempPassword ? "border-primary/40 bg-primary/5" : "border-border bg-secondary/30 hover:bg-secondary/50"
                }`}
              >
                <Checkbox
                  id="invite-temp-password"
                  checked={isTempPassword}
                  onCheckedChange={(checked) => { setMode(checked === true ? "temp_password" : "invite"); setError(""); }}
                  className="mt-0.5"
                />
                <span className="space-y-0.5">
                  <span className="block text-sm font-medium text-foreground">{t("inviteModal.tempPasswordToggle")}</span>
                  <span className="block text-xs text-muted-foreground">{t("inviteModal.modeTempPasswordHint")}</span>
                </span>
              </label>

              {isTempPassword && (
                <div className="field">
                  <Label htmlFor="invite-name">{t("inviteModal.nameLabel")}</Label>
                  <Input
                    id="invite-name"
                    placeholder={t("inviteModal.namePlaceholder")}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    minLength={2}
                    maxLength={100}
                    autoComplete="off"
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label>{t("inviteModal.rolesLabel")}</Label>
                <p className="text-xs text-muted-foreground">{t("inviteModal.rolesDescription")}</p>
                <FormMultiSelect
                  placeholder={t("inviteModal.rolesPlaceholder")}
                  options={roleOptions}
                  value={companyRoles}
                  onChange={(val) => { setCompanyRoles(val as CompanyRole[]); setJobAccess([]); }}
                  maxSelections={5}
                />
              </div>

              <CompanyFunctionChecklist roles={companyRoles} overrides={overrides} onChange={setOverrides} />

              {showJobAccessForRoles(companyRoles) && (
                <div className="space-y-2">
                  <Label>{t("jobAccessModal.assignedJobs")}</Label>
                  <p className="text-xs text-muted-foreground">{t("inviteModal.jobAccessDescription")}</p>
                  <FormMultiSelect
                    placeholder={t("jobAccessModal.allJobsPlaceholder")}
                    options={jobOptions}
                    value={jobAccess}
                    onChange={setJobAccess}
                    maxSelections={50}
                    searchable
                  />
                </div>
              )}

              {error && (
                <div role="alert" className="text-sm text-status-rejected bg-status-rejected-bg border border-status-rejected/20 px-3 py-2 rounded-md">
                  {error}
                </div>
              )}

              <DialogFooter className="gap-2 pt-1">
                <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} className="flex-1 sm:flex-none">
                  {t("cancel")}
                </Button>
                <Button type="submit" disabled={saving} className="flex-1 sm:flex-none">
                  {saving ? (
                    <span className="flex items-center gap-2">
                      <span className="h-3.5 w-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                      {isTempPassword ? t("inviteModal.creating") : t("sending")}
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      {isTempPassword ? <UserPlus className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
                      {isTempPassword ? t("inviteModal.createAccount") : t("sendInvite")}
                    </span>
                  )}
                </Button>
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

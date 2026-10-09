"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Eye, EyeOff, RefreshCw } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { generateClientPassword } from "@/lib/security/clientPassword";

interface PasswordInputProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  placeholder?: string;
  autoComplete?: string;
  className?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
}

export function PasswordInput({
  id,
  value,
  onChange,
  required,
  placeholder,
  autoComplete = "new-password",
  className,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
}: PasswordInputProps) {
  const tc = useTranslations("common");
  const [revealed, setRevealed] = useState(false);

  const generate = () => {
    onChange(generateClientPassword());
    setRevealed(true);
  };

  return (
    <div className="relative">
      <Input
        id={id}
        type={revealed ? "text" : "password"}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className={cn("pe-20", className)}
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid}
      />
      <div className="absolute inset-y-0 end-1 flex items-center gap-0.5">
        <button
          type="button"
          onClick={generate}
          className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label={tc("generatePassword")}
          title={tc("generatePassword")}
        >
          <RefreshCw className="size-4" />
        </button>
        <button
          type="button"
          onClick={() => setRevealed((current) => !current)}
          className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label={revealed ? tc("hidePassword") : tc("showPassword")}
          aria-pressed={revealed}
        >
          {revealed ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
    </div>
  );
}

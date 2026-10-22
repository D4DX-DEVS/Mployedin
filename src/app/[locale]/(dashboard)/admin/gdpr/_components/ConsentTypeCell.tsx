"use client";

import { PolicyVersionText } from "./PolicyVersionText";

interface ConsentTypeCellProps {
  /** The consent type in words. */
  label: string;
  policyVersion?: string | null;
}

/**
 * The "Consent Type" cell of Other consents: the type and the version it was
 * given against. (Choice references belong to cookie choices, which are the
 * other view; no row here carries one.)
 */
export function ConsentTypeCell({ label, policyVersion }: ConsentTypeCellProps) {
  return (
    <>
      <p>{label}</p>
      {policyVersion ? (
        <p className="text-xs text-muted-foreground">
          <PolicyVersionText value={policyVersion} />
        </p>
      ) : null}
    </>
  );
}

"use client";

import { useState, type ImgHTMLAttributes, type ReactNode } from "react";

import { toPublicImageSrc } from "@/lib/images/externalAvatar";

interface PublicImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> {
  /** The URL as stored (CMS or user data). It is never handed to the browser unchecked. */
  src: string | null | undefined;
  /** Shown when the URL is not one a public page may load, or fails to load. */
  fallback?: ReactNode;
}

/**
 * The one way a public page draws an image whose address came from the CMS or a
 * user. A browser that loads a third-party image tells that host the visitor's IP
 * address and browser details before any cookie choice, so the address goes
 * through toPublicImageSrc first: our own storage loads, Google and LinkedIn
 * photos load through our proxy, anything else renders the fallback and makes no
 * request at all.
 */
export function PublicImage({ src, fallback = null, alt = "", onError, ...rest }: PublicImageProps) {
  const [failedSrc, setFailedSrc] = useState<string | undefined>();
  const resolved = toPublicImageSrc(src);
  if (!resolved || failedSrc === resolved) return <>{fallback}</>;
  return (
    <img
      {...rest}
      src={resolved}
      alt={alt}
      onError={(event) => {
        setFailedSrc(resolved);
        onError?.(event);
      }}
    />
  );
}

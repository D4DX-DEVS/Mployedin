"use client";

/**
 * CheckoutReturnHandler
 *
 * Mounted on the pages a payment provider returns to (employer / job-seeker
 * subscription, employer invoices). When the URL carries
 *   ?checkout=success&…  (Stripe adds session_id, Razorpay adds razorpay_*)
 *   ?checkout=cancelled
 * it asks GET /api/payments/confirm for the authoritative status (which also
 * records the payment if the webhook hasn't arrived yet), shows the outcome as
 * a toast, refreshes data, and strips the query so a reload doesn't repeat it.
 */

import { Suspense, useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

const PROVIDER_PARAMS = [
  "checkout",
  "provider",
  "invoice",
  "session_id",
  "razorpay_payment_id",
  "razorpay_payment_link_id",
  "razorpay_payment_link_reference_id",
  "razorpay_payment_link_status",
  "razorpay_signature",
];

interface Props {
  /** Called after a confirmed / pending outcome so the page can refetch. */
  onSettled?: () => void;
}

function Handler({ onSettled }: Props) {
  const t = useTranslations("paymentReturn");
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const handled = useRef(false);

  useEffect(() => {
    const checkout = searchParams.get("checkout");
    if (!checkout || handled.current) return;
    handled.current = true;

    const clearQuery = () => {
      const next = new URLSearchParams(searchParams.toString());
      for (const key of PROVIDER_PARAMS) next.delete(key);
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    };

    const refresh = () => {
      void queryClient.invalidateQueries();
      onSettled?.();
    };

    if (checkout === "cancelled") {
      toast.info(t("cancelledTitle"), { description: t("cancelledBody") });
      clearQuery();
      return;
    }
    if (checkout !== "success") {
      clearQuery();
      return;
    }

    const confirmParams = new URLSearchParams();
    for (const key of PROVIDER_PARAMS.slice(3)) {
      const v = searchParams.get(key);
      if (v) confirmParams.set(key, v);
    }

    const loadingId = toast.loading(t("confirming"));
    (async () => {
      try {
        const res = await fetch(`/api/payments/confirm?${confirmParams.toString()}`);
        const data = await res.json().catch(() => ({}));
        toast.dismiss(loadingId);
        if (!res.ok) {
          toast.error(t("confirmFailedTitle"), { description: t("confirmFailedBody") });
          return;
        }
        if (data.status === "paid" && data.applied === false) {
          toast.warning(t("paidNeedsReviewTitle"), { description: t("paidNeedsReviewBody") });
        } else if (data.status === "paid") {
          toast.success(t("paidTitle"), {
            description: data.invoiceStatus === "partially_paid" ? t("partialBody") : t("paidBody"),
          });
        } else if (data.status === "pending") {
          toast.info(t("pendingTitle"), { description: t("pendingBody") });
        } else if (data.status === "failed") {
          toast.error(t("failedTitle"), { description: t("failedBody") });
        } else {
          toast.info(t("cancelledTitle"), { description: t("cancelledBody") });
        }
        refresh();
      } catch {
        toast.dismiss(loadingId);
        toast.error(t("confirmFailedTitle"), { description: t("confirmFailedBody") });
      } finally {
        clearQuery();
      }
    })();
  }, [searchParams, router, pathname, queryClient, onSettled, t]);

  return null;
}

export function CheckoutReturnHandler(props: Props) {
  // useSearchParams needs a Suspense boundary outside dynamic rendering.
  return (
    <Suspense fallback={null}>
      <Handler {...props} />
    </Suspense>
  );
}

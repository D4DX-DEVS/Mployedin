import Image from "next/image";
import Link from "next/link";
import { ThemeToggle } from "@/components/shared/ThemeToggle";

export default async function AuthLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="flex flex-1 bg-[radial-gradient(circle_at_top_left,hsl(var(--primary)/0.08),transparent_34%),radial-gradient(circle_at_bottom_right,hsl(var(--accent)/0.08),transparent_28%)]">
        <div className="relative hidden w-0 flex-1 overflow-hidden border-r border-border/50 bg-[linear-gradient(160deg,hsl(var(--background)),hsl(var(--muted)/0.95))] lg:block">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,hsl(var(--border)/0.24)_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border)/0.24)_1px,transparent_1px)] bg-[size:76px_76px] opacity-35" />
          <div className="absolute left-[-12%] top-[-12%] h-[360px] w-[360px] rounded-full bg-brand-blue/15 blur-[110px]" />
          <div className="absolute bottom-[-18%] right-[-10%] h-[420px] w-[420px] rounded-full bg-brand-cyan/15 blur-[130px]" />

          <div className="relative z-10 flex h-full flex-col justify-between p-8 xl:p-12">
            <div className="flex items-center gap-4">
              <Link
                href={`/${locale}`}
                className="inline-flex items-center transition-transform hover:-translate-y-0.5"
              >
                <Image src="/mployedin-logo.png" alt="Mployedin" width={240} height={160} className="h-80 w-auto object-contain" priority />
              </Link>
            </div>

            <div className="max-w-xl space-y-4">
              <h1 className="text-4xl font-semibold leading-[1.02] tracking-[-0.04em] text-foreground xl:text-6xl">
                Elevate your hiring pipeline with a sharper command center.
              </h1>
              <p className="text-base leading-7 text-muted-foreground xl:text-lg">
                Move from sourcing to shortlist with a calmer workspace designed for modern recruitment teams, international hiring, and faster decision cycles.
              </p>
            </div>

            <div className="text-sm text-muted-foreground/70">
              © {new Date().getFullYear()} MPLOYEDIN. All rights reserved.
            </div>
          </div>
        </div>

        <div className="flex flex-1 flex-col bg-background/92 px-4 py-6 sm:px-6 sm:py-8 lg:w-[560px] lg:flex-none xl:w-[620px]">
          <div className="flex justify-end">
            <div className="rounded-full border border-border/70 bg-background/80 p-1 shadow-sm backdrop-blur">
              <ThemeToggle />
            </div>
          </div>

          <div className="mx-auto flex w-full max-w-md flex-1 items-center">
            <div className="w-full rounded-[32px] border border-border/60 bg-background/86 p-6 shadow-[0_30px_80px_-42px_rgba(15,23,42,0.35)] dark:shadow-[0_30px_80px_-42px_rgba(0,0,0,0.55)] backdrop-blur md:p-8">
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

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
      <div className="flex flex-1 bg-background">
        {/* Left pane - Image/Brand */}
        <div className="relative hidden w-0 flex-1 overflow-hidden border-r border-border/40 bg-muted/30 lg:block">
          {/* Minimalist abstract shapes */}
          <div className="absolute right-0 top-0 h-[300px] w-[300px] translate-x-1/3 -translate-y-1/2 rounded-full bg-brand-blue/10 blur-[100px] sm:h-[500px] sm:w-[500px]" />
          <div className="absolute bottom-0 left-0 h-[350px] w-[350px] -translate-x-1/3 translate-y-1/3 rounded-full bg-brand-cyan/10 blur-[120px] sm:h-[600px] sm:w-[600px]" />

          <div className="absolute inset-0 z-10 flex flex-col justify-between p-6 sm:p-8 md:p-12">
            <div className="inline-flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
                <span className="text-xl font-bold">M</span>
              </div>
              <span className="text-2xl font-bold tracking-tight text-foreground">mployedin</span>
            </div>

            <div className="max-w-lg space-y-6">
              <h1 className="text-2xl font-semibold leading-[1.1] tracking-tight text-foreground sm:text-3xl md:text-4xl lg:text-5xl">
                Elevate your hiring pipeline.
              </h1>
              <p className="text-lg font-light leading-relaxed text-muted-foreground">
                Streamline your workflow, discover top international candidates, and make data-driven decisions with unparalleled ease.
              </p>
            </div>

            <div className="text-sm font-medium text-muted-foreground/60">
              © {new Date().getFullYear()} mployedin. All rights reserved.
            </div>
          </div>
        </div>

        {/* Right pane - Form */}
        <div className="flex flex-1 flex-col justify-center bg-background px-4 py-12 sm:px-6 lg:w-[520px] lg:flex-none xl:w-[600px]">
          <div className="mx-auto w-full max-w-sm lg:max-w-md">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

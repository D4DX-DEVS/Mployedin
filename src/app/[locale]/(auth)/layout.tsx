export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-background">
      {/* Left pane - Image/Brand */}
      <div className="relative hidden w-0 flex-1 lg:block bg-muted/30 overflow-hidden border-r border-border/40">
        {/* Minimalist abstract shapes */}
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-brand-blue/10 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/3" />
        <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-brand-cyan/10 rounded-full blur-[120px] translate-y-1/3 -translate-x-1/3" />

        <div className="absolute inset-0 flex flex-col justify-between p-12 z-10">
          <div className="inline-flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shadow-sm">
              <span className="font-bold text-xl">M</span>
            </div>
            <span className="text-2xl font-bold tracking-tight text-foreground">mployedin</span>
          </div>

          <div className="max-w-lg space-y-6">
            <h1 className="text-4xl lg:text-5xl font-semibold tracking-tight text-foreground leading-[1.1]">
              Elevate your hiring pipeline.
            </h1>
            <p className="text-lg text-muted-foreground leading-relaxed font-light">
              Streamline your workflow, discover top international candidates, and make data-driven decisions with unparalleled ease.
            </p>
          </div>
          
          <div className="text-sm font-medium text-muted-foreground/60">
            © {new Date().getFullYear()} mployedin. All rights reserved.
          </div>
        </div>
      </div>

      {/* Right pane - Form */}
      <div className="flex flex-1 flex-col justify-center px-4 py-12 sm:px-6 lg:flex-none lg:w-[520px] xl:w-[600px] bg-background">
        <div className="mx-auto w-full max-w-sm lg:max-w-md">
          {children}
        </div>
      </div>
    </div>
  );
}

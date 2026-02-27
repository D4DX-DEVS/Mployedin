export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-background">
      {/* Left pane - Image/Brand */}
      <div className="relative hidden w-0 flex-1 lg:block bg-brand-blue-dark overflow-hidden">
        {/* Abstract shapes / gradient background */}
        <div className="absolute inset-0 bg-brand-gradient opacity-90" />
        <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-brand-cyan/20 blur-3xl opacity-50" />
        <div className="absolute top-1/2 right-0 w-80 h-80 rounded-full bg-primary/30 blur-3xl opacity-50 translate-x-1/2 -translate-y-1/2" />

        <div className="absolute inset-0 flex items-center justify-center p-12 text-white z-10 transition-all">
          <div className="max-w-lg space-y-6">
            <div className="inline-flex items-center gap-3 mb-8">
              <div className="w-12 h-12 rounded-xl bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/20 shadow-lg">
                <span className="text-white font-bold text-2xl">M</span>
              </div>
              <span className="text-3xl font-bold tracking-tight">mployedin</span>
            </div>
            <h1 className="text-4xl font-bold leading-tight">
              The AI-Powered Platform for Global Talent
            </h1>
            <p className="text-lg text-white/80 leading-relaxed font-light">
              Streamline your hiring process, discover top international candidates, and make data-driven decisions with unparalleled ease.
            </p>
          </div>
        </div>
      </div>

      {/* Right pane - Form */}
      <div className="flex flex-1 flex-col justify-center px-4 py-12 sm:px-6 lg:flex-none lg:w-[480px] xl:w-[560px] bg-background">
        <div className="mx-auto w-full max-w-sm lg:max-w-md">
          {children}
        </div>
      </div>
    </div>
  );
}

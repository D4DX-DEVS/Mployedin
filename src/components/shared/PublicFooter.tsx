import Link from "next/link";

interface PublicFooterProps {
  locale: string;
}

export default function PublicFooter({ locale }: PublicFooterProps) {
  const isAr = locale === "ar";
  const year = new Date().getFullYear();

  const linkSections = [
    {
      title: isAr ? "الشركة" : "Company",
      links: [
        { href: `/${locale}`, label: isAr ? "الرئيسية" : "Home" },
        { href: `/${locale}/blog`, label: isAr ? "المدونة" : "Blog" },
        { href: `/${locale}/contact`, label: isAr ? "اتصل بنا" : "Contact Us" },
      ],
    },
    {
      title: isAr ? "الموارد" : "Resources",
      links: [
        { href: `/${locale}/faq`, label: isAr ? "الأسئلة الشائعة" : "FAQ" },
        { href: `/${locale}/privacy`, label: isAr ? "سياسة الخصوصية" : "Privacy Policy" },
        { href: `/${locale}/cookies`, label: isAr ? "سياسة الكوكيز" : "Cookie Policy" },
      ],
    },
    {
      title: isAr ? "للباحثين عن عمل" : "For Job Seekers",
      links: [
        { href: `/${locale}/register`, label: isAr ? "سجل الآن" : "Register" },
        { href: `/${locale}/login`, label: isAr ? "تسجيل الدخول" : "Login" },
      ],
    },
  ];

  return (
    <footer className="border-t bg-muted/30">
      <div className="container mx-auto px-4 py-12">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-sm">
                M
              </div>
              <span className="text-lg font-bold">MPLOYEDIN</span>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {isAr
                ? "منصة التوظيف المدعومة بالذكاء الاصطناعي لمنطقة الخليج"
                : "AI-Powered International Recruitment Platform for the Gulf region"}
            </p>
          </div>

          {/* Link Sections */}
          {linkSections.map((section) => (
            <div key={section.title}>
              <h3 className="font-semibold text-sm mb-3">{section.title}</h3>
              <ul className="space-y-2">
                {section.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-10 border-t pt-6 text-center text-sm text-muted-foreground">
          &copy; {year} MPLOYEDIN. {isAr ? "جميع الحقوق محفوظة." : "All rights reserved."}
        </div>
      </div>
    </footer>
  );
}

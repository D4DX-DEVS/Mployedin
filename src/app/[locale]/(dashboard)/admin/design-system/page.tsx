import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export default function DesignSystemPage() {
  return (
    <div className="space-y-10 max-w-4xl">
      <PageHeader
        title="Design System"
        description="MPLOYEDIN component library and design tokens showcase"
      />

      {/* Colors */}
      <section className="card-base p-6 space-y-4">
        <h2 className="text-lg font-semibold">Brand Colors</h2>
        <div className="flex flex-wrap gap-3">
          {[
            { name: "Brand Blue", cls: "bg-brand-blue" },
            { name: "Brand Blue Dark", cls: "bg-brand-blue-dark" },
            { name: "Brand Cyan", cls: "bg-brand-cyan" },
            { name: "Primary", cls: "bg-primary" },
            { name: "Muted", cls: "bg-muted" },
            { name: "Destructive", cls: "bg-destructive" },
          ].map((c) => (
            <div key={c.name} className="flex flex-col items-center gap-2">
              <div className={`w-16 h-16 rounded-xl ${c.cls} shadow-sm`} />
              <span className="text-xs text-muted-foreground text-center">{c.name}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Typography */}
      <section className="card-base p-6 space-y-3">
        <h2 className="text-lg font-semibold">Typography</h2>
        <Separator />
        <p className="text-4xl font-bold">Heading 1</p>
        <p className="text-3xl font-bold">Heading 2</p>
        <p className="text-2xl font-semibold">Heading 3</p>
        <p className="text-xl font-semibold">Heading 4</p>
        <p className="text-base">Body text — Regular paragraph content goes here.</p>
        <p className="text-sm text-muted-foreground">Small / muted text</p>
        <p className="text-xs text-muted-foreground">Extra small caption text</p>
      </section>

      {/* Buttons */}
      <section className="card-base p-6 space-y-4">
        <h2 className="text-lg font-semibold">Buttons</h2>
        <div className="flex flex-wrap gap-3 items-center">
          <Button>Default</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destructive</Button>
          <Button disabled>Disabled</Button>
          <Button size="sm">Small</Button>
          <Button size="lg">Large</Button>
          <Button className="bg-brand-blue hover:bg-brand-blue-dark">Brand Blue</Button>
        </div>
      </section>

      {/* Status Badges */}
      <section className="card-base p-6 space-y-4">
        <h2 className="text-lg font-semibold">Status Badges</h2>
        <div className="flex flex-wrap gap-3">
          {["applied", "shortlisted", "interview_scheduled", "selected", "rejected",
            "draft", "pending_approval", "active", "closed",
            "new", "converted", "lost", "basic", "company", "premium"].map((s) => (
            <StatusBadge key={s} status={s} />
          ))}
        </div>
      </section>

      {/* Badges */}
      <section className="card-base p-6 space-y-4">
        <h2 className="text-lg font-semibold">Badges</h2>
        <div className="flex flex-wrap gap-3">
          <Badge>Default</Badge>
          <Badge variant="secondary">Secondary</Badge>
          <Badge variant="outline">Outline</Badge>
          <Badge variant="destructive">Destructive</Badge>
        </div>
      </section>

      {/* Forms */}
      <section className="card-base p-6 space-y-4">
        <h2 className="text-lg font-semibold">Form Elements</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Email</Label>
            <Input type="email" placeholder="you@example.com" />
          </div>
          <div className="space-y-2">
            <Label>Search</Label>
            <Input placeholder="Search..." />
          </div>
        </div>
      </section>

      {/* Progress */}
      <section className="card-base p-6 space-y-4">
        <h2 className="text-lg font-semibold">Progress</h2>
        <div className="space-y-3">
          {[0, 25, 50, 75, 100].map((v) => (
            <div key={v} className="flex items-center gap-3">
              <span className="text-xs w-8 text-muted-foreground">{v}%</span>
              <Progress value={v} className="flex-1 h-2" />
            </div>
          ))}
        </div>
      </section>

      {/* Tabs */}
      <section className="card-base p-6 space-y-4">
        <h2 className="text-lg font-semibold">Tabs</h2>
        <Tabs defaultValue="tab1">
          <TabsList>
            <TabsTrigger value="tab1">Overview</TabsTrigger>
            <TabsTrigger value="tab2">Details</TabsTrigger>
            <TabsTrigger value="tab3">Settings</TabsTrigger>
          </TabsList>
          <TabsContent value="tab1" className="pt-4 text-sm text-muted-foreground">
            Overview content here.
          </TabsContent>
          <TabsContent value="tab2" className="pt-4 text-sm text-muted-foreground">
            Details content here.
          </TabsContent>
          <TabsContent value="tab3" className="pt-4 text-sm text-muted-foreground">
            Settings content here.
          </TabsContent>
        </Tabs>
      </section>

      {/* Avatars */}
      <section className="card-base p-6 space-y-4">
        <h2 className="text-lg font-semibold">Avatars</h2>
        <div className="flex gap-3 items-end">
          {["SM", "MD", "LG"].map((size, i) => (
            <Avatar key={size} className={i === 0 ? "h-8 w-8" : i === 1 ? "h-10 w-10" : "h-14 w-14"}>
              <AvatarFallback className="bg-brand-blue text-white font-semibold" style={{ fontSize: i === 2 ? "1.25rem" : undefined }}>
                M
              </AvatarFallback>
            </Avatar>
          ))}
        </div>
      </section>

      {/* Sidebar preview */}
      <section className="card-base p-6 space-y-4">
        <h2 className="text-lg font-semibold">Sidebar Preview</h2>
        <div className="h-48 w-64 rounded-xl overflow-hidden border border-border">
          <div className="sidebar sidebar-expanded h-full">
            <div className="px-4 py-3 border-b border-white/10">
              <span className="text-white font-bold">mployedin</span>
            </div>
            <nav className="p-2 space-y-1">
              {["Dashboard", "Jobs", "Applications"].map((item, i) => (
                <a
                  key={item}
                  href="#"
                  className={`sidebar-item ${i === 0 ? "sidebar-item-active" : ""}`}
                >
                  <span className="sidebar-icon h-4 w-4 bg-white/30 rounded" />
                  <span className="sidebar-label">{item}</span>
                </a>
              ))}
            </nav>
          </div>
        </div>
      </section>
    </div>
  );
}

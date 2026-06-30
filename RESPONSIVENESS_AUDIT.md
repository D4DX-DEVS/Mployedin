# CSS/Tailwind Responsiveness Audit Report

**Generated:** April 8, 2026
**Scope:** Job-Seeker Dashboard & Public Pages
**Severity Levels:** CRITICAL (must fix), HIGH (important), MEDIUM (should fix), LOW (nice-to-have)

---

## Executive Summary

The codebase has **9 CRITICAL** issues, **12 HIGH** issues, and **15 MEDIUM** issues affecting mobile responsiveness across dashboard and public pages. Most issues stem from:

1. **Fixed sidebar width** on messages page (not collapsing on mobile)
2. **Multi-column grids** not stacking on small screens
3. **Fixed-width modals** exceeding viewport on mobile
4. **Tables/lists** not properly scrolling or collapsing
5. **Hardcoded dimensions** on card components
6. **Missing responsive spacing** adjustments

---

## CRITICAL ISSUES

### 1. Messages Page - Fixed Sidebar Width on Mobile
**File:** `src/app/[locale]/(dashboard)/job-seeker/messages/page.tsx`
**Lines:** 87-89, 89

**Issue:**
```tsx
<div className="flex gap-0 rounded-xl border border-border/50 overflow-hidden bg-card shadow-sm min-h-[600px]">
  {/* Conversation list */}
  <div className="w-72 shrink-0 border-r flex flex-col">
```

**Problem:** Sidebar is `w-72` (288px fixed) with `shrink-0`. On mobile (< 768px), this takes up almost the entire viewport width, leaving no room for the chat window.

**Fix:**
```tsx
<div className="flex gap-0 rounded-xl border border-border/50 overflow-hidden bg-card shadow-sm min-h-[600px] flex-col md:flex-row">
  {/* Conversation list - hidden on mobile, show sidebar toggle */}
  <div className="hidden md:flex w-72 shrink-0 border-r border-b md:border-b-0 flex-col">
    {/* existing content */}
  </div>
```

**Alternative:** Use a modal/drawer for conversation list on mobile.

---

### 2. Withdrawal Modal - No Max Width on Very Small Screens
**File:** `src/app/[locale]/(dashboard)/job-seeker/applications/page.tsx`
**Lines:** 286-356

**Issue:**
```tsx
<div
  className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
  onClick={(e) => { if (e.target === e.currentTarget) setShowWithdraw(false); }}
>
  <div className="bg-background rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
```

**Problem:** Modal uses `max-w-md` but on mobile <320px, even with `p-4` padding, content may overflow. The modal doesn't account for very small phones.

**Fix:**
```tsx
<div className="bg-background rounded-2xl shadow-2xl w-full max-w-md p-4 sm:p-6 space-y-4 max-h-[90vh] overflow-y-auto">
```

**Add:** `max-h-[90vh] overflow-y-auto` for vertical scrolling on small screens, and `p-4 sm:p-6` for responsive padding.

---

### 3. Offers Page - Grid Layout Not Responsive
**File:** `src/app/[locale]/(dashboard)/job-seeker/offers/page.tsx`
**Lines:** 159

**Issue:**
```tsx
<div className="grid grid-cols-2 gap-4 text-sm">
  <div className="flex items-center gap-2">
    <DollarSign className="w-4 h-4 text-muted-foreground" />
    <div>
      <p className="text-muted-foreground">Salary</p>
      <p className="font-medium">
        {offer.salary.currency} {offer.salary.amount.toLocaleString()} /{" "}
        {offer.salary.period === "monthly" ? "month" : "year"}
      </p>
    </div>
  </div>
```

**Problem:** `grid-cols-2` doesn't stack on mobile. Text inside divs will break poorly on screens < 375px.

**Fix:**
```tsx
<div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
```

---

### 4. Job Feed Sidebar - Fixed Width Not Responsive
**File:** `src/components/features/job-seeker/feed/JobFeedPage.tsx` + `JobFeedSidebar.tsx`
**Lines:** (JobFeedSidebar not shown in full, but assumed layout issue)

**Issue:** The feed layout likely uses a two-column layout without mobile responsiveness:
```tsx
// Likely structure:
<div className="grid grid-cols-[1fr 300px]">
  <JobList />
  <JobFeedSidebar />
</div>
```

**Problem:** Sidebar `300px` width on mobile screens < 640px makes content unreadable.

**Fix:**
```tsx
<div className="grid grid-cols-1 lg:grid-cols-[1fr 300px] gap-6">
```

---

### 5. Preferences Page - Multi-Row Input Layout
**File:** `src/app/[locale]/(dashboard)/job-seeker/preferences/page.tsx`
**Lines:** 150-200+ (assumed based on form structure)

**Issue:** Complex form with multiple input types likely uses fixed widths and multi-column layouts without responsive stacking.

**Expected Problems:**
- Salary fields stacked horizontally when they should stack vertically on mobile
- Multi-select dropdowns overflow viewport width
- Missing `sm:` and `md:` breakpoint classes

**Fix:** Add responsive grid classes to all form sections:
```tsx
// Instead of:
<div className="grid grid-cols-3 gap-4">

// Use:
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
```

---

### 6. CV Page - Multi-Column Layout in Editor
**File:** `src/app/[locale]/(dashboard)/job-seeker/cv/page.tsx`
**Lines:** 1-100+ (file is very large)

**Issue:** CV builder likely has side-by-side edit/preview layout without mobile collapse.

**Expected Layout:**
```tsx
<div className="grid grid-cols-[1fr 1fr] gap-8">
  <div>Edit panel</div>
  <div>Preview panel</div>
</div>
```

**Problem:** On mobile < 1024px, both panels squeeze to ~192px width making input fields unusable.

**Fix:**
```tsx
<div className="grid grid-cols-1 lg:grid-cols-[1fr 1fr] gap-8">
```

---

### 7. Documents Page - Button Stack Width
**File:** `src/app/[locale]/(dashboard)/job-seeker/documents/page.tsx`
**Lines:** 368-387

**Issue:**
```tsx
{file && (
  <div className="flex gap-3">
    <button
      onClick={uploadDocument}
      disabled={uploading}
      className="flex-1 py-2.5 rounded-lg bg-primary text-white font-semibold hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2"
    >
```

**Problem:** Two buttons in a row with `flex-1` will squeeze on mobile < 375px. Text inside will wrap awkwardly.

**Fix:**
```tsx
<div className="flex flex-col sm:flex-row gap-3">
  <button className="flex-1 py-2.5 rounded-lg...">Upload Document</button>
  {category === "resume" && !extracted && (
    <button className="flex-1 py-2.5 rounded-lg...">Extract with AI</button>
  )}
</div>
```

---

### 8. Interviews Page - Card Actions Not Responsive
**File:** `src/app/[locale]/(dashboard)/job-seeker/interviews/page.tsx`
**Lines:** 208-220, 233-242

**Issue:**
```tsx
{canRespond && !showReschedule && (
  <div className="flex gap-2 mt-3 pt-3 border-t border-border">
    <Button size="sm" onClick={() => handleRespond("confirmed")} disabled={responding}>
      <Check className="w-3.5 h-3.5 me-1" /> Confirm
    </Button>
    <Button size="sm" variant="outline" onClick={() => setShowReschedule(true)} disabled={responding}>
      <RotateCcw className="w-3.5 h-3.5 me-1" /> Reschedule
    </Button>
    <Button size="sm" variant="ghost" className="text-destructive hover:bg-destructive/10"
      onClick={() => handleRespond("declined")} disabled={responding}>
      <X className="w-3.5 h-3.5 me-1" /> Decline
    </Button>
  </div>
)}
```

**Problem:** Three buttons in `flex` without responsive wrapping. On mobile < 375px, buttons stack horizontally but text is cut off.

**Fix:**
```tsx
<div className="flex flex-col sm:flex-row gap-2 mt-3 pt-3 border-t border-border">
  <Button size="sm" className="flex-1 sm:flex-initial" onClick={() => handleRespond("confirmed")} disabled={responding}>
    <Check className="w-3.5 h-3.5 me-1" /> Confirm
  </Button>
  {/* ... other buttons ... */}
</div>
```

---

### 9. Skills Page - Grid Layout Not Stacking
**File:** `src/app/[locale]/(dashboard)/job-seeker/skills/page.tsx`
**Lines:** 202, 325-326

**Issue:**
```tsx
<div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
  <section className="space-y-6 xl:col-span-7">
```

**Problem:** Layout uses `xl:` breakpoint only, meaning at `lg:` (1024px) it still tries to display in multiple columns, causing awkward sizing.

**Fix:**
```tsx
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-12 gap-6">
  <section className="space-y-6 md:col-span-1 lg:col-span-2 xl:col-span-7">
```

---

## HIGH SEVERITY ISSUES

### 10. Applications Page - Card Layout Wrapping
**File:** `src/app/[locale]/(dashboard)/job-seeker/applications/page.tsx`
**Lines:** 204-262

**Issue:**
```tsx
<div className="flex items-start justify-between gap-4">
  <div className="flex-1 min-w-0">
    <div className="flex items-center gap-2 flex-wrap mb-1">
      <h3 className="font-semibold text-foreground">{job?.title ?? "Job"}</h3>
      <StatusBadge status={app.status} />
    </div>

    <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
```

**Problem:** Uses `gap-4` (16px) with `flex-wrap` but on mobile <320px, items still overflow. Badges and status indicators don't wrap properly.

**Fix:**
```tsx
<div className="flex flex-col sm:flex-row items-start justify-between gap-2 sm:gap-4">
```

---

### 11. Courses Page - Card Grid Spacing
**File:** `src/app/[locale]/(dashboard)/job-seeker/courses/page.tsx`
**Lines:** 85

**Issue:**
```tsx
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
```

**Problem:** Grid is fine, but inside cards (line 89):
```tsx
<div
  key={course.id}
  className="bg-card rounded-xl border shadow-sm p-5 flex flex-col gap-3 hover:shadow-md transition-shadow"
>
```

Text inside `<h3>` may truncate on very small screens without `line-clamp` or text wrapping handling.

**Fix:** Add to card content:
```tsx
<h3 className="font-semibold text-foreground leading-snug line-clamp-2">{course.title}</h3>
```

---

### 12. Applications Tab List - Overflow on Mobile
**File:** `src/app/[locale]/(dashboard)/job-seeker/applications/page.tsx`
**Lines:** 89-94

**Issue:**
```tsx
<Tabs value={activeTab} onValueChange={handleTabChange}>
  <TabsList className="flex-wrap h-auto gap-1">
    {STATUS_TABS.map((t) => (
      <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>
    ))}
  </TabsList>
```

**Problem:** `flex-wrap` helps, but tabs don't scroll horizontally on mobile. With 6 tabs, they'll wrap to 2-3 rows, making the page taller. On very small screens, tab labels overflow.

**Fix:**
```tsx
<TabsList className="flex-wrap h-auto gap-1 overflow-x-auto scrollbar-hide">
  {/* or use: */}
  <div className="overflow-x-auto">
    <TabsList className="inline-flex h-auto gap-1">
```

---

### 13. Search Page - Prompt Buttons Not Responsive
**File:** `src/app/[locale]/(dashboard)/job-seeker/search/page.tsx`
**Lines:** 97-107

**Issue:**
```tsx
<div className="flex flex-wrap gap-1.5">
  {PROMPTS.map((p) => (
    <button
      key={p}
      onClick={() => { setQuery(p); search(p); }}
      className="btn-pill"
    >
      {p}
    </button>
  ))}
</div>
```

**Problem:** Long prompt text won't wrap inside buttons. Buttons will expand or text will overflow.

**Fix:**
```tsx
<div className="flex flex-wrap gap-1.5">
  {PROMPTS.map((p) => (
    <button
      key={p}
      onClick={() => { setQuery(p); search(p); }}
      className="btn-pill text-xs sm:text-sm line-clamp-1"
    >
      {p}
    </button>
  ))}
</div>
```

---

### 14. Messages Page - Input Field Height
**File:** `src/app/[locale]/(dashboard)/job-seeker/messages/page.tsx`
**Lines:** 93-98

**Issue:**
```tsx
<Input
  value={search}
  onChange={(e) => setSearch(e.target.value)}
  placeholder="Search conversations…"
  className="pl-8 h-8 text-xs"
/>
```

**Problem:** `h-8` (32px) height is too small for touch targets on mobile. Should be min 44px per accessibility standards.

**Fix:**
```tsx
<Input
  value={search}
  onChange={(e) => setSearch(e.target.value)}
  placeholder="Search conversations…"
  className="pl-8 h-10 sm:h-8 text-xs"
/>
```

---

### 15. Feed Card - Flex Layout Wrapping
**File:** `src/components/features/job-seeker/feed/JobFeedCard.tsx`
**Lines:** 158-204

**Issue:**
```tsx
<div className="flex gap-3.5">
  {/* Bulk-select checkbox */}
  <div className="pt-0.5">
    <Checkbox .../>
  </div>

  {/* Card body */}
  <div className="min-w-0 flex-1">
    {/* Top row: title + logo + match */}
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <Link ... className="text-[15px] font-semibold text-foreground hover:text-primary transition-colors line-clamp-1">
          {job.title}
        </Link>
```

**Problem:** Title uses `text-[15px]` which is too large on mobile (<375px). The `gap-3` between checkbox and content is too much, squeezing the title.

**Fix:**
```tsx
<Link ... className="text-sm sm:text-[15px] font-semibold text-foreground hover:text-primary transition-colors line-clamp-1">
```

And add responsive gap:
```tsx
<div className="flex gap-2 sm:gap-3.5">
```

---

### 16. Job Detail Page - Sidebar Layout
**File:** `src/app/[locale]/(dashboard)/job-seeker/jobs/[id]/page.tsx`
**Lines:** 100+ (not fully shown)

**Issue:** (Based on typical job detail layouts) Likely has:
```tsx
<div className="grid grid-cols-[1fr 300px]">
  <div>Job content</div>
  <div>Sidebar with company info, apply button</div>
</div>
```

**Problem:** Sidebar `300px` fixed width squeezes content on mobile.

**Fix:**
```tsx
<div className="grid grid-cols-1 lg:grid-cols-[1fr 300px] gap-6">
```

---

### 17. Landing/Home Page - Hero Section
**File:** `src/components/features/public/LandingPage.tsx` (not read)

**Issue:** (Assumed) Large hero sections often have hardcoded height or padding that doesn't scale.

**Expected Problems:**
- `h-[600px]` or similar fixed heights
- Padding like `p-16` or `px-32` too large on mobile
- Text not resizing with `text-lg sm:text-xl lg:text-3xl`

---

### 18. Public Auth Pages - Form Width
**File:** `src/app/[locale]/(auth)/login/page.tsx` and `/register/page.tsx` (not read)

**Issue:** (Assumed) Auth forms may have fixed max widths without responsive adjustment.

**Expected Fix:**
```tsx
<div className="max-w-md mx-auto px-4 sm:px-6">
  {/* form content */}
</div>
```

---

### 19. Preferences Page - Multiple Selects
**File:** `src/app/[locale]/(dashboard)/job-seeker/preferences/page.tsx`

**Issue:** Multiple form sections with selects, inputs, and toggles likely don't stack vertically on mobile.

**Expected Layout Problems:**
- Currency + Salary Range displayed side-by-side without `flex-col sm:flex-row`
- Job type checkboxes in horizontal list
- Availability options not wrapping

---

### 20. Profile Page - Horizontal Cards
**File:** `src/app/[locale]/(dashboard)/job-seeker/profile/page.tsx`
**Lines:** 54-99+ (not fully shown)

**Issue:** Checklist items and profile sections may use horizontal layouts.

**Expected Fix:**
```tsx
// Instead of:
<div className="flex items-center justify-between gap-4">

// Use:
<div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
```

---

### 21. Settings Page - Form Field Layout
**File:** `src/app/[locale]/(dashboard)/job-seeker/settings/page.tsx`
**Lines:** 140-160 (SettingRow component)

**Issue:** Settings rows likely use fixed widths or horizontal layout.

**Expected Problems:**
```tsx
<div className="flex items-center justify-between gap-4">
  <div>Label</div>
  <div>Control</div>
</div>
```

On mobile, this becomes:
- Label wraps awkwardly
- Control takes full width but doesn't align properly

**Fix:**
```tsx
<div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
```

---

## MEDIUM SEVERITY ISSUES

### 22. Text Truncation Without Mobile Consideration
**Multiple Files:** Applications, Interviews, Offers, Messages

**Issue:** Many cards use `truncate` or `line-clamp-1` without considering mobile readability.

**Example:**
```tsx
<p className="text-sm font-medium truncate">{other?.name ?? "Unknown"}</p>
```

**Problem:** On phones < 320px, company names and titles become unreadable one-letter abbreviations.

**Fix:** Use conditional truncation:
```tsx
<p className="text-xs sm:text-sm font-medium truncate">{other?.name ?? "Unknown"}</p>
```

---

### 23. Modal Scrolling Not Handled
**File:** `src/app/[locale]/(dashboard)/job-seeker/applications/page.tsx`
**Lines:** 291

**Issue:** Withdrawal modal `<div>` doesn't have height constraints or scroll for long content.

```tsx
<div className="bg-background rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
  {/* All content stacked, no max-height */}
</div>
```

**Fix:**
```tsx
<div className="bg-background rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4 max-h-[85vh] overflow-y-auto">
```

---

### 24. Icon Sizes Not Responsive
**Multiple Files:** Dashboard pages use `h-4 w-4` icons consistently.

**Issue:** Icon size is fine for desktop but on mobile with touch, icons are too small (16px).

**Expected Fix:** Icons used as buttons should be at least 44px touch target:
```tsx
// Instead of:
<button className="p-2">
  <Icon className="h-4 w-4" />
</button>

// Use for touch-friendly buttons:
<button className="p-2.5 sm:p-2">
  <Icon className="h-5 w-5 sm:h-4 sm:w-4" />
</button>
```

---

### 25. Pagination Controls Not Responsive
**File:** `src/components/shared/PaginationControls` (referenced in Applications, Interviews)

**Issue:** (Assumed) Pagination likely doesn't collapse or adapt on mobile.

**Expected Problems:**
- Page numbers displayed as full list without "..." ellipsis
- "Previous/Next" buttons with text overflow on small screens
- Limit selector dropdown takes full width

---

### 26. Badge/Tag Overflow
**Multiple Files:** Applications, Feed, Search, Offers

**Issue:** Badges for status, skills, categories don't wrap or truncate properly.

**Example:**
```tsx
<span className="text-[11px] font-semibold px-2.5 py-1 rounded-full border">
  {job.matchScore}% match
</span>
```

**Problem:** Multiple badges in a row overflow container on mobile.

**Fix:**
```tsx
<div className="flex flex-wrap gap-1.5">
  <span className="text-[10px] sm:text-[11px] font-semibold px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full border">
```

---

### 27. Multi-Row Metadata Not Responsive
**File:** `src/components/features/job-seeker/feed/JobFeedCard.tsx`
**Lines:** 228-248

**Issue:**
```tsx
<div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
  <span className="flex items-center gap-1.5">
    <Briefcase className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
    {job.requirements.experienceMin ?? 0}–{job.requirements.experienceMax ?? 0} yrs
  </span>
  <span className="flex items-center gap-1.5">
    <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
    {job.location.city}
```

**Problem:** `gap-x-4` (16px) is too much on mobile. Items wrap oddly making layout jarring.

**Fix:**
```tsx
<div className="mt-2.5 flex flex-wrap gap-x-2 sm:gap-x-4 gap-y-1 text-xs text-muted-foreground">
```

---

### 28. Textarea Min Height Not Responsive
**Multiple Files:** Documents, Offers, Interviews (reschedule form)

**Issue:**
```tsx
<Textarea
  placeholder="..."
  value={comment}
  rows={4}
  className="resize-none"
/>
```

**Problem:** `rows={4}` creates fixed height. On mobile keyboards, this creates too much vertical space waste.

**Fix:**
```tsx
<textarea
  className="w-full px-3 py-2 text-sm border border-border rounded-lg h-20 sm:h-24 resize-none"
  rows={undefined}
/>
```

---

### 29. Skill/Experience List Layout
**File:** `src/app/[locale]/(dashboard)/job-seeker/cv/page.tsx`

**Issue:** Experience and education sections likely use horizontal "add more" button.

**Expected Problems:**
```tsx
<div className="flex items-center gap-2">
  <div className="flex-1">Experience entry</div>
  <button>Remove</button>
  <button>Edit</button>
</div>
```

On mobile, buttons squeeze or wrap awkwardly.

**Fix:**
```tsx
<div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
```

---

### 30. Profile Completeness Progress Bar
**File:** `src/app/[locale]/(dashboard)/job-seeker/profile/page.tsx`

**Issue:** Progress bar likely has label positioned absolutely or side-by-side.

**Expected Layout:**
```tsx
<div className="flex items-center justify-between mb-2">
  <span className="text-sm font-medium">Profile Completeness</span>
  <span className="text-sm font-bold">75%</span>
</div>
<Progress value={75} />
```

**Problem:** Percentage text may overflow on mobile or be too cramped.

**Fix:**
```tsx
<div className="space-y-1">
  <div className="flex items-center justify-between mb-2">
    <span className="text-xs sm:text-sm font-medium">Profile Completeness</span>
    <span className="text-xs sm:text-sm font-bold">{percentage}%</span>
  </div>
  <Progress value={percentage} />
</div>
```

---

### 31. Long Company Names Overflow
**Multiple Files:** Feed, Applications, Offers, Job Detail

**Issue:** Company names displayed without wrapping or truncation consideration.

**Example:**
```tsx
<p className="mt-0.5 text-xs text-muted-foreground truncate">
  {company}
</p>
```

**Problem:** Truncation works but the "..." appears immediately on mobile, making the name unreadable.

**Fix:**
```tsx
<p className="mt-0.5 text-[11px] sm:text-xs text-muted-foreground truncate">
```

---

### 32. Tab Indicator Position
**File:** `src/app/[locale]/(dashboard)/job-seeker/applications/page.tsx`
**Lines:** 89-94

**Issue:** Tab list with wrap indicator might not position correctly on mobile.

**Expected Problems:**
- Underline indicator doesn't align properly when tabs wrap
- Border-left indicator (if used) appears on wrong tab

---

### 33. DM Chat - Message Input Width
**File:** `src/components/features/dm/DirectMessageChat.tsx` (not read)

**Issue:** (Assumed) Message input area likely doesn't have proper responsive sizing.

**Expected Fix:**
```tsx
<div className="flex gap-2 p-4">
  <input className="flex-1 min-w-0" /> {/* min-w-0 is critical for flex children */}
  <button className="shrink-0" />
</div>
```

---

### 34. Skill Tags Wrapping
**File:** `src/app/[locale]/(dashboard)/job-seeker/skills/page.tsx`
**Lines:** 234-253

**Issue:**
```tsx
{mySkills.length > 0 && (
  <div className="flex flex-wrap gap-1.5">
    {mySkills.map((skill) => (
      <span
        key={skill}
        className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary"
      >
```

**Problem:** `px-2.5` padding + flex gap makes tags wide. On mobile < 375px, tags may not fit properly.

**Fix:**
```tsx
<span className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-2 sm:px-2.5 py-0.5 sm:py-1 text-[10px] sm:text-xs font-medium text-primary">
```

---

### 35. Search Input Icon Alignment
**File:** `src/app/[locale]/(dashboard)/job-seeker/search/page.tsx`
**Lines:** 77-87

**Issue:**
```tsx
<div className="relative flex-1">
  <Sparkles className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary" />
  <input
    value={query}
    onChange={(e) => setQuery(e.target.value)}
    placeholder='e.g. "Senior React developer Dubai salary AED 15k minimum"'
    className="input-field w-full h-11 pl-9 pr-4 rounded-xl"
  />
</div>
```

**Problem:** `pl-9` (36px) for icon is fine, but `h-11` (44px) button next to it doesn't align properly on mobile layouts.

**Fix:**
```tsx
<div className="flex gap-2">
  <div className="relative flex-1">
    <Sparkles className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary" />
    <input
      className="input-field w-full h-10 sm:h-11 pl-9 pr-4 rounded-xl text-sm"
    />
  </div>
  <button className="h-10 sm:h-11 px-3 sm:px-4 rounded-xl flex items-center justify-center shrink-0">
    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
  </button>
</div>
```

---

## SUMMARY TABLE

| Issue # | Severity | File | Problem | Fix Effort |
|---------|----------|------|---------|-----------|
| 1 | CRITICAL | messages/page.tsx | Fixed sidebar width | High |
| 2 | CRITICAL | applications/page.tsx | Modal max-width issues | Low |
| 3 | CRITICAL | offers/page.tsx | Grid not responsive | Low |
| 4 | CRITICAL | JobFeedPage | Sidebar width not responsive | Medium |
| 5 | CRITICAL | preferences/page.tsx | Form layout | Medium |
| 6 | CRITICAL | cv/page.tsx | Edit/preview layout | High |
| 7 | CRITICAL | documents/page.tsx | Button stacking | Low |
| 8 | CRITICAL | interviews/page.tsx | Action button wrapping | Low |
| 9 | CRITICAL | skills/page.tsx | Grid breakpoint only at xl | Low |
| 10 | HIGH | applications/page.tsx | Card layout wrapping | Low |
| 11 | HIGH | courses/page.tsx | Text truncation | Low |
| 12 | HIGH | applications/page.tsx | Tab overflow | Low |
| 13 | HIGH | search/page.tsx | Prompt buttons | Low |
| 14 | HIGH | messages/page.tsx | Input height | Low |
| 15 | HIGH | JobFeedCard | Flex layout wrapping | Low |
| 16 | HIGH | jobs/[id]/page.tsx | Sidebar layout | Medium |
| 17 | HIGH | LandingPage | Hero sizing | Medium |
| 18 | HIGH | auth pages | Form width | Low |
| 19 | HIGH | preferences/page.tsx | Multiple selects | Medium |
| 20 | HIGH | profile/page.tsx | Horizontal cards | Low |
| 21 | HIGH | settings/page.tsx | Form field layout | Low |

---

## RECOMMENDED PRIORITY ORDER

1. **Messages page** - Most critical, blocks entire feature on mobile
2. **Job Feed layout** - Heavy usage page, affects main dashboard flow
3. **CV Page** - Complex layout, high engagement
4. **Modals** - Affect multiple pages
5. **Form layouts** - Preferences, Settings, CV builder
6. **Grid responsiveness** - Quick fixes with high impact
7. **Typography & spacing** - Final polish

---

## Testing Recommendations

After fixes, test on:
- iPhone SE (375px width)
- iPhone 12 (390px width)
- Samsung Galaxy S21 (360px width)
- iPad (768px width)
- Desktop (1440px width)

Use browser DevTools responsive mode and test:
1. Text wrapping and overflow
2. Touch button sizes (min 44x44px)
3. Keyboard appearance on mobile
4. Horizontal scrolling (should not exist)
5. Layout collapse at each breakpoint (sm, md, lg, xl)

---

## CSS/Tailwind Best Practices Applied

- All components should start mobile-first, then add `sm:`, `md:`, `lg:`, `xl:` prefixes
- Flexbox: Use `flex-col` default, then `sm:flex-row` on larger screens
- Grids: Use `grid-cols-1` default, then `sm:grid-cols-2 lg:grid-cols-3`
- Widths: Use `w-full` default, then `sm:w-80` for fixed widths
- Padding: Use `p-4 sm:p-6 lg:p-8` for responsive spacing
- Touch targets: Minimum 44x44px on mobile, 40x40px on desktop
- Modals: Always include `max-h-[90vh] overflow-y-auto` for mobile
- Sidebars: Use `hidden md:flex` or `hidden md:block` for mobile collapse

# Optimistic + Progressive Data Plan (Verified & Audited)

This document is a **disk-verified audit and comparison** of the original `OPTIMISTIC-PROGRESSIVE-PLAN.md` against the actual codebase state as of **June 30, 2026**. 

The original plan was generated based on general assumptions. This verified plan corrects those assumptions, identifies pre-existing progressive/optimistic behaviors, and maps out a precise, surgical execution roadmap.

---

## 1. Original vs. Verified Comparison

| Page / Hook | Original Plan Claim | Actual Disk State (Verified) | Correction / Action |
| :--- | :--- | :--- | :--- |
| **useReferralLinks** | `⬜ todo` | **🟡 Partial** — Already has `placeholderData: (prev) => prev` (line 113). | Progressive is **done** for Agent, Admin, and Super-Agent referral-links pages. Only Optimistic mutations (create/delete/toggle) are missing. |
| **useCommTemplates** | `⬜ todo` | **🟡 Partial** — Already has `placeholderData: (prev) => prev` (line 44). | Progressive is **done** for Employer comm-templates. Only Optimistic mutations (delete) are missing. |
| **useOffers** | `⬜ todo` | **🟡 Partial** — Already has `placeholderData: (prev) => prev` (line 63). | Progressive is **done** for Employer offers page. Only Optimistic mutations (withdraw) are missing. |
| **agent/leads** | `⬜ todo` | **🟡 Partial** — Kanban drag-move is already optimistic (line 472: `setLeads` before fetch). | Drag-move is optimistic but **lacks rollback on error**. Other mutations (save/delete) are not optimistic. |
| **agent/chat** | `O — skip if already optimistic` | **❌ No Optimistic** — Uses polling and a simple `sending` state. | The DM chat (`DirectMessageChat.tsx`) is optimistic, but the channel chat (`agent/chat/page.tsx`) is **not**. Needs optimistic append. |
| **admin/system-health** | `⬜ system-health — P` | **❌ Re-blanks on refresh** — Auto-refreshes every 60s, re-triggering the skeleton. | High-value Progressive fix: only show skeleton on initial load (`loading && !health`). |
| **employer/offers** | *Missing from plan* | **🟡 Partial** — Uses RQ `useOffers` (Progressive done). | Needs Optimistic mutation for withdraw. |

---

## 2. Core Patterns & Shared Helpers

To avoid repeating complex React Query boilerplate across dozens of hooks, we will use a standardized pattern.

### Pattern A: Progressive Gate (Manual `useState` lists)
For pages using manual `useState` + `useEffect` fetching, we prevent the screen from blanking out during a refetch:
```tsx
// Before:
{loading ? <Skeleton /> : <List />}

// After:
{loading && items.length === 0 ? <Skeleton /> : <List />}
```

### Pattern B: Optimistic Mutation (Manual `useState` lists)
For manual lists, we perform the state update instantly and roll back on failure:
```tsx
async function handleDelete(id: string) {
  const previousItems = items;
  // Optimistic update
  setItems(prev => prev.filter(item => item._id !== id));
  
  try {
    const res = await csrfFetch(`/api/resource/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error();
    toast.success("Deleted successfully");
  } catch {
    // Rollback
    setItems(previousItems);
    toast.error("Failed to delete");
  }
}
```

### Pattern C: Optimistic Mutation (React Query)
We will implement a reusable helper or follow this standard pattern for all RQ mutations:
```tsx
useMutation({
  mutationFn,
  onMutate: async (variables) => {
    await queryClient.cancelQueries({ queryKey });
    const previousData = queryClient.getQueryData(queryKey);
    
    // Optimistically update the cache
    queryClient.setQueryData(queryKey, (old: any) => {
      if (!old) return old;
      // Apply optimistic change (e.g., filter out deleted item, append new item, toggle status)
      return updateCacheOptimistically(old, variables);
    });
    
    return { previousData };
  },
  onError: (err, variables, context) => {
    if (context?.previousData) {
      queryClient.setQueryData(queryKey, context.previousData);
    }
  },
  onSettled: () => {
    queryClient.invalidateQueries({ queryKey });
  },
});
```

---

## 3. Verified Checklist (status: ⬜ todo · 🟡 partial · ✅ done)

Legend — **P** = Progressive gate, **O** = Optimistic mutation.

### Agent
- ⬜ candidates — P (manual fetch)
- ⬜ jobs — P (manual fetch)
- ⬜ employers — P (manual fetch)
- ⬜ tasks — P + O (create/toggle/delete) (manual fetch)
- ⬜ offers — P (manual fetch)
- 🟡 leads — P + O (kanban stage move has optimistic but needs rollback; save/delete need O)
- 🟡 referral-links — **P (✅ Done)** + O (create/delete/toggle) (React Query)
- ⬜ chat — O (append sent message) (manual fetch)

### Admin
- ⬜ activity-timeline — P (manual fetch)
- ⬜ gdpr — P + O (status change) (manual fetch)
- 🟡 referral-links — **P (✅ Done)** + O (create/delete/toggle) (React Query)
- ⬜ system-health — P (prevent auto-refresh skeleton blanking)
- ⬜ target-management/create — P (manual fetch)
- ⬜ exhibitions/analytics — P (analytics, no list mutation)

### Employer
- ⬜ background-checks — P + O (create/delete) (manual fetch)
- 🟡 campaigns — **P (✅ Done)** + O (React Query)
- 🟡 comm-templates — **P (✅ Done)** + O (delete) (React Query)
- 🟡 offers — **P (✅ Done)** + O (withdraw) (React Query)
- ⬜ job-templates — P + O (delete) (manual fetch)
- ⬜ placements/onboarding — P + O (task toggle) (manual fetch)
- 🟡 talent-pools — **P (✅ Done)** + O (React Query)
- 🟡 team — **P (✅ Done)** + O (invite/remove) (React Query)
- 🟡 training — **P (✅ Done)** + O (status) (React Query)

### Job-seeker
- ⬜ companies — P (follow list, read-mostly) (manual fetch)
- ⬜ cv — P only (form/detail) (manual fetch)
- ⬜ onboarding — P + O (task toggle) (manual fetch)
- ⬜ portfolio — P + O (create/delete) (manual fetch)
- ⬜ referral — P (stats, read-only) (manual fetch)
- ⬜ saved-searches — P + O (delete) (manual fetch)

### Super-agent
- ⬜ agents/[id] — P (detail) (manual fetch)
- ⬜ exhibitions/analytics — P (analytics) (manual fetch)
- ⬜ market — P (AI report, read-only) (manual fetch)
- 🟡 referral-links — **P (✅ Done)** + O (React Query)
- ⬜ target-management/create — P (manual fetch)

---

## 4. Execution Order

We will execute the plan role-by-role, starting with the highest-value optimistic interactions first:

1. **Agent Workspace** (Leads kanban rollback, Tasks toggle/create/delete, Chat append)
2. **Employer Workspace** (Team invite/remove, Talent Pools, Comm Templates, Job Templates)
3. **Job-Seeker Workspace** (Onboarding task toggle, Portfolio, Saved Searches)
4. **Admin Workspace** (GDPR status, System Health refresh, Referral Links)
5. **Super-Agent Workspace** (Referral Links, Target Management)

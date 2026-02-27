"use client";

import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { CrudModal, CrudField } from "@/components/shared/CrudModal";
import { usePagination } from "@/hooks/usePagination";
import { usePermissions } from "@/hooks/usePermissions";
import { Building2, Briefcase, Search, Loader2, Plus, Edit2, Trash2 } from "lucide-react";

interface Employer {
  _id: string;
  name: string;
  email: string;
  companyName?: string;
  industry?: string;
  location?: string;
  isActive: boolean;
}

const EMPLOYER_FIELDS: CrudField[] = [
  { name: "companyName", label: "Company Name", type: "text", required: true },
  { name: "industry", label: "Industry", type: "text" },
  { name: "location", label: "Location", type: "text" },
];

export default function AgentEmployersPage() {
  const { can } = usePermissions();
  const pagination = usePagination();
  const [employers, setEmployers] = useState<Employer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editEmployer, setEditEmployer] = useState<Employer | null>(null);

  const loadEmployers = useCallback(async () => {
    setLoading(true);
    try {
      const params = pagination.paginationParams();
      if (search) params.set("search", search);
      const res = await fetch(`/api/employers?${params}`);
      if (res.ok) {
        const data = await res.json();
        setEmployers(data.employers ?? []);
        pagination.updateTotal(data.total ?? data.employers?.length ?? 0);
      }
    } finally {
      setLoading(false);
    }
  }, [search, pagination.page, pagination.limit]);

  useEffect(() => {
    const t = setTimeout(loadEmployers, 300);
    return () => clearTimeout(t);
  }, [loadEmployers]);

  useEffect(() => { pagination.resetPage(); }, [search]);

  const handleSave = async (values: Record<string, string>) => {
    if (editEmployer) {
      const res = await fetch(`/api/employers/${editEmployer._id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values),
      });
      if (!res.ok) throw new Error("Failed to update employer");
    }
    setEditEmployer(null);
    loadEmployers();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this employer?")) return;
    await fetch(`/api/employers/${id}`, { method: "DELETE" });
    loadEmployers();
  };

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader
          title="My Employers"
          description="Manage employer accounts and post jobs on their behalf"
        />
        <a href="./jobs/new"
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90">
          <Plus className="h-4 w-4" /> Post Job
        </a>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search employers…"
          className="w-full sm:w-72 h-10 pl-9 pr-4 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : employers.length === 0 ? (
        <div className="card-base text-center py-16">
          <Building2 className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">No employer accounts yet</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {employers.map((em) => (
            <div key={em._id} className="card-base hover:shadow-md transition-all space-y-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Building2 className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">{em.companyName ?? em.name}</p>
                    <p className="text-xs text-muted-foreground">{em.email}</p>
                  </div>
                </div>
                <StatusBadge status={em.isActive ? "active" : "inactive"} />
              </div>

              <div className="text-xs text-muted-foreground space-y-1">
                {em.industry && <p>Industry: {em.industry}</p>}
                {em.location && <p>Location: {em.location}</p>}
              </div>

              <div className="flex gap-2 pt-1">
                <a
                  href={`./jobs/new?employer=${em._id}`}
                  className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-all"
                >
                  <Briefcase className="h-3.5 w-3.5" /> Post Job
                </a>
                {can("employers", "update") && (
                  <button onClick={() => { setEditEmployer(em); setModalOpen(true); }}
                    className="p-1.5 rounded-lg hover:bg-muted transition-all" title="Edit">
                    <Edit2 className="h-3.5 w-3.5 text-blue-600" />
                  </button>
                )}
                {can("employers", "delete") && (
                  <button onClick={() => handleDelete(em._id)}
                    className="p-1.5 rounded-lg hover:bg-muted transition-all" title="Delete">
                    <Trash2 className="h-3.5 w-3.5 text-red-600" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <PaginationControls
        page={pagination.page}
        totalPages={pagination.totalPages}
        total={pagination.total}
        limit={pagination.limit}
        onPageChange={pagination.setPage}
        onLimitChange={pagination.setLimit}
      />

      <CrudModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditEmployer(null); }}
        title="Edit Employer"
        fields={EMPLOYER_FIELDS}
        initialValues={editEmployer ? {
          companyName: editEmployer.companyName ?? "",
          industry: editEmployer.industry ?? "",
          location: editEmployer.location ?? "",
        } : undefined}
        onSubmit={handleSave}
      />
    </div>
  );
}

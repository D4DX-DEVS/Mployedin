import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface CompanyData {
  _id: string;
  companyName: string;
  companyEmail: string;
  phone: string;
  designation?: string;
  registrationNo?: string;
  taxId?: string;
  address?: string;
  country?: string;
  website?: string;
  industry?: string;
  companySize?: string;
  logo?: string;
  coverImage?: string;
  description?: string;
  foundedYear?: number;
  socialLinks?: { linkedin?: string; twitter?: string; facebook?: string; instagram?: string };
  hiringPreferences?: { defaultVisibility?: string; preferredLocations?: string[]; workType?: string };
  notificationPrefs?: { emailNewApplicant?: boolean; emailInterviewScheduled?: boolean; emailOfferResponse?: boolean; emailWeeklyDigest?: boolean; inAppAll?: boolean };
  verificationLevel: string;
  verificationDocs: string[];
  paymentStatus: string;
  subscriptionType?: string;
  createdAt: string;
}

export const employerProfileKeys = {
  all: ["employer-profile"] as const,
  detail: () => [...employerProfileKeys.all, "detail"] as const,
};

async function fetchEmployerProfile(): Promise<CompanyData> {
  const response = await fetch("/api/employers/me", {
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Failed to fetch employer profile");
  }

  const data = await response.json();
  return data.employer;
}

async function updateEmployerProfile(updates: Partial<CompanyData>): Promise<CompanyData> {
  const response = await fetch("/api/employers/me", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify(updates),
  });

  if (!response.ok) {
    throw new Error("Failed to update employer profile");
  }

  const data = await response.json();
  return data.employer;
}

async function uploadDocument(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("document", file);

  const response = await fetch("/api/employers/documents", {
    method: "POST",
    credentials: "include",
    body: formData,
  });

  if (!response.ok) {
    throw new Error("Failed to upload document");
  }

  const data = await response.json();
  return data.url;
}

async function deleteDocument(url: string): Promise<void> {
  const response = await fetch("/api/employers/documents", {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify({ url }),
  });

  if (!response.ok) {
    throw new Error("Failed to delete document");
  }
}

export function useEmployerProfile() {
  return useQuery({
    queryKey: employerProfileKeys.detail(),
    queryFn: fetchEmployerProfile,
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpdateEmployerProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateEmployerProfile,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: employerProfileKeys.all });
    },
  });
}

export function useUploadDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: uploadDocument,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: employerProfileKeys.all });
    },
  });
}

export function useDeleteDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteDocument,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: employerProfileKeys.all });
    },
  });
}

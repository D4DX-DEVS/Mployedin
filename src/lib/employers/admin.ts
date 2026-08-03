import crypto from "crypto";

export interface EmployerAdminCreateInput {
  name: string;
  email: string;
  password?: string;
  companyName?: string;
  industry?: string;
  location?: string;
  phone?: string;
}

export interface EmployerAdminUpdateInput {
  name?: string;
  email?: string;
  companyName?: string;
  industry?: string;
  location?: string;
  phone?: string;
}

function generateStrongPassword() {
  const randomBytes = crypto.randomBytes(20).toString("hex");
  return `Adm-${randomBytes}A!`;
}

export function buildEmployerAdminCreatePayload(input: EmployerAdminCreateInput) {
  const password = input.password && input.password.trim().length > 0
    ? input.password
    : generateStrongPassword();

  return {
    password,
    userUpdate: {
      name: input.name,
      email: input.email,
    },
    employerUpdate: {
      companyName: input.companyName || input.name,
      companyEmail: input.email,
      industry: input.industry ?? "",
      address: input.location ?? "",
      phone: input.phone ?? "",
    },
  };
}

export function buildEmployerAdminUpdatePayload(input: EmployerAdminUpdateInput) {
  return {
    userUpdate: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.email !== undefined ? { email: input.email } : {}),
    },
    employerUpdate: {
      ...(input.companyName !== undefined ? { companyName: input.companyName } : {}),
      ...(input.email !== undefined ? { companyEmail: input.email } : {}),
      ...(input.industry !== undefined ? { industry: input.industry } : {}),
      ...(input.location !== undefined ? { address: input.location } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
    },
  };
}

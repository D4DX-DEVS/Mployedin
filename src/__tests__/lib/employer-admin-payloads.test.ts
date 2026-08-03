import { buildEmployerAdminCreatePayload, buildEmployerAdminUpdatePayload } from "@/lib/employers/admin";

describe("employer admin payload helpers", () => {
  it("generates a secure password when the admin leaves the password blank", () => {
    const payload = buildEmployerAdminCreatePayload({
      name: "Test Contact",
      email: "emp@example.com",
      password: "",
      companyName: "Acme",
      industry: "",
      location: "",
      phone: "",
    });

    expect(payload.password).toMatch(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12,}$/);
    expect(payload.userUpdate).toMatchObject({
      name: "Test Contact",
      email: "emp@example.com",
    });
    expect(payload.employerUpdate).toMatchObject({
      companyName: "Acme",
      companyEmail: "emp@example.com",
      address: "",
      phone: "",
    });
  });

  it("maps admin edit form fields to both the user and employer records", () => {
    const payload = buildEmployerAdminUpdatePayload({
      name: "Updated Contact",
      email: "updated@example.com",
      companyName: "Updated Co",
      industry: "IT",
      location: "Dubai",
      phone: "971500000000",
    });

    expect(payload.userUpdate).toEqual({
      name: "Updated Contact",
      email: "updated@example.com",
    });
    expect(payload.employerUpdate).toEqual({
      companyName: "Updated Co",
      companyEmail: "updated@example.com",
      industry: "IT",
      address: "Dubai",
      phone: "971500000000",
    });
  });
});

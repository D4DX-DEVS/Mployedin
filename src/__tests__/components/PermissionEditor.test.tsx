/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PermissionEditor } from "@/components/shared/PermissionEditor";
import type { CustomPermissions } from "@/types/user";

/* Resolves against the real en.json so a renamed or deleted key fails here
   rather than shipping a raw key into the dialog. */
jest.mock("next-intl", () => {
  const messages = jest.requireActual("../../../messages/en.json") as Record<string, Record<string, string>>;
  return {
    useTranslations: (namespace: string) => (key: string, values?: Record<string, unknown>) => {
      const raw = messages[namespace]?.[key];
      if (raw === undefined) throw new Error(`Missing message: ${namespace}.${key}`);
      return raw.replace(/\{(\w+)\}/g, (_m, name: string) => String(values?.[name] ?? ""));
    },
  };
});

function renderEditor(overrides: Partial<React.ComponentProps<typeof PermissionEditor>> = {}) {
  const onChange = jest.fn();
  render(
    <PermissionEditor
      baseRole="employer"
      permissionMode="role_default"
      customPermissions={{}}
      onChange={onChange}
      {...overrides}
    />,
  );
  return { onChange };
}

describe("PermissionEditor", () => {
  it("says which role it is following while custom permissions are off", () => {
    renderEditor();
    expect(screen.getByText("Using default employer permissions")).toBeInTheDocument();
    expect(screen.getByLabelText("Use custom permissions")).not.toBeChecked();
  });

  /* The switch used to describe itself with a count of granted actions, which
     said nothing about what turning it on does to the account. */
  it("names the consequence once custom permissions are on", () => {
    renderEditor({ permissionMode: "custom", customPermissions: { jobs: ["read"] } as CustomPermissions });
    expect(
      screen.getByText("Overrides the default employer permissions for this user"),
    ).toBeInTheDocument();
  });

  it("locks the access levels while the user follows the role", () => {
    renderEditor();
    const levels = screen.getAllByRole("radio", { name: "Full", hidden: true });
    expect(levels.length).toBeGreaterThan(0);
    for (const level of levels) expect(level).toBeDisabled();
  });

  it("filters the list as you type and says how many rows survived", async () => {
    renderEditor();
    expect(screen.queryByText(/matching$/)).not.toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Search resources"), "interview");

    expect(screen.getByText("1 matching")).toBeInTheDocument();
    expect(screen.getByText("Interviews")).toBeInTheDocument();
    expect(screen.queryByText("Placements")).not.toBeInTheDocument();
  });

  it("clears the search from the field itself", async () => {
    renderEditor();
    const field = screen.getByLabelText("Search resources");
    await userEvent.type(field, "interview");

    await userEvent.click(screen.getByRole("button", { name: "Clear search" }));

    expect(field).toHaveValue("");
    expect(screen.getByText("Placements")).toBeInTheDocument();
    expect(screen.queryByText(/matching$/)).not.toBeInTheDocument();
  });

  it("reports a narrowed level as a custom permission map", async () => {
    const { onChange } = renderEditor({
      permissionMode: "custom",
      customPermissions: { interviews: ["create", "read", "update", "delete"] } as CustomPermissions,
    });

    await userEvent.type(screen.getByLabelText("Search resources"), "interview");
    await userEvent.click(screen.getByRole("radio", { name: "View", hidden: true }));

    expect(onChange).toHaveBeenCalledWith("custom", expect.objectContaining({ interviews: ["read"] }));
  });
});

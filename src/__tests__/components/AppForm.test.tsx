/**
 * @jest-environment jsdom
 */
import React, { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  FormFileDrop,
  FormInput,
  FormMultiSelect,
  FormPhone,
  FormSwitch,
} from "@/components/shared/AppForm";

describe("AppForm accessibility", () => {
  it("associates native fields with their labels and announced errors", () => {
    render(
      <FormInput
        label="Email address"
        required
        hint="Use your work email"
        error="Enter a valid email address"
      />
    );

    const input = screen.getByRole("textbox", { name: "Email address" });
    const alert = screen.getByRole("alert");

    expect(input).toBeRequired();
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute("aria-describedby", alert.id);
    expect(alert).toHaveTextContent("Enter a valid email address");
    expect(screen.queryByText("Use your work email")).not.toBeInTheDocument();
  });

  it("supports keyboard navigation, selection, removal, and focus restoration in the multi-select", async () => {
    const user = userEvent.setup();

    function Harness() {
      const [value, setValue] = useState<string[]>([]);
      return (
        <FormMultiSelect
          label="Locations"
          options={[
            { value: "dubai", label: "Dubai" },
            { value: "manama", label: "Manama" },
          ]}
          value={value}
          onChange={setValue}
          required
        />
      );
    }

    render(<Harness />);
    const trigger = screen.getByRole("combobox", { name: "Locations" });

    trigger.focus();
    await user.keyboard("[ArrowDown]");
    const dubai = await screen.findByRole("option", { name: "Dubai" });
    const manama = screen.getByRole("option", { name: "Manama" });
    await waitFor(() => expect(dubai).toHaveFocus());

    await user.keyboard("[ArrowDown]");
    expect(manama).toHaveFocus();
    await user.keyboard("[Enter]");
    expect(manama).toHaveAttribute("aria-selected", "true");

    await user.keyboard("[Escape]");
    expect(trigger).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Remove Manama" }));

    await user.click(trigger);
    expect(screen.getByRole("option", { name: "Manama" })).toHaveAttribute("aria-selected", "false");
  });

  it("keeps rejected file feedback inline and exposes a named remove action", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    const { rerender } = render(
      <FormFileDrop
        label="Upload CV"
        accept=".pdf"
        maxSizeMB={1}
        onChange={onChange}
      />
    );

    const input = screen.getByLabelText("Upload CV");
    const largeFile = new File([new Uint8Array(1024 * 1024 + 1)], "large.pdf", {
      type: "application/pdf",
    });
    await user.upload(input, largeFile);

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("File must be under 1MB");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("PDF up to 1MB")).toBeInTheDocument();

    const selectedFile = new File(["resume"], "resume.pdf", { type: "application/pdf" });
    rerender(
      <FormFileDrop
        label="Upload CV"
        accept=".pdf"
        maxSizeMB={1}
        value={selectedFile}
        onChange={onChange}
      />
    );
    await user.click(screen.getByRole("button", { name: "Remove resume.pdf" }));
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it("associates switch copy and keeps the thumb direction-aware", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    const { container } = render(
      <div dir="rtl">
        <FormSwitch
          label="Email notifications"
          description="Receive hiring updates"
          checked={false}
          onChange={onChange}
        />
      </div>
    );

    const control = screen.getByRole("switch", { name: "Email notifications" });
    expect(control).toHaveAccessibleDescription("Receive hiring updates");
    await user.click(screen.getByText("Email notifications"));
    expect(onChange).toHaveBeenCalledWith(true);
    expect(container.querySelector("[role='switch'] > span")).toHaveClass("rtl:-translate-x-1");
  });

  it("labels phone input and uses logical spacing with LTR number isolation", () => {
    const { container } = render(
      <div dir="rtl">
        <FormPhone
          label="Phone number"
          hint="Include your mobile number"
          value="+973 12345678"
          onChange={jest.fn()}
          required
        />
      </div>
    );

    const phone = screen.getByRole("textbox", { name: "Phone number" });
    expect(phone).toBeRequired();
    expect(phone).toHaveAttribute("dir", "ltr");
    expect(phone).toHaveAccessibleDescription("Include your mobile number");
    expect(phone).toHaveClass("ps-9", "pe-3");
    expect(container.querySelector(".lucide-phone")).toHaveClass("start-3");
  });
});

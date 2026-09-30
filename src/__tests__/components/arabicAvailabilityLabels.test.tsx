/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, renderHook, screen, within } from "@testing-library/react";

import { AvailabilityCalendar } from "@/components/features/job-seeker/settings/AvailabilityCalendar";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useTimezoneOptions } from "@/lib/i18n/useTimezoneOptions";

// The global next-intl mock is English. These run against the real Arabic
// catalogue, and a missing key throws as it does in the app.
jest.mock("next-intl", () => {
  const messages = jest.requireActual("../../../messages/ar.json");
  const IntlMessageFormat = jest.requireActual("intl-messageformat").default;
  const lookup = (path: string): unknown =>
    path.split(".").reduce<unknown>((node, key) => (node as Record<string, unknown> | undefined)?.[key], messages);
  const translators = new Map<string, (key: string, values?: Record<string, unknown>) => string>();
  return {
    useLocale: () => "ar",
    useTranslations: (namespace: string) => {
      if (!translators.has(namespace)) {
        translators.set(namespace, (key, values) => {
          const message = lookup(`${namespace}.${key}`);
          if (typeof message !== "string") throw new Error(`MISSING_MESSAGE: ${namespace}.${key}`);
          return String(new IntlMessageFormat(message, "ar").format(values));
        });
      }
      return translators.get(namespace);
    },
  };
});

function renderCalendar(timezone: string) {
  return render(
    <AvailabilityCalendar
      selectedDays={["Mon", "Fri"]}
      onDaysChange={jest.fn()}
      availableHours={[
        { day: "Mon", startTime: "09:00", endTime: "17:00" },
        { day: "Fri", startTime: "09:00", endTime: "13:00" },
      ]}
      onHoursChange={jest.fn()}
      timezone={timezone}
      onTimezoneChange={jest.fn()}
    />,
  );
}

describe("Availability settings on the Arabic site", () => {
  it("names the weekday buttons in Arabic and says which are on", () => {
    renderCalendar("Asia/Dubai");

    expect(screen.getByRole("button", { name: "الاثنين" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "الثلاثاء" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByText("Mon")).not.toBeInTheDocument();
  });

  it("names each hour picker after its day", () => {
    renderCalendar("Asia/Dubai");

    expect(screen.getByRole("combobox", { name: "وقت البدء يوم الاثنين" })).toHaveTextContent("09:00");
    expect(screen.getByRole("combobox", { name: "وقت الانتهاء يوم الجمعة" })).toHaveTextContent("13:00");
  });

  it("shows the saved time zone in Arabic, including India's old zone name", () => {
    // Chrome on Windows reports India as Asia/Calcutta, which matched no option,
    // so the field read an English "Select…" as if nothing were saved.
    renderCalendar("Asia/Calcutta");

    const zone = screen.getByRole("combobox", { name: "منطقتك الزمنية" });
    expect(zone).toHaveTextContent("الهند");
    expect(zone).toHaveTextContent("GMT+5:30");
    expect(zone).not.toHaveTextContent("Select");
  });

  it("still shows a saved zone that is not in the list", () => {
    const { unmount } = renderCalendar("Europe/Paris");
    expect(screen.getByRole("combobox", { name: "منطقتك الزمنية" })).toHaveTextContent("باريس");
    unmount();

    // No translation for this city: the zone's own name is better than a blank prompt.
    renderCalendar("Europe/Madrid");
    expect(screen.getByRole("combobox", { name: "منطقتك الزمنية" })).toHaveTextContent("Madrid");
  });
});

describe("Time zone pickers", () => {
  it("maps the old invalid Cairo zone the agent pickers saved onto the real one", () => {
    // "Asia/Cairo" is not an IANA zone; agent and super-agent settings offered it.
    const { result } = renderHook(() => useTimezoneOptions(["Asia/Dubai", "Africa/Cairo"], "Asia/Cairo"));

    expect(result.current.value).toBe("Africa/Cairo");
    expect(result.current.options).toHaveLength(2);
    expect(result.current.options[1].label).toMatch(/^القاهرة \(\u2066GMT\+[23]\u2069\)$/);
  });
});

describe("SearchableSelect defaults", () => {
  it("prompts in the page language when the caller sets no placeholder", () => {
    render(<SearchableSelect options={[{ value: "a", label: "أ" }]} value="" onValueChange={jest.fn()} />);

    expect(within(screen.getByRole("combobox")).getByText("اختر…")).toBeInTheDocument();
  });
});

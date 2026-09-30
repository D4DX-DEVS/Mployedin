/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen } from "@testing-library/react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

jest.mock("next-intl", () => ({
  ...jest.requireActual("next-intl"),
  useLocale: () => "ar",
}));

/**
 * Radix assumes left-to-right unless told otherwise, and this app has no
 * DirectionProvider. On the Arabic site that stamped dir="ltr" on every tab
 * set and menu: rows ran the wrong way, arrow keys moved backwards, and a
 * switch inside tabs pushed its thumb outside the track. The shared wrappers
 * now take the direction from the page language.
 */
describe("Radix direction on the Arabic site", () => {
  it("lays tabs out right-to-left", () => {
    render(
      <Tabs defaultValue="one">
        <TabsList aria-label="Sections">
          <TabsTrigger value="one">واحد</TabsTrigger>
          <TabsTrigger value="two">اثنان</TabsTrigger>
        </TabsList>
        <TabsContent value="one">محتوى</TabsContent>
      </Tabs>,
    );

    expect(screen.getByRole("tablist").closest("[dir]")).toHaveAttribute("dir", "rtl");
  });

  it("opens menus right-to-left", () => {
    render(
      <DropdownMenu open>
        <DropdownMenuTrigger>القائمة</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>تعديل</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );

    expect(screen.getByRole("menu")).toHaveAttribute("dir", "rtl");
  });

  it("still lets a caller pin a direction, e.g. for a phone number", () => {
    render(
      <Tabs defaultValue="one" dir="ltr">
        <TabsList aria-label="Sections">
          <TabsTrigger value="one">+971</TabsTrigger>
        </TabsList>
      </Tabs>,
    );

    expect(screen.getByRole("tablist").closest("[dir]")).toHaveAttribute("dir", "ltr");
  });
});

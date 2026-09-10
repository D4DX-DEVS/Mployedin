/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen } from "@testing-library/react";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

/**
 * `DialogContent` carries a default width. It used to be baked into the base
 * class string as `sm:max-w-lg`, and `cn()` is tailwind-merge, which only drops
 * a conflicting utility when the variant prefix matches — so a caller's
 * `max-w-4xl` did not displace it. Both classes shipped, the `sm:` one sits
 * inside a media query emitted further down the stylesheet, and it won on every
 * viewport at or above 40rem: 19 dialogs that asked to be wider than `lg`
 * rendered at 32rem and clipped their own content.
 *
 * The default is now applied only when the caller names no width, so these
 * tests assert on the class list rather than on computed pixels (jsdom loads no
 * stylesheet, so widths cannot be measured here — the cascade itself is covered
 * by the compiled-CSS check recorded in the fix).
 */

function classesOf(): string[] {
  return screen.getByRole("dialog").className.split(/\s+/).filter(Boolean);
}

describe("DialogContent width", () => {
  it("keeps its default width when the caller declares none", () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Untouched</DialogTitle>
        </DialogContent>
      </Dialog>
    );

    expect(classesOf()).toContain("sm:max-w-lg");
  });

  it.each(["max-w-4xl", "max-w-2xl", "max-w-md", "max-w-[52rem]"])(
    "drops the default so a declared %s survives",
    (declared) => {
      render(
        <Dialog open>
          <DialogContent className={declared}>
            <DialogTitle>Wide</DialogTitle>
          </DialogContent>
        </Dialog>
      );

      const classes = classesOf();
      expect(classes).toContain(declared);
      // The regression: this used to ship alongside the declared width and beat it.
      expect(classes).not.toContain("sm:max-w-lg");
    }
  );

  it("also honours a breakpoint-prefixed width", () => {
    render(
      <Dialog open>
        <DialogContent className="sm:max-w-3xl">
          <DialogTitle>Prefixed</DialogTitle>
        </DialogContent>
      </Dialog>
    );

    const classes = classesOf();
    expect(classes).toContain("sm:max-w-3xl");
    expect(classes).not.toContain("sm:max-w-lg");
  });

  it("leaves the phone sheet edge-to-edge even when the caller asks for a narrow width", () => {
    render(
      <Dialog open>
        <DialogContent className="max-w-md">
          <DialogTitle>Narrow</DialogTitle>
        </DialogContent>
      </Dialog>
    );

    // Below `sm` the dialog is a full-bleed bottom sheet; a caller width must
    // not shrink it into a floating card down there.
    expect(classesOf()).toContain("max-sm:max-w-none");
  });

  it("uses the centred default width when mobileSheet is off", () => {
    render(
      <Dialog open>
        <DialogContent mobileSheet={false}>
          <DialogTitle>Centred</DialogTitle>
        </DialogContent>
      </Dialog>
    );

    const classes = classesOf();
    expect(classes).toContain("max-w-lg");
    expect(classes).not.toContain("max-sm:max-w-none");
  });

  it("lets a declared width win over the centred default too", () => {
    render(
      <Dialog open>
        <DialogContent mobileSheet={false} className="max-w-5xl">
          <DialogTitle>Centred wide</DialogTitle>
        </DialogContent>
      </Dialog>
    );

    const classes = classesOf();
    expect(classes).toContain("max-w-5xl");
    expect(classes).not.toContain("max-w-lg");
  });
});

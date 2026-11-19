/**
 * @jest-environment jsdom
 */
/**
 * The viewer's explicit Download of the Original is a real download, so its
 * link carries download=1 (the CV route counts only that); the viewer's own
 * preview fetch (useOriginalCv) never does.
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import { CvSourceBar } from "@/components/shared/CvSourceBar";

const ID = "650000000000000000000330";
const APP = "650000000000000000000310";

function bar(href: string) {
  render(
    <CvSourceBar
      value="file"
      onChange={() => {}}
      builtReason={null}
      fileReason={null}
      emphasiseBuiltReason={false}
      sentWithApplication={false}
      compact={false}
      tabId={(s) => `tab-${s}`}
      panelId="panel"
      download={{ kind: "file", href, fileName: "CV" }}
    />,
  );
  return screen.getAllByRole("link")[0];
}

describe("CvSourceBar Original download", () => {
  it("flags a candidate CV address as a download", () => {
    expect(bar(`/api/employers/candidates/${ID}/cv#cv.pdf`)).toHaveAttribute("href", `/api/employers/candidates/${ID}/cv?download=1#cv.pdf`);
  });

  it("keeps the application the file belongs to", () => {
    expect(bar(`/api/employers/candidates/${ID}/cv?applicationId=${APP}#cv.pdf`)).toHaveAttribute(
      "href",
      `/api/employers/candidates/${ID}/cv?applicationId=${APP}&download=1#cv.pdf`,
    );
  });

  it("leaves another kind of address alone", () => {
    expect(bar("https://cdn/cvs/a.pdf")).toHaveAttribute("href", "https://cdn/cvs/a.pdf");
  });
});

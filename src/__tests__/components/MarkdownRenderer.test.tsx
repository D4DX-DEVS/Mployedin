/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen } from "@testing-library/react";

import { MarkdownRenderer } from "@/components/shared/MarkdownRenderer";

describe("MarkdownRenderer", () => {
  it("renders AI-style separators as horizontal rules", () => {
    const { container } = render(
      <MarkdownRenderer content={["# Analytics Report", "", "***", "", "Summary paragraph"].join("\n")} />
    );

    expect(screen.getByRole("heading", { name: /analytics report/i })).toBeInTheDocument();
    expect(container.querySelectorAll("hr")).toHaveLength(1);
    expect(screen.queryByText("***")).not.toBeInTheDocument();
  });

  it("keeps numbered sections as ordered lists", () => {
    render(
      <MarkdownRenderer
        content={[
          "1. Direct answer",
          "2. Key insights",
          "",
          "- Action one",
        ].join("\n")}
      />
    );

    const lists = screen.getAllByRole("list");

    expect(lists[0]).toHaveClass("list-decimal");
    expect(lists[1]).toHaveClass("list-disc");
    expect(screen.getByText("Direct answer")).toBeInTheDocument();
    expect(screen.getByText("Action one")).toBeInTheDocument();
  });
});
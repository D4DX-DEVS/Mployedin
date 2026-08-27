"use client";

import { Fragment } from "react";

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

/**
 * Lightweight markdown renderer that converts AI report output to formatted
 * React elements — no dangerouslySetInnerHTML, no external deps.
 */
export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let listBuffer: string[] = [];
  let listType: "ul" | "ol" | null = null;
  let key = 0;

  const flushList = () => {
    if (listBuffer.length === 0) return;
    const ListTag = listType === "ol" ? "ol" : "ul";
    elements.push(
      <ListTag
        key={key++}
        className={[
          "my-2 ml-4 space-y-0.5",
          listType === "ol" ? "list-decimal" : "list-disc",
        ].join(" ")}
      >
        {listBuffer.map((item, i) => (
          <li key={i} className="text-sm leading-relaxed text-foreground/85">
            {renderInline(item)}
          </li>
        ))}
      </ListTag>
    );
    listBuffer = [];
    listType = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Horizontal rule
    if (/^(?:---+|\*\*\*+|(?:\*\s*){3,}|___+)$/.test(line.trim())) {
      flushList();
      elements.push(<hr key={key++} className="my-3 border-border" />);
      continue;
    }

    // H1
    if (/^# /.test(line)) {
      flushList();
      elements.push(
        <h1 key={key++} className="mt-4 mb-1 text-base font-bold text-foreground">
          {renderInline(line.replace(/^# /, ""))}
        </h1>
      );
      continue;
    }

    // H2
    if (/^## /.test(line)) {
      flushList();
      elements.push(
        <h2 key={key++} className="heading-label mt-4 mb-1 font-bold text-foreground">
          {renderInline(line.replace(/^## /, ""))}
        </h2>
      );
      continue;
    }

    // H3
    if (/^### /.test(line)) {
      flushList();
      elements.push(
        <h3 key={key++} className="heading-label mt-3 mb-1 font-semibold text-foreground">
          {renderInline(line.replace(/^### /, ""))}
        </h3>
      );
      continue;
    }

    // H4
    if (/^#### /.test(line)) {
      flushList();
      elements.push(
        <h4 key={key++} className="mt-2 mb-0.5 text-sm font-semibold text-foreground/90">
          {renderInline(line.replace(/^#### /, ""))}
        </h4>
      );
      continue;
    }

    // Unordered list item (-, *, •)
    const listMatch = line.match(/^[\s]*[-*•]\s+(.+)/);
    if (listMatch) {
      if (listType === "ol") {
        flushList();
      }
      listType = "ul";
      listBuffer.push(listMatch[1]);
      continue;
    }

    // Numbered list item
    const numMatch = line.match(/^[\s]*\d+\.\s+(.+)/);
    if (numMatch) {
      if (listType === "ul") {
        flushList();
      }
      listType = "ol";
      listBuffer.push(numMatch[1]);
      continue;
    }

    // Anything else — flush pending list first
    flushList();

    // Blank line — spacing spacer
    if (line.trim() === "") {
      // Only add spacer if last element isn't already a spacer/hr
      const last = elements[elements.length - 1];
      if (last && (last as React.ReactElement)?.type !== "div") {
        elements.push(<div key={key++} className="h-1" />);
      }
      continue;
    }

    // Plain paragraph
    elements.push(
      <p key={key++} className="text-sm leading-relaxed text-foreground/85">
        {renderInline(line)}
      </p>
    );
  }

  flushList();

  return (
    <div className={className}>
      {elements}
    </div>
  );
}

/** Renders inline markdown: **bold**, *italic*, `code`, and plain text */
function renderInline(text: string): React.ReactNode {
  // Split by bold (**...**), italic (*...*), or inline code (`...`)
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);

  return parts.map((part, i) => {
    if (/^\*\*[^*]+\*\*$/.test(part)) {
      return <strong key={i} className="font-semibold text-foreground">{part.slice(2, -2)}</strong>;
    }
    if (/^\*[^*]+\*$/.test(part)) {
      return <em key={i}>{part.slice(1, -1)}</em>;
    }
    if (/^`[^`]+`$/.test(part)) {
      return (
        <code key={i} className="rounded bg-muted px-1 py-0.5 font-mono text-xs text-foreground">
          {part.slice(1, -1)}
        </code>
      );
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}

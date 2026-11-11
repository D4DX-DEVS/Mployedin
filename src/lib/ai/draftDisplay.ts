/**
 * What a chat bubble shows for an assistant reply.
 *
 * The job creator's model answers in prose and then appends the draft as
 * <JOB_DATA>{json}</JOB_DATA> (or <BULK_JOB_DATA>[…]</BULK_JOB_DATA>), which
 * the page reads into the Job Preview panel. The bubble must never show that
 * block. Stripping only *complete* blocks was not enough: while the reply is
 * still streaming the closing tag has not arrived, so the raw fields
 * ("title": "Science Teacher", …) scrolled past the employer for several
 * seconds (owner, 2026-11-11).
 */

const DRAFT_TAGS = ["<JOB_DATA>", "<BULK_JOB_DATA>"] as const;

const COMPLETE_BLOCK = /<(BULK_)?JOB_DATA>[\s\S]*?<\/\1JOB_DATA>/g;
const OPEN_BLOCK = /<(?:BULK_)?JOB_DATA>[\s\S]*$/;
/** A ```json fence the model sometimes opens just before the block. */
const DANGLING_FENCE = /```[a-z]*\s*$/i;
const EMPTY_FENCE = /```[a-z]*\s*```/gi;

export interface AssistantReplyDisplay {
  /** The prose to render, with every draft block (finished or not) removed. */
  text: string;
  /** The reply carries a finished draft block. */
  hasDraft: boolean;
  /** A draft block has started and its closing tag has not arrived yet. */
  isWritingDraft: boolean;
}

export function splitAssistantReply(content: string): AssistantReplyDisplay {
  let hasDraft = false;
  let text = content.replace(COMPLETE_BLOCK, () => {
    hasDraft = true;
    return "";
  });

  let isWritingDraft = false;
  if (OPEN_BLOCK.test(text)) {
    isWritingDraft = true;
    text = text.replace(OPEN_BLOCK, "");
  } else {
    // The opening tag itself arrives in pieces ("<JOB_", "<JOB_DATA").
    const lastAngle = text.lastIndexOf("<");
    if (lastAngle !== -1) {
      const tail = text.slice(lastAngle);
      if (tail.length > 1 && DRAFT_TAGS.some((tag) => tag.startsWith(tail))) {
        isWritingDraft = true;
        text = text.slice(0, lastAngle);
      }
    }
  }

  text = text.replace(EMPTY_FENCE, "");
  if (isWritingDraft) text = text.replace(DANGLING_FENCE, "");

  return { text: text.trim(), hasDraft, isWritingDraft };
}

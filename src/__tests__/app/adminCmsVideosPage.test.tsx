/**
 * The admin Videos form takes YouTube video links only (the landing page can
 * play nothing else). The rule is printed under the field, so an admin knows it
 * before saving; the server's own message is English and never reaches the form.
 */
import { render } from "@testing-library/react";
import VideosAdminPage from "@/app/[locale]/(dashboard)/admin/cms/videos/page";
import type { CrudField } from "@/components/shared/CrudModal";

let mockFields: CrudField[] = [];
jest.mock("@/components/features/admin/CmsPage", () => ({
  __esModule: true,
  default: (props: { fields: CrudField[] }) => {
    mockFields = props.fields;
    return null;
  },
}));

describe("admin Videos page: the URL field", () => {
  function urlField(): CrudField {
    render(<VideosAdminPage />);
    const field = mockFields.find((f) => f.name === "url");
    if (!field) throw new Error("no url field");
    return field;
  }

  it("says under the input that a YouTube video link is needed", () => {
    const field = urlField();
    expect(field.required).toBe(true);
    expect(field.hint).toBe("Use a YouTube video link (youtube.com/watch?v=… or youtu.be/…)");
  });

  it("keeps the YouTube-only label and an example link as the placeholder", () => {
    const field = urlField();
    expect(field.label).toBe("Video URL (YouTube only)");
    expect(field.placeholder).toMatch(/^https:\/\/youtube\.com\/watch\?v=/);
  });
});

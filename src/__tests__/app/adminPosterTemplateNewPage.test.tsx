/**
 * @jest-environment jsdom
 */
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { toast } from "sonner";
import NewPosterTemplatePage from "@/app/[locale]/(dashboard)/admin/poster-templates/new/page";

const pushMock = jest.fn();
const mutateAsyncMock = jest.fn();

jest.mock("next/navigation", () => ({
  useParams: () => ({ locale: "en" }),
  useRouter: () => ({ push: pushMock }),
}));

jest.mock("sonner", () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock("@/hooks/usePosterTemplates", () => ({
  useCreatePosterTemplate: () => ({
    mutateAsync: mutateAsyncMock,
    isPending: false,
  }),
}));

jest.mock("@/components/features/admin/poster-templates/PosterZoneCanvas", () => ({
  __esModule: true,
  default: function MockPosterZoneCanvas(props: { size: string; zones: Array<{ id: string }> }) {
    return (
      <div data-testid="poster-zone-canvas">
        {props.size} canvas with {props.zones.length} zone{props.zones.length === 1 ? "" : "s"}
      </div>
    );
  },
}));

jest.mock("@/components/features/admin/poster-templates/PosterZoneEditor", () => ({
  __esModule: true,
  default: function MockPosterZoneEditor(props: {
    zones: Array<{ id: string }>;
    onSetZones: (zones: Array<unknown>) => void;
    onSelectZone: (id: string | null) => void;
  }) {
    return (
      <div>
        <p>Mock editor zones: {props.zones.length}</p>
        <button
          type="button"
          onClick={() => {
            const nextZone = {
              id: `zone-${props.zones.length + 1}`,
              field: "title",
              x: 10,
              y: 10,
              w: 30,
              h: 8,
              fontSize: 16,
              fontWeight: 600,
              color: "#FFFFFF",
              align: "left",
              visible: true,
            };

            props.onSetZones([...props.zones, nextZone]);
            props.onSelectZone(nextZone.id);
          }}
        >
          Add mock zone
        </button>
      </div>
    );
  },
}));

describe("NewPosterTemplatePage", () => {
  beforeEach(() => {
    pushMock.mockReset();
    mutateAsyncMock.mockReset();
    mutateAsyncMock.mockResolvedValue({});
    (toast.success as jest.Mock).mockReset();
    (toast.error as jest.Mock).mockReset();
  });

  it("prioritizes the canvas on mobile and keeps zone state isolated per size", () => {
    render(<NewPosterTemplatePage />);

    const canvasSection = screen
      .getByRole("heading", { name: /landscape poster canvas/i })
      .closest("section");
    const editorSection = screen.getByText(/mock editor zones: 0/i).closest("section");

    expect(canvasSection).toHaveClass("order-1", "xl:order-2");
    expect(editorSection).toHaveClass("order-2", "xl:order-1");
    expect(screen.getByTestId("poster-zone-canvas")).toHaveTextContent("landscape canvas with 0 zones");

    fireEvent.click(screen.getByRole("button", { name: /square/i }));

    expect(screen.getByRole("heading", { name: /square poster canvas/i })).toBeInTheDocument();
    expect(screen.getByText(/0 zones on square/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /add mock zone/i }));

    expect(screen.getByText(/mock editor zones: 1/i)).toBeInTheDocument();
    expect(screen.getByText(/1 zone on square/i)).toBeInTheDocument();
    expect(screen.getByTestId("poster-zone-canvas")).toHaveTextContent("square canvas with 1 zone");

    fireEvent.click(screen.getByRole("button", { name: /landscape/i }));

    expect(screen.getByRole("heading", { name: /landscape poster canvas/i })).toBeInTheDocument();
    expect(screen.getByText(/0 zones on landscape/i)).toBeInTheDocument();
    expect(screen.getByTestId("poster-zone-canvas")).toHaveTextContent("landscape canvas with 0 zones");
  });

  it("shows validation feedback and submits the configured template", () => {
    render(<NewPosterTemplatePage />);

    fireEvent.click(screen.getByRole("button", { name: /^save template$/i }));
    expect(toast.error).toHaveBeenCalledWith("Template name is required.");

    fireEvent.change(screen.getByLabelText(/template name/i), {
      target: { value: "Corporate Blue" },
    });
    fireEvent.click(screen.getByRole("button", { name: /add mock zone/i }));
    fireEvent.click(screen.getByRole("button", { name: /^save template$/i }));

    expect(mutateAsyncMock).toHaveBeenCalledTimes(1);

    const formData = mutateAsyncMock.mock.calls[0][0] as FormData;
    expect(formData.get("name")).toBe("Corporate Blue");
    expect(formData.get("category")).toBe("corporate");
    expect(formData.get("defaultAccentColor")).toBe("#6366F1");
    expect(formData.get("textZones")).toEqual(
      JSON.stringify({
        landscape: [
          {
            id: "zone-1",
            field: "title",
            x: 10,
            y: 10,
            w: 30,
            h: 8,
            fontSize: 16,
            fontWeight: 600,
            color: "#FFFFFF",
            align: "left",
            visible: true,
          },
        ],
        square: [],
        story: [],
      })
    );
  });
});
/**
 * @jest-environment node
 */
import { Employer } from "@/models/Employer";
import { SystemSettings } from "@/models/SystemSettings";
import PosterGeneration from "@/models/PosterGeneration";
import { BRAND_FONT_IDS } from "@/lib/brand/brandKit";

describe("brand kit fields in the schemas", () => {
  it("stores the poster name and every poster font on an employer's kit", () => {
    const kit = Employer.schema.path("brandKit") as unknown as { schema: typeof Employer.schema };
    expect(kit.schema.path("displayName")).toBeDefined();
    expect((kit.schema.path("font") as unknown as { enumValues: string[] }).enumValues).toEqual(BRAND_FONT_IDS);
  });

  it("stores Mployedin's poster contact line", () => {
    expect(SystemSettings.schema.path("posterContact.email")).toBeDefined();
    expect(SystemSettings.schema.path("posterContact.phone")).toBeDefined();
  });

  it("snapshots the poster name with each saved poster", () => {
    expect(PosterGeneration.schema.path("brand.kit.displayName")).toBeDefined();
  });
});

import { classifyIndustry, INDUSTRY_KEY_TO_INDUSTRIES } from "@/lib/jobseekers/industryClassifier";
import type { IJobSeeker } from "@/models/JobSeeker";

describe("industryClassifier", () => {
  describe("classifyIndustry", () => {
    it("should return IT Services & Consulting when job title is Software Engineer", () => {
      const seeker = {
        experience: [
          {
            jobTitle: "Software Engineer",
            company: "Tech Corp",
            startDate: new Date("2022-01-01"),
            endDate: new Date("2024-01-01"),
            isCurrent: false,
            description: "Built web applications",
          },
        ],
        skills: [],
        education: [],
      } as any;

      const result = classifyIndustry(seeker);
      expect(result.industry).toBe("Information Technology");
      expect(result.source).toBe("experience");
    });

    it("should return Healthcare when job title is Nurse", () => {
      const seeker = {
        experience: [
          {
            jobTitle: "Registered Nurse",
            company: "City Hospital",
            startDate: new Date("2020-06-01"),
            isCurrent: true,
            description: "Patient care",
          },
        ],
        skills: [],
        education: [],
      } as any;

      const result = classifyIndustry(seeker);
      expect(result.industry).toBe("Healthcare/Hospitals");
      expect(result.source).toBe("experience");
    });

    it("should use skills when no clear experience", () => {
      const seeker = {
        experience: [],
        skills: ["FMCG Sales Operations"],
        education: [],
      } as any;

      const result = classifyIndustry(seeker);
      expect(result.industry).toBe("Food & Beverages");
      expect(result.source).toBe("skills");
    });

    it("should prefer careerProfile currentIndustry over skills", () => {
      const seeker = {
        experience: [],
        skills: ["SQL", "Python"],
        education: [],
        careerProfile: {
          currentIndustry: "Banking and Financial Services",
        },
      } as any;

      const result = classifyIndustry(seeker);
      expect(result.industry).toBe("Banking/Financial Services");
    });

    it("should return undefined when no clear industry detected", () => {
      const seeker = {
        experience: [],
        skills: ["Communication", "Leadership", "Project Management"],
        education: [],
      } as any;

      const result = classifyIndustry(seeker);
      expect(result.industry).toBeUndefined();
      expect(result.source).toBe("none");
    });

    it("should use education field when no experience or skills", () => {
      const seeker = {
        experience: [],
        skills: [],
        education: [
          {
            degree: "Bachelor of Pharmacy",
            institution: "University of Pharmacy",
            field: "Pharmaceutical Sciences",
          },
        ],
      } as any;

      const result = classifyIndustry(seeker);
      expect(result.industry).toBe("Pharmaceuticals");
      expect(result.source).toBe("education");
    });

    it("should use most recent job when multiple jobs exist", () => {
      const seeker = {
        experience: [
          {
            jobTitle: "Accountant",
            company: "Old Finance Corp",
            startDate: new Date("2015-01-01"),
            endDate: new Date("2018-01-01"),
            isCurrent: false,
            description: "Financial analysis",
          },
          {
            jobTitle: "Hospital Manager",
            company: "Central Hospital",
            startDate: new Date("2019-01-01"),
            endDate: new Date("2024-01-01"),
            isCurrent: false,
            description: "Manage operations",
          },
        ],
        skills: [],
        education: [],
      } as any;

      const result = classifyIndustry(seeker);
      expect(result.industry).toBe("Healthcare/Hospitals");
      expect(result.source).toBe("experience");
    });

    it("should handle current job (no endDate)", () => {
      const seeker = {
        experience: [
          {
            jobTitle: "Construction Manager",
            company: "BuildCorp",
            startDate: new Date("2023-01-01"),
            isCurrent: true,
            description: "Project oversight",
          },
        ],
        skills: [],
        education: [],
      } as any;

      const result = classifyIndustry(seeker);
      expect(result.industry).toBe("Construction/Engineering/Cement");
      expect(result.source).toBe("experience");
    });
  });

  describe("INDUSTRY_KEY_TO_INDUSTRIES", () => {
    it("should have all 20 industry keys mapped to Industries names", () => {
      const keys = Object.keys(INDUSTRY_KEY_TO_INDUSTRIES);
      expect(keys.length).toBe(20);
    });

    it("should map each key to an Industries name string", () => {
      const industries = Object.values(INDUSTRY_KEY_TO_INDUSTRIES);
      industries.forEach((industryName) => {
        expect(industryName).toBeTruthy();
        expect(typeof industryName).toBe("string");
        expect(industryName.length).toBeGreaterThan(0);
      });
    });
  });
});

/**
 * @jest-environment node
 *
 * QA EMP-017 (2026-10-06): the Messages page requested avatar files that had
 * been deleted when their owners changed photos (Spaces answers 403). The
 * conversation list now shows each participant's current photo.
 */
import { applyLiveAvatars } from "@/lib/dm/liveAvatars";

const SEEKER = "651000000000000000000a01";
const EMPLOYER = "651000000000000000000a02";
const REMOVED = "651000000000000000000a03";
const GONE = "651000000000000000000a04";

const mockUsers = jest.fn();
const mockEmployers = jest.fn();

jest.mock("@/models/User", () => ({
  __esModule: true,
  default: { find: (...a: unknown[]) => ({ select: () => ({ lean: () => mockUsers(...a) }) }) },
}));
jest.mock("@/models/Employer", () => ({
  __esModule: true,
  default: { find: (...a: unknown[]) => ({ select: () => ({ lean: () => mockEmployers(...a) }) }) },
}));

const oid = (id: string) => ({ toString: () => id });

beforeEach(() => {
  jest.clearAllMocks();
  mockUsers.mockResolvedValue([
    { _id: oid(SEEKER), avatar: "https://cdn/avatars/new.png" },
    { _id: oid(EMPLOYER), avatar: undefined },
    { _id: oid(REMOVED), avatar: "" },
  ]);
  mockEmployers.mockResolvedValue([{ userId: oid(EMPLOYER), logo: "https://cdn/avatars/logo.png" }]);
});

it("replaces saved copies with the current photo, the logo, or nothing", async () => {
  const conversations = [
    {
      participantDetails: [
        { userId: oid(SEEKER), role: "job_seeker", avatar: "https://cdn/avatars/old-deleted.png" },
        { userId: oid(EMPLOYER), role: "employer", avatar: "https://cdn/avatars/old-employer.png" },
      ],
    },
    {
      participantDetails: [
        { userId: oid(REMOVED), role: "agent", avatar: "https://cdn/avatars/removed.png" },
        { userId: oid(GONE), role: "job_seeker", avatar: "https://cdn/avatars/kept.png" },
      ],
    },
  ];

  await applyLiveAvatars(conversations);

  const [a, b] = conversations;
  expect(a.participantDetails[0].avatar).toBe("https://cdn/avatars/new.png");
  expect(a.participantDetails[1].avatar).toBe("https://cdn/avatars/logo.png");
  // Removed photo: show initials, not the deleted file.
  expect(b.participantDetails[0].avatar).toBeUndefined();
  // No account any more: nothing better to show than the saved copy.
  expect(b.participantDetails[1].avatar).toBe("https://cdn/avatars/kept.png");
});

it("looks each person up once and only asks for logos of employers without a photo", async () => {
  await applyLiveAvatars([
    { participantDetails: [{ userId: oid(SEEKER), role: "job_seeker" }, { userId: oid(EMPLOYER), role: "employer" }] },
    { participantDetails: [{ userId: oid(SEEKER), role: "job_seeker" }] },
  ]);
  expect(mockUsers).toHaveBeenCalledTimes(1);
  const userQuery = mockUsers.mock.calls[0][0] as { _id: { $in: unknown[] } };
  expect(userQuery._id.$in).toHaveLength(2);
  const employerQuery = mockEmployers.mock.calls[0][0] as { userId: { $in: { toString(): string }[] } };
  expect(employerQuery.userId.$in.map(String)).toEqual([EMPLOYER]);
});

it("does nothing for an empty list", async () => {
  await applyLiveAvatars([]);
  expect(mockUsers).not.toHaveBeenCalled();
});

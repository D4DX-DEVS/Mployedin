/**
 * @jest-environment node
 *
 * scripts/rehost-provider-avatars.mjs is run by the owner against the real
 * database; nothing here touches one. The decisions live in
 * scripts/lib/rehostProviderAvatarsCore.mjs and take their I/O (fetch, upload,
 * the two collections) as arguments, so every branch runs against mocks.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import * as core from "../../../scripts/lib/rehostProviderAvatarsCore.mjs";

const GOOGLE = "https://lh3.googleusercontent.com/a/ACg8ocJxyz=s96-c";
const LINKEDIN = "https://media.licdn.com/dms/image/v2/x/profile-displayphoto-shrink_100_100/0/1?e=1&t=sig";
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]);
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const GIF = Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0, 0, 0, 0, 0]);
const WEBP = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50]);
const HTML = new TextEncoder().encode("<html><body>nope</body></html>");

function imageResponse(bytes: Uint8Array, type = "image/jpeg", headers: Record<string, string> = {}): Response {
  return new Response(bytes as BodyInit, { status: 200, headers: { "content-type": type, ...headers } });
}

describe("provider avatar URLs", () => {
  it("matches provider avatar URLs only, https only, on a dot boundary", () => {
    expect(core.isProviderAvatarUrl(GOOGLE)).toBe(true);
    expect(core.isProviderAvatarUrl(LINKEDIN)).toBe(true);
    for (const url of [
      "http://lh3.googleusercontent.com/a/x",
      "https://lh3.googleusercontent.com.evil.com/a/x",
      "https://evillh3.googleusercontent.com/a/x",
      "https://lh3.googleusercontent.com@evil.com/a/x",
      "https://d4dx-storage.blr1.digitaloceanspaces.com/avatars/a.jpg",
      "https://i.pravatar.cc/150?img=3",
      "not a url",
      "",
      undefined,
      null,
    ]) {
      expect(core.isProviderAvatarUrl(url)).toBe(false);
    }
  });
});

describe("parseArgs", () => {
  it("is a dry run unless --apply is given", () => {
    expect(core.parseArgs([])).toEqual({ apply: false, limit: 0, userId: null, help: false, errors: [] });
    expect(core.parseArgs(["--apply"]).apply).toBe(true);
  });

  it("reads --limit and --user in both spellings", () => {
    expect(core.parseArgs(["--limit=25"]).limit).toBe(25);
    expect(core.parseArgs(["--limit", "25"]).limit).toBe(25);
    expect(core.parseArgs(["--user=507f1f77bcf86cd799439011"]).userId).toBe("507f1f77bcf86cd799439011");
    expect(core.parseArgs(["--user", "507f1f77bcf86cd799439011"]).userId).toBe("507f1f77bcf86cd799439011");
  });

  it("reports a bad limit, a bad user id and an unknown flag instead of guessing", () => {
    expect(core.parseArgs(["--limit=abc"]).errors).toHaveLength(1);
    expect(core.parseArgs(["--limit=-3"]).errors).toHaveLength(1);
    expect(core.parseArgs(["--user=not-an-id"]).errors).toHaveLength(1);
    expect(core.parseArgs(["--aply"]).errors).toHaveLength(1);
  });

  it("answers --help", () => {
    expect(core.parseArgs(["--help"]).help).toBe(true);
  });
});

describe("sniffImageType", () => {
  it("recognises the four raster formats by their first bytes", () => {
    expect(core.sniffImageType(JPEG)).toBe("image/jpeg");
    expect(core.sniffImageType(PNG)).toBe("image/png");
    expect(core.sniffImageType(GIF)).toBe("image/gif");
    expect(core.sniffImageType(WEBP)).toBe("image/webp");
  });

  it("refuses HTML, SVG, empty and short input", () => {
    expect(core.sniffImageType(HTML)).toBeNull();
    expect(core.sniffImageType(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
    expect(core.sniffImageType(new Uint8Array(0))).toBeNull();
    expect(core.sniffImageType(Uint8Array.from([0xff, 0xd8]))).toBeNull();
  });
});

describe("buildKey", () => {
  it("lives under avatars/, with the bucket folder prefix when there is one", () => {
    expect(core.buildKey({ prefix: "", id: "abc", ext: ".jpg" })).toBe("avatars/oauth-abc.jpg");
    expect(core.buildKey({ prefix: "Mployedin", id: "abc", ext: ".png" })).toBe("Mployedin/avatars/oauth-abc.png");
    expect(core.buildKey({ prefix: "Mployedin/", id: "abc", ext: ".png" })).toBe("Mployedin/avatars/oauth-abc.png");
  });
});

describe("downloadProviderImage", () => {
  it("downloads a real image, without following redirects, with a timeout", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(imageResponse(JPEG));
    const out = await core.downloadProviderImage(GOOGLE, { fetchImpl });
    expect(out).toEqual({ ok: true, bytes: expect.any(Uint8Array), contentType: "image/jpeg", ext: ".jpg" });
    expect(Array.from(out.bytes ?? [])).toEqual(Array.from(JPEG));
    expect(fetchImpl.mock.calls[0][1]).toEqual(expect.objectContaining({ redirect: "manual", signal: expect.any(AbortSignal) }));
  });

  it("takes the type from the bytes, not from the header", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(imageResponse(PNG, "image/jpeg"));
    const out = await core.downloadProviderImage(GOOGLE, { fetchImpl });
    expect(out).toEqual(expect.objectContaining({ ok: true, contentType: "image/png", ext: ".png" }));
  });

  it("refuses a URL that is not a provider avatar without any request", async () => {
    const fetchImpl = jest.fn();
    const out = await core.downloadProviderImage("https://example.com/a.jpg", { fetchImpl });
    expect(out).toEqual({ ok: false, reason: expect.stringMatching(/not a provider/i) });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    ["a redirect", () => new Response(null, { status: 302, headers: { location: "http://169.254.169.254/" } }), /redirect/i],
    ["an expired link (403)", () => new Response("deny-expired-url", { status: 403 }), /403/],
    ["HTML", () => imageResponse(HTML, "text/html"), /image/i],
    ["HTML that claims to be a jpeg", () => imageResponse(HTML, "image/jpeg"), /image/i],
    ["SVG", () => imageResponse(new TextEncoder().encode("<svg/>"), "image/svg+xml"), /image/i],
    ["an empty body", () => imageResponse(new Uint8Array(0)), /empty/i],
  ])("leaves %s alone and says why", async (_label, makeResponse, why) => {
    const fetchImpl = jest.fn().mockResolvedValue(makeResponse());
    const out = await core.downloadProviderImage(GOOGLE, { fetchImpl });
    expect(out.ok).toBe(false);
    expect(out.reason).toMatch(why);
  });

  it("refuses a declared size over the cap without reading the body", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(imageResponse(JPEG, "image/jpeg", { "content-length": "9999999" }));
    const out = await core.downloadProviderImage(GOOGLE, { fetchImpl, maxBytes: 1000 });
    expect(out).toEqual({ ok: false, reason: expect.stringMatching(/too large/i) });
  });

  it("stops at the cap when the body is bigger than the header said", async () => {
    let cancelled = false;
    const chunk = new Uint8Array(512).fill(0xff);
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(chunk);
      },
      cancel() {
        cancelled = true;
      },
    });
    const fetchImpl = jest.fn().mockResolvedValue(
      new Response(body, { status: 200, headers: { "content-type": "image/jpeg", "content-length": "10" } }),
    );
    const out = await core.downloadProviderImage(GOOGLE, { fetchImpl, maxBytes: 2048 });
    expect(out).toEqual({ ok: false, reason: expect.stringMatching(/too large/i) });
    expect(cancelled).toBe(true);
  });

  describe("a permanent refusal by the provider is a dead link; anything that may pass is not", () => {
    it.each([403, 404, 410])("HTTP %i: the link is dead (expired or removed)", async (status) => {
      const fetchImpl = jest.fn().mockResolvedValue(new Response("deny", { status }));
      const out = await core.downloadProviderImage(GOOGLE, { fetchImpl });
      expect(out).toEqual({ ok: false, dead: true, reason: expect.stringContaining(String(status)) });
    });

    it.each([408, 429, 500, 502, 503, 504])("HTTP %i is not a dead link (the provider may answer next time)", async (status) => {
      const fetchImpl = jest.fn().mockResolvedValue(new Response("later", { status }));
      const out = await core.downloadProviderImage(GOOGLE, { fetchImpl });
      expect(out.ok).toBe(false);
      expect(out.dead).toBeUndefined();
    });

    it("a redirect, a timeout, a non-image and an oversized body are not dead links either", async () => {
      const redirect = await core.downloadProviderImage(GOOGLE, {
        fetchImpl: jest.fn().mockResolvedValue(new Response(null, { status: 302, headers: { location: "https://x/" } })),
      });
      const network = await core.downloadProviderImage(GOOGLE, { fetchImpl: jest.fn().mockRejectedValue(new Error("ETIMEDOUT")) });
      const html = await core.downloadProviderImage(GOOGLE, { fetchImpl: jest.fn().mockResolvedValue(imageResponse(HTML, "text/html")) });
      const big = await core.downloadProviderImage(GOOGLE, {
        fetchImpl: jest.fn().mockResolvedValue(imageResponse(JPEG, "image/jpeg", { "content-length": "9999999" })),
        maxBytes: 1000,
      });
      for (const out of [redirect, network, html, big]) {
        expect(out.ok).toBe(false);
        expect(out.dead).toBeUndefined();
      }
    });
  });

  it("reports a network error in plain words", async () => {
    const fetchImpl = jest.fn().mockRejectedValue(new Error("ECONNRESET"));
    const out = await core.downloadProviderImage(GOOGLE, { fetchImpl });
    expect(out).toEqual({ ok: false, reason: expect.stringMatching(/couldn't/i) });
  });
});

describe("rehostUser", () => {
  const user = { _id: "507f1f77bcf86cd799439011", avatar: GOOGLE };

  function deps(overrides: Record<string, unknown> = {}) {
    return {
      apply: true,
      prefix: "",
      newId: () => "fixed-id",
      fetchImpl: jest.fn().mockResolvedValue(imageResponse(JPEG)),
      upload: jest.fn().mockResolvedValue("https://cdn.example/avatars/oauth-fixed-id.jpg"),
      remove: jest.fn().mockResolvedValue(undefined),
      users: { updateOne: jest.fn().mockResolvedValue({ matchedCount: 1, modifiedCount: 1 }) },
      conversations: { updateMany: jest.fn().mockResolvedValue({ modifiedCount: 2 }) },
      ...overrides,
    };
  }

  it("dry run: contacts nobody and writes nothing, but says what it would copy", async () => {
    const d = deps({ apply: false });
    const out = await core.rehostUser(user, d);
    expect(out).toEqual({ outcome: "would-copy", host: "lh3.googleusercontent.com" });
    expect(d.fetchImpl).not.toHaveBeenCalled();
    expect(d.upload).not.toHaveBeenCalled();
    expect(d.users.updateOne).not.toHaveBeenCalled();
    expect(d.conversations.updateMany).not.toHaveBeenCalled();
  });

  it("apply: downloads, uploads under a key built from the bytes' type, then repoints the user and the chat copies", async () => {
    const d = deps();
    const out = await core.rehostUser(user, d);

    expect(out).toEqual({
      outcome: "copied",
      host: "lh3.googleusercontent.com",
      newUrl: "https://cdn.example/avatars/oauth-fixed-id.jpg",
      conversationsUpdated: 2,
    });
    expect(d.upload).toHaveBeenCalledWith({ key: "avatars/oauth-fixed-id.jpg", bytes: expect.any(Uint8Array), contentType: "image/jpeg" });
    // Only if the avatar is still the one we copied: a user who uploaded a new photo meanwhile keeps it.
    expect(d.users.updateOne).toHaveBeenCalledWith(
      { _id: user._id, avatar: GOOGLE },
      { $set: { avatar: "https://cdn.example/avatars/oauth-fixed-id.jpg" } },
    );
    expect(d.conversations.updateMany).toHaveBeenCalledWith(
      { "participantDetails.userId": user._id },
      { $set: { "participantDetails.$[p].avatar": "https://cdn.example/avatars/oauth-fixed-id.jpg" } },
      { arrayFilters: [{ "p.userId": user._id, "p.avatar": GOOGLE }] },
    );
    // The copy is in use: nothing is deleted.
    expect(d.remove).not.toHaveBeenCalled();
  });

  it("leaves everything unchanged when the download fails", async () => {
    const d = deps({ fetchImpl: jest.fn().mockResolvedValue(new Response("x", { status: 503 })) });
    const out = await core.rehostUser(user, d);
    expect(out).toEqual({ outcome: "failed", host: "lh3.googleusercontent.com", reason: expect.stringMatching(/503/) });
    expect(d.upload).not.toHaveBeenCalled();
    expect(d.remove).not.toHaveBeenCalled();
    expect(d.users.updateOne).not.toHaveBeenCalled();
    expect(d.conversations.updateMany).not.toHaveBeenCalled();
  });

  it.each([403, 404, 410])("a link the provider refuses for good (HTTP %i) is a dead-link, not a failure, and nothing is written", async (status) => {
    const d = deps({ fetchImpl: jest.fn().mockResolvedValue(new Response("x", { status })) });
    const out = await core.rehostUser(user, d);
    expect(out).toEqual({ outcome: "dead-link", host: "lh3.googleusercontent.com", reason: expect.stringContaining(String(status)) });
    expect(d.upload).not.toHaveBeenCalled();
    expect(d.remove).not.toHaveBeenCalled();
    expect(d.users.updateOne).not.toHaveBeenCalled();
    expect(d.conversations.updateMany).not.toHaveBeenCalled();
  });

  describe("an upload that throws may still have written the object, so its key is removed best-effort", () => {
    const KEY = "avatars/oauth-fixed-id.jpg";

    it("leaves the user unchanged, and asks for the key to be removed", async () => {
      const d = deps({ upload: jest.fn().mockRejectedValue(new Error("RequestTimeout after the PUT was sent")) });
      const out = await core.rehostUser(user, d);
      expect(out).toEqual({ outcome: "failed", host: "lh3.googleusercontent.com", reason: expect.stringMatching(/upload/i) });
      expect(d.users.updateOne).not.toHaveBeenCalled();
      expect(d.conversations.updateMany).not.toHaveBeenCalled();
      expect(d.remove).toHaveBeenCalledTimes(1);
      expect(d.remove).toHaveBeenCalledWith({ key: KEY });
    });

    it("ignores an error from that remove: the result is the same plain upload failure", async () => {
      const d = deps({
        upload: jest.fn().mockRejectedValue(new Error("AccessDenied")),
        remove: jest.fn().mockRejectedValue(new Error("NoSuchKey")),
      });
      const out = await core.rehostUser(user, d);
      expect(out).toEqual({ outcome: "failed", host: "lh3.googleusercontent.com", reason: expect.stringMatching(/upload/i) });
      expect(d.remove).toHaveBeenCalledWith({ key: KEY });
    });

    it("does not crash when no remove function was given", async () => {
      const d = deps({ upload: jest.fn().mockRejectedValue(new Error("AccessDenied")), remove: undefined });
      const out = await core.rehostUser(user, d);
      expect(out).toEqual({ outcome: "failed", host: "lh3.googleusercontent.com", reason: expect.stringMatching(/upload/i) });
    });
  });

  describe("an uploaded copy the database never pointed at is deleted, not left in the public bucket", () => {
    const KEY = "avatars/oauth-fixed-id.jpg";

    it("when the user's avatar changed while the copy ran", async () => {
      const d = deps({ users: { updateOne: jest.fn().mockResolvedValue({ matchedCount: 0, modifiedCount: 0 }) } });
      const out = await core.rehostUser(user, d);
      expect(out).toEqual({ outcome: "changed-meanwhile", host: "lh3.googleusercontent.com", cleanedUp: true });
      expect(d.remove).toHaveBeenCalledTimes(1);
      expect(d.remove).toHaveBeenCalledWith({ key: KEY });
      expect(d.conversations.updateMany).not.toHaveBeenCalled();
    });

    it("when the database update throws and a re-read shows the avatar is still the old one, and the run carries on instead of crashing", async () => {
      const findOne = jest.fn().mockResolvedValue({ _id: user._id, avatar: GOOGLE });
      const d = deps({ users: { updateOne: jest.fn().mockRejectedValue(new Error("MongoNetworkError: secret-host:27017")), findOne } });
      const out = await core.rehostUser(user, d);
      expect(out).toEqual({
        outcome: "failed",
        host: "lh3.googleusercontent.com",
        reason: expect.stringMatching(/database/i),
        cleanedUp: true,
      });
      expect(out.reason).not.toMatch(/secret-host/);
      expect(findOne).toHaveBeenCalledWith({ _id: user._id }, { projection: { avatar: 1 } });
      expect(d.remove).toHaveBeenCalledWith({ key: KEY });
      expect(d.conversations.updateMany).not.toHaveBeenCalled();
    });

    it("when the database update throws and a re-read shows some other avatar (the user changed it)", async () => {
      const findOne = jest.fn().mockResolvedValue({ _id: user._id, avatar: "https://cdn.example/avatars/user-own.png" });
      const d = deps({ users: { updateOne: jest.fn().mockRejectedValue(new Error("boom")), findOne } });
      const out = await core.rehostUser(user, d);
      expect(out).toEqual(expect.objectContaining({ outcome: "failed", cleanedUp: true }));
      expect(d.remove).toHaveBeenCalledWith({ key: KEY });
    });

    it("and says which object is left behind when even the delete fails", async () => {
      const d = deps({
        users: { updateOne: jest.fn().mockResolvedValue({ matchedCount: 0 }) },
        remove: jest.fn().mockRejectedValue(new Error("AccessDenied")),
      });
      const out = await core.rehostUser(user, d);
      expect(out).toEqual({ outcome: "changed-meanwhile", host: "lh3.googleusercontent.com", cleanedUp: false, orphanedKey: KEY });
    });

    it("and reports the orphan the same way after a database error the re-read showed did not apply", async () => {
      const d = deps({
        users: {
          updateOne: jest.fn().mockRejectedValue(new Error("boom")),
          findOne: jest.fn().mockResolvedValue({ avatar: GOOGLE }),
        },
        remove: jest.fn().mockRejectedValue(new Error("AccessDenied")),
      });
      const out = await core.rehostUser(user, d);
      expect(out).toEqual(expect.objectContaining({ outcome: "failed", cleanedUp: false, orphanedKey: KEY }));
    });

    it("and treats a missing remove function as a failed delete, never as a crash", async () => {
      const d = deps({ users: { updateOne: jest.fn().mockResolvedValue({ matchedCount: 0 }) }, remove: undefined });
      const out = await core.rehostUser(user, d);
      expect(out).toEqual(expect.objectContaining({ outcome: "changed-meanwhile", cleanedUp: false, orphanedKey: KEY }));
    });
  });

  describe("a database update that throws does not prove the write did not apply (the connection can drop after the server committed it)", () => {
    const KEY = "avatars/oauth-fixed-id.jpg";
    const NEW_URL = "https://cdn.example/avatars/oauth-fixed-id.jpg";

    it("keeps the copy and counts the user as copied (marked recovered) when the re-read shows the avatar IS the new URL", async () => {
      const findOne = jest.fn().mockResolvedValue({ _id: user._id, avatar: NEW_URL });
      const d = deps({ users: { updateOne: jest.fn().mockRejectedValue(new Error("MongoNetworkError: connection closed")), findOne } });
      const out = await core.rehostUser(user, d);
      expect(out).toEqual({ outcome: "copied", host: "lh3.googleusercontent.com", newUrl: NEW_URL, conversationsUpdated: 2, recovered: true });
      expect(findOne).toHaveBeenCalledWith({ _id: user._id }, { projection: { avatar: 1 } });
      expect(d.remove).not.toHaveBeenCalled();
      // the user already points at the copy, so the chat lists follow it like any other copy
      expect(d.conversations.updateMany).toHaveBeenCalledTimes(1);
      expect(core.exitCodeFor([{ id: "u", ...out }])).toBe(0);
    });

    it("a recovered user whose chat lists then fail is both recovered and chatsFailed", async () => {
      const findOne = jest.fn().mockResolvedValue({ _id: user._id, avatar: NEW_URL });
      const d = deps({
        users: { updateOne: jest.fn().mockRejectedValue(new Error("MongoNetworkError")), findOne },
        conversations: { updateMany: jest.fn().mockRejectedValue(new Error("boom")) },
      });
      const out = await core.rehostUser(user, d);
      expect(out).toEqual(expect.objectContaining({ outcome: "copied", recovered: true, chatsFailed: true }));
    });

    it("an ordinary copy is not marked recovered", async () => {
      const out = await core.rehostUser(user, deps());
      expect(out).not.toHaveProperty("recovered");
    });

    it("deletes the copy when the re-read shows the avatar is still the old URL", async () => {
      const findOne = jest.fn().mockResolvedValue({ _id: user._id, avatar: GOOGLE });
      const d = deps({ users: { updateOne: jest.fn().mockRejectedValue(new Error("MongoNetworkError")), findOne } });
      const out = await core.rehostUser(user, d);
      expect(out).toEqual({ outcome: "failed", host: "lh3.googleusercontent.com", reason: expect.stringMatching(/database/i), cleanedUp: true });
      expect(d.remove).toHaveBeenCalledTimes(1);
      expect(d.remove).toHaveBeenCalledWith({ key: KEY });
      expect(d.conversations.updateMany).not.toHaveBeenCalled();
    });

    it("deletes the copy when the user no longer exists (nothing can point at it)", async () => {
      const d = deps({ users: { updateOne: jest.fn().mockRejectedValue(new Error("MongoNetworkError")), findOne: jest.fn().mockResolvedValue(null) } });
      const out = await core.rehostUser(user, d);
      expect(out).toEqual(expect.objectContaining({ outcome: "failed", cleanedUp: true }));
      expect(d.remove).toHaveBeenCalledWith({ key: KEY });
    });

    it("KEEPS the copy and reports it for a manual check, by key, when the re-read throws as well", async () => {
      const findOne = jest.fn().mockRejectedValue(new Error("MongoNetworkError: secret-host:27017"));
      const d = deps({ users: { updateOne: jest.fn().mockRejectedValue(new Error("MongoNetworkError: secret-host:27017")), findOne } });
      const out = await core.rehostUser(user, d);
      expect(out).toEqual({
        outcome: "needs-check",
        host: "lh3.googleusercontent.com",
        uncertainKey: KEY,
        reason: expect.stringMatching(/may or may not/i),
      });
      expect(JSON.stringify(out)).not.toMatch(/secret-host/);
      expect(d.remove).not.toHaveBeenCalled();
      expect(d.conversations.updateMany).not.toHaveBeenCalled();
      expect(core.exitCodeFor([{ id: "u", ...out }])).toBe(1);
    });

    it("treats a database without a usable re-read the same way (kept, manual check), never as a crash", async () => {
      const d = deps({ users: { updateOne: jest.fn().mockRejectedValue(new Error("boom")) } });
      const out = await core.rehostUser(user, d);
      expect(out).toEqual(expect.objectContaining({ outcome: "needs-check", uncertainKey: KEY }));
      expect(d.remove).not.toHaveBeenCalled();
    });
  });

  it("keeps the copy when only the chat lists could not be updated: the user already points at it", async () => {
    const d = deps({ conversations: { updateMany: jest.fn().mockRejectedValue(new Error("boom")) } });
    const out = await core.rehostUser(user, d);
    expect(out).toEqual({
      outcome: "copied",
      host: "lh3.googleusercontent.com",
      newUrl: "https://cdn.example/avatars/oauth-fixed-id.jpg",
      conversationsUpdated: 0,
      chatsFailed: true,
    });
    expect(d.remove).not.toHaveBeenCalled();
  });

  it("skips an avatar that is not a provider URL (our own storage, pravatar, anything else)", async () => {
    for (const avatar of ["https://d4dx-storage.blr1.digitaloceanspaces.com/avatars/a.jpg", "https://i.pravatar.cc/150", "", undefined]) {
      const d = deps();
      const out = await core.rehostUser({ _id: user._id, avatar }, d);
      expect(out.outcome).toBe("skipped");
      expect(d.fetchImpl).not.toHaveBeenCalled();
      expect(d.users.updateOne).not.toHaveBeenCalled();
    }
  });
});

describe("runRehost and --limit", () => {
  const ids = ["a", "b", "c", "d", "e"];
  const candidates = (list: string[] = ids) => list.map((id) => ({ _id: id, avatar: `https://lh3.googleusercontent.com/${id}` }));

  /**
   * fetch that answers 503 for the `failing` users (the provider is having a bad time: a real failure),
   * 403 for the `dead` users (an expired link: a dead-link) and serves a JPEG for the rest.
   */
  function deps(failing: string[] = [], dead: string[] = []) {
    const hit = (list: string[], url: string) => list.some((id) => url.endsWith(`/${id}`));
    return {
      apply: true,
      prefix: "",
      newId: () => "fixed-id",
      fetchImpl: jest.fn(async (url: string) =>
        hit(failing, url)
          ? new Response("later", { status: 503 })
          : hit(dead, url)
            ? new Response("deny", { status: 403 })
            : imageResponse(JPEG),
      ),
      upload: jest.fn().mockResolvedValue("https://cdn.example/avatars/oauth-fixed-id.jpg"),
      remove: jest.fn().mockResolvedValue(undefined),
      users: { updateOne: jest.fn().mockResolvedValue({ matchedCount: 1 }) },
      conversations: { updateMany: jest.fn().mockResolvedValue({ modifiedCount: 0 }) },
    };
  }

  async function* cursor<T>(items: T[]): AsyncGenerator<T> {
    for (const item of items) yield item;
  }

  it("without a limit, tries every candidate", async () => {
    const out = await core.runRehost(cursor(candidates()), deps(), { limit: 0 });
    expect(out.results.map((r: { outcome: string }) => r.outcome)).toEqual(Array(5).fill("copied"));
    expect(out.notAttempted).toBe(0);
  });

  it("stops after N copies and counts the candidates it never tried", async () => {
    const d = deps();
    const out = await core.runRehost(cursor(candidates()), d, { limit: 2 });
    expect(out.results.map((r: { id: string }) => r.id)).toEqual(["a", "b"]);
    expect(out.notAttempted).toBe(3);
    expect(d.fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("a user that fails is passed over, tried once, and does not use up the limit", async () => {
    const d = deps(["a", "b"]);
    const out = await core.runRehost(cursor(candidates()), d, { limit: 2 });
    expect(out.results.map((r: { id: string; outcome: string }) => `${r.id}:${r.outcome}`)).toEqual([
      "a:failed",
      "b:failed",
      "c:copied",
      "d:copied",
    ]);
    expect(out.notAttempted).toBe(1);
    // each user once: a failed user is never retried within the run
    expect(d.fetchImpl).toHaveBeenCalledTimes(4);
  });

  it("a user whose avatar changed meanwhile is not a copy either", async () => {
    const d = deps();
    d.users.updateOne.mockResolvedValueOnce({ matchedCount: 0 });
    const out = await core.runRehost(cursor(candidates()), d, { limit: 2 });
    expect(out.results.map((r: { outcome: string }) => r.outcome)).toEqual(["changed-meanwhile", "copied", "copied"]);
  });

  it("counts a dry run's would-copy toward the limit, so a trial looks like the real run", async () => {
    const out = await core.runRehost(cursor(candidates()), { ...deps(), apply: false }, { limit: 3 });
    expect(out.results.map((r: { outcome: string }) => r.outcome)).toEqual(Array(3).fill("would-copy"));
    expect(out.notAttempted).toBe(2);
  });

  it("hands each result to the caller as it happens", async () => {
    const seen: string[] = [];
    await core.runRehost(cursor(candidates(["a", "b"])), deps(["b"]), {
      limit: 0,
      onResult: (r: { id: string; outcome: string }) => seen.push(`${r.id}:${r.outcome}`),
    });
    expect(seen).toEqual(["a:copied", "b:failed"]);
  });

  describe("stops when everything fails (failed users do not use up --limit, so a dead link or a dead bucket would otherwise walk every user)", () => {
    const many = Array.from({ length: 25 }, (_, i) => `u${i}`);

    it("the cap is 10 in a row", () => {
      expect(core.MAX_CONSECUTIVE_FAILURES).toBe(10);
    });

    it("stops after 10 consecutive failures even with --limit, tries nobody after that, and says why", async () => {
      const d = deps(many);
      const out = await core.runRehost(cursor(candidates(many)), d, { limit: 5 });
      expect(out.results).toHaveLength(10);
      expect(out.results.every((r: { outcome: string }) => r.outcome === "failed")).toBe(true);
      expect(d.fetchImpl).toHaveBeenCalledTimes(10);
      expect(out.stoppedEarly).toEqual({ afterFailures: 10 });
    });

    it("stops without a limit too", async () => {
      const d = deps(many);
      const out = await core.runRehost(cursor(candidates(many)), d, { limit: 0 });
      expect(out.results).toHaveLength(10);
      expect(out.stoppedEarly).toEqual({ afterFailures: 10 });
    });

    it("a success in between starts the count again", async () => {
      const failing = [...many.slice(0, 9), ...many.slice(10, 19)]; // u9 succeeds between two runs of 9
      const d = deps(failing);
      const out = await core.runRehost(cursor(candidates(many.slice(0, 19))), d, { limit: 0 });
      expect(out.results).toHaveLength(19);
      expect(out.stoppedEarly).toBeNull();
    });

    it("exactly 10 failures with nobody left to try is not reported as stopped early", async () => {
      const ten = many.slice(0, 10);
      const out = await core.runRehost(cursor(candidates(ten)), deps(ten), { limit: 0 });
      expect(out.results).toHaveLength(10);
      expect(out.stoppedEarly).toBeNull();
    });

    it("counts a user that needs a manual check as a failure, and exits 1 for the stop", async () => {
      const d = deps();
      d.users = { updateOne: jest.fn().mockRejectedValue(new Error("down")) } as unknown as typeof d.users;
      const out = await core.runRehost(cursor(candidates(many)), d, { limit: 0 });
      expect(out.results).toHaveLength(10);
      expect(out.results.every((r: { outcome: string }) => r.outcome === "needs-check")).toBe(true);
      expect(out.stoppedEarly).toEqual({ afterFailures: 10 });
      expect(core.exitCodeFor(out.results, { stoppedEarly: out.stoppedEarly })).toBe(1);
    });

    it("a clean run reports no stop", async () => {
      const out = await core.runRehost(cursor(candidates()), deps(), { limit: 2 });
      expect(out.stoppedEarly).toBeNull();
    });

    it("10 consecutive 5xx answers from the provider stop the run", async () => {
      const d = deps(many);
      const out = await core.runRehost(cursor(candidates(many)), d, { limit: 0 });
      expect(out.results.map((r: { outcome: string }) => r.outcome)).toEqual(Array(10).fill("failed"));
      expect(out.results[0].reason).toMatch(/503/);
      expect(out.stoppedEarly).toEqual({ afterFailures: 10 });
      expect(d.fetchImpl).toHaveBeenCalledTimes(10);
    });
  });

  describe("dead links (the provider refuses the photo for good) are not failures of the run", () => {
    const block = Array.from({ length: 12 }, (_, i) => `dead${i}`);

    it("a block of 12 dead links followed by a good user: the good user is copied and the run is not stopped early", async () => {
      const d = deps([], block);
      const out = await core.runRehost(cursor(candidates([...block, "good"])), d, { limit: 0 });
      expect(out.results.map((r: { outcome: string }) => r.outcome)).toEqual([...Array(12).fill("dead-link"), "copied"]);
      expect(out.results[12]).toEqual(expect.objectContaining({ id: "good", outcome: "copied" }));
      expect(out.stoppedEarly).toBeNull();
      expect(d.upload).toHaveBeenCalledTimes(1);
      // dead links alone do not turn the exit status
      expect(core.exitCodeFor(out.results, { stoppedEarly: out.stoppedEarly })).toBe(0);
    });

    it("a run of nothing but dead links walks all of them, reports no stop, and still exits 0", async () => {
      const d = deps([], block);
      const out = await core.runRehost(cursor(candidates(block)), d, { limit: 0 });
      expect(out.results).toHaveLength(12);
      expect(out.stoppedEarly).toBeNull();
      expect(core.exitCodeFor(out.results, { stoppedEarly: out.stoppedEarly })).toBe(0);
    });

    it("they do not use up --limit", async () => {
      const d = deps([], ["a", "b"]);
      const out = await core.runRehost(cursor(candidates()), d, { limit: 2 });
      expect(out.results.map((r: { id: string; outcome: string }) => `${r.id}:${r.outcome}`)).toEqual([
        "a:dead-link",
        "b:dead-link",
        "c:copied",
        "d:copied",
      ]);
      expect(out.notAttempted).toBe(1);
    });

    it("they neither count toward the 10 nor start the count again: real failures with dead links in between still stop the run", async () => {
      const failing = [...many(9), "tail"]; // 9 failures, one dead link, one more failure = 10 real failures
      const d = deps(failing, ["mid"]);
      const list = [...many(9), "mid", "tail", "never-tried"];
      const out = await core.runRehost(cursor(candidates(list)), d, { limit: 0 });
      expect(out.results.map((r: { outcome: string }) => r.outcome)).toEqual([...Array(9).fill("failed"), "dead-link", "failed"]);
      expect(out.stoppedEarly).toEqual({ afterFailures: 10 });
      expect(d.fetchImpl).toHaveBeenCalledTimes(11);
    });

    it("9 real failures and any number of dead links do not stop the run", async () => {
      const d = deps(many(9), block);
      const out = await core.runRehost(cursor(candidates([...many(9), ...block, "good"])), d, { limit: 0 });
      expect(out.stoppedEarly).toBeNull();
      expect(out.results[out.results.length - 1]).toEqual(expect.objectContaining({ id: "good", outcome: "copied" }));
    });

    function many(n: number): string[] {
      return Array.from({ length: n }, (_, i) => `f${i}`);
    }
  });
});

describe("exitCodeFor", () => {
  it("is 0 when nothing failed", () => {
    expect(core.exitCodeFor([])).toBe(0);
    expect(
      core.exitCodeFor([
        { id: "a", outcome: "copied", host: "h" },
        { id: "b", outcome: "would-copy", host: "h" },
        { id: "c", outcome: "skipped", host: "" },
        { id: "d", outcome: "changed-meanwhile", host: "h", cleanedUp: true },
      ]),
    ).toBe(0);
  });

  it("is 1 when any user failed", () => {
    expect(core.exitCodeFor([{ id: "a", outcome: "copied", host: "h" }, { id: "b", outcome: "failed", host: "h", reason: "x" }])).toBe(1);
  });

  it("is 1 when a copy was left behind in the bucket", () => {
    expect(core.exitCodeFor([{ id: "a", outcome: "changed-meanwhile", host: "h", cleanedUp: false, orphanedKey: "avatars/oauth-x.jpg" }])).toBe(1);
  });

  it("is 1 when a user was repointed but the chat lists were not", () => {
    expect(core.exitCodeFor([{ id: "a", outcome: "copied", host: "h", chatsFailed: true }])).toBe(1);
  });

  it("is 0 for dead links alone (a removed or expired photo is not a fault of the run), 1 as soon as anything else failed", () => {
    const dead = { id: "d", outcome: "dead-link", host: "media.licdn.com", reason: "HTTP 403 (link expired or photo removed?)" };
    expect(core.exitCodeFor([dead, dead])).toBe(0);
    expect(core.exitCodeFor([dead, { id: "a", outcome: "copied", host: "h" }])).toBe(0);
    expect(core.exitCodeFor([dead, { id: "b", outcome: "failed", host: "h", reason: "x" }])).toBe(1);
  });

  it("is 1 when a user needs a manual check (the database update may or may not have applied)", () => {
    expect(core.exitCodeFor([{ id: "a", outcome: "needs-check", host: "h", uncertainKey: "avatars/oauth-x.jpg" }])).toBe(1);
  });

  it("is 1 when the run stopped early, whatever the results look like", () => {
    expect(core.exitCodeFor([{ id: "a", outcome: "copied", host: "h" }], { stoppedEarly: { afterFailures: 10 } })).toBe(1);
    expect(core.exitCodeFor([{ id: "a", outcome: "copied", host: "h" }], { stoppedEarly: null })).toBe(0);
  });
});

describe("candidateFilter", () => {
  it("selects users whose avatar is a provider URL, optionally one user", () => {
    const all = core.candidateFilter({ userId: null });
    expect(all.avatar.$regex).toBeInstanceOf(RegExp);
    expect(all.avatar.$regex.test(GOOGLE)).toBe(true);
    expect(all.avatar.$regex.test(LINKEDIN)).toBe(true);
    expect(all.avatar.$regex.test("https://lh3.googleusercontent.com.evil.com/x")).toBe(false);
    expect(all.avatar.$regex.test("https://d4dx-storage.blr1.digitaloceanspaces.com/a.jpg")).toBe(false);
    expect("_id" in all).toBe(false);
    const one: Record<string, unknown> = core.candidateFilter({ userId: "507f1f77bcf86cd799439011" });
    expect(one._id).toBe("507f1f77bcf86cd799439011");
  });
});

describe("summarise", () => {
  it("counts outcomes and prints ids and hosts, never URLs or e-mail addresses", () => {
    const lines = core.summarise(
      [
        { id: "u1", outcome: "copied", host: "lh3.googleusercontent.com", newUrl: "https://cdn.example/a.jpg", conversationsUpdated: 1 },
        { id: "u2", outcome: "failed", host: "media.licdn.com", reason: "HTTP 403 (link expired?)" },
        { id: "u3", outcome: "skipped", host: "" },
      ],
      { apply: true },
    ).join("\n");
    expect(lines).toMatch(/copied\s*:?\s*1/i);
    expect(lines).toMatch(/failed\s*:?\s*1/i);
    expect(lines).toContain("u2");
    expect(lines).toContain("media.licdn.com");
    expect(lines).not.toMatch(/@/);
  });

  it("says how many candidates --limit left untried", () => {
    const lines = core.summarise([{ id: "u1", outcome: "copied", host: "h" }], { apply: true, limit: 1, notAttempted: 7 }).join("\n");
    expect(lines).toMatch(/not attempted.*--limit.*7/i);
    const none = core.summarise([{ id: "u1", outcome: "copied", host: "h" }], { apply: true }).join("\n");
    expect(none).not.toMatch(/not attempted/i);
  });

  it("says that failed users do not use up the limit", () => {
    const lines = core.summarise([{ id: "u1", outcome: "failed", host: "h", reason: "HTTP 403" }], { apply: true, limit: 5, notAttempted: 0 }).join("\n");
    expect(lines).toMatch(/do not count toward --limit/i);
  });

  it("lists copies that could not be deleted, by object key, so the owner can remove them by hand", () => {
    const lines = core
      .summarise(
        [{ id: "u1", outcome: "changed-meanwhile", host: "h", cleanedUp: false, orphanedKey: "avatars/oauth-abc.jpg" }],
        { apply: true },
      )
      .join("\n");
    expect(lines).toMatch(/could not be deleted/i);
    expect(lines).toContain("avatars/oauth-abc.jpg");
    expect(lines).not.toMatch(/https?:/);
  });

  it("never says 'left unchanged' about anything that may have changed", () => {
    const lines = core
      .summarise(
        [
          { id: "u1", outcome: "failed", host: "h", reason: "HTTP 403" },
          { id: "u2", outcome: "needs-check", host: "h", uncertainKey: "avatars/oauth-abc.jpg", reason: "may or may not have applied" },
        ],
        { apply: true, limit: 3 },
      )
      .join("\n");
    expect(lines).not.toMatch(/left unchanged/i);
    expect(lines).toMatch(/Failed: 1 \(stored avatar not changed/i);
  });

  it("counts dead links on their own line and lists them by id, host and reason, never by URL; Failed does not include them", () => {
    const lines = core
      .summarise(
        [
          { id: "u1", outcome: "dead-link", host: "media.licdn.com", reason: "HTTP 403 (link expired or photo removed?)" },
          { id: "u2", outcome: "dead-link", host: "lh3.googleusercontent.com", reason: "HTTP 404 (link expired or photo removed?)" },
          { id: "u3", outcome: "failed", host: "h", reason: "HTTP 503 (link expired or photo removed?)" },
        ],
        { apply: true, limit: 5 },
      )
      .join("\n");
    expect(lines).toMatch(/Dead links[^\n]*: 2/i);
    expect(lines).toMatch(/Failed: 1 /);
    expect(lines).toMatch(/dead\s+u1\s+media\.licdn\.com\s+HTTP 403/);
    expect(lines).toMatch(/dead\s+u2\s+lh3\.googleusercontent\.com\s+HTTP 404/);
    expect(lines).toMatch(/not changed/i);
    expect(lines).not.toMatch(/https?:/);
  });

  it("has no dead-link block when there are none", () => {
    const lines = core.summarise([{ id: "u1", outcome: "copied", host: "h" }], { apply: true }).join("\n");
    expect(lines).toMatch(/Dead links[^\n]*: 0/i);
    expect(lines).not.toMatch(/^\s+dead\s/m);
  });

  it("counts users recovered after a database error on their own line (they are also in Copied)", () => {
    const lines = core
      .summarise(
        [
          { id: "u1", outcome: "copied", host: "h", recovered: true },
          { id: "u2", outcome: "copied", host: "h", recovered: true, chatsFailed: true },
          { id: "u3", outcome: "copied", host: "h" },
        ],
        { apply: true },
      )
      .join("\n");
    expect(lines).toMatch(/^Copied: 3$/m);
    expect(lines).toMatch(/Recovered after a database error[^\n]*: 2/i);
    const none = core.summarise([{ id: "u3", outcome: "copied", host: "h" }], { apply: true }).join("\n");
    expect(none).toMatch(/Recovered after a database error[^\n]*: 0/i);
  });

  it("lists users that need a manual check by object key: the copy was kept, nothing was deleted", () => {
    const lines = core
      .summarise(
        [{ id: "u2", outcome: "needs-check", host: "media.licdn.com", uncertainKey: "avatars/oauth-abc.jpg", reason: "may or may not have applied" }],
        { apply: true },
      )
      .join("\n");
    expect(lines).toMatch(/manual check/i);
    expect(lines).toMatch(/kept/i);
    expect(lines).toContain("u2");
    expect(lines).toContain("avatars/oauth-abc.jpg");
    expect(lines).not.toMatch(/https?:/);
  });

  it("says why a run stopped early", () => {
    const lines = core
      .summarise([{ id: "u1", outcome: "failed", host: "h", reason: "HTTP 403" }], { apply: true, stoppedEarly: { afterFailures: 10 } })
      .join("\n");
    expect(lines).toMatch(/stopped early/i);
    expect(lines).toMatch(/10 (users )?in a row/i);
    expect(lines).toMatch(/not tried/i);
    const clean = core.summarise([{ id: "u1", outcome: "copied", host: "h" }], { apply: true }).join("\n");
    expect(clean).not.toMatch(/stopped early/i);
  });

  it("lists users whose chat lists were not updated", () => {
    const lines = core.summarise([{ id: "u9", outcome: "copied", host: "h", chatsFailed: true }], { apply: true }).join("\n");
    expect(lines).toMatch(/chat lists? (was|were) not updated/i);
    expect(lines).toContain("u9");
  });

  describe("warns when the provider seems to be refusing this server", () => {
    const WARNING = "Every recent photo was refused by the provider — check whether it is blocking this server.";
    const dead = (n: number, from = 0) =>
      Array.from({ length: n }, (_, i) => ({ id: `d${from + i}`, outcome: "dead-link", host: "media.licdn.com", reason: "HTTP 403 (link expired or photo removed?)" }));

    it("10 dead links in a row and nothing copied: a WARNING line, and the exit status is untouched", () => {
      const results = dead(10);
      const lines = core.summarise(results, { apply: true }).join("\n");
      expect(lines).toContain(WARNING);
      expect(lines).toMatch(/^WARNING: /m);
      expect(core.exitCodeFor(results)).toBe(0);
      expect(core.exitCodeFor(results, { stoppedEarly: null })).toBe(0);
    });

    it("more than 10 in a row also warns", () => {
      expect(core.summarise(dead(25), { apply: true }).join("\n")).toContain(WARNING);
    });

    it("9 dead links do not warn", () => {
      expect(core.summarise(dead(9), { apply: true }).join("\n")).not.toContain("refused by the provider");
    });

    it("one copy anywhere in the run means the provider is not refusing everything: no warning", () => {
      const results = [...dead(12), { id: "ok", outcome: "copied", host: "h" }];
      expect(core.summarise(results, { apply: true }).join("\n")).not.toContain("refused by the provider");
    });

    it("they have to be in a row: a failure in between breaks the run", () => {
      const results = [...dead(6), { id: "x", outcome: "failed", host: "h", reason: "HTTP 503" }, ...dead(6, 6)];
      expect(core.summarise(results, { apply: true }).join("\n")).not.toContain("refused by the provider");
    });

    it("a run of 10 anywhere in the list counts, not only at the end", () => {
      const results = [...dead(10), { id: "x", outcome: "failed", host: "h", reason: "HTTP 503" }, ...dead(2, 10)];
      expect(core.summarise(results, { apply: true }).join("\n")).toContain(WARNING);
    });

    it("never in a dry run, where nothing is downloaded", () => {
      expect(core.summarise([{ id: "u", outcome: "would-copy", host: "h" }], { apply: false }).join("\n")).not.toContain("refused by the provider");
    });
  });

  it("tells a dry run how to apply", () => {
    const text = core.summarise([{ id: "u1", outcome: "would-copy", host: "lh3.googleusercontent.com" }], { apply: false }).join("\n");
    expect(text).toMatch(/--apply/);
    expect(text).toMatch(/would copy\s*:?\s*1/i);
  });
});

describe("resultLine (what the CLI prints as each user finishes)", () => {
  it("is outcome, id and host", () => {
    const line = core.resultLine({ id: "u1", outcome: "copied", host: "lh3.googleusercontent.com", newUrl: "https://cdn.example/avatars/oauth-x.jpg" });
    expect(line).toMatch(/^\s+copied\s+u1\s+lh3\.googleusercontent\.com$/);
    expect(line).not.toMatch(/https?:/);
  });

  it("adds the object key of a copy kept for a manual check, so it survives a crash or Ctrl-C", () => {
    const line = core.resultLine({ id: "u2", outcome: "needs-check", host: "media.licdn.com", uncertainKey: "avatars/oauth-abc.jpg" });
    expect(line).toMatch(/^\s+needs-check\s+u2\s+media\.licdn\.com\s+avatars\/oauth-abc\.jpg$/);
  });

  it("adds the object key of a copy that could not be deleted", () => {
    const line = core.resultLine({ id: "u3", outcome: "changed-meanwhile", host: "h", cleanedUp: false, orphanedKey: "Mployedin/avatars/oauth-def.png" });
    expect(line).toMatch(/\s+u3\s+h\s+Mployedin\/avatars\/oauth-def\.png$/);
  });

  it("does not print a key for results that have none, and never the reason or a URL", () => {
    const line = core.resultLine({ id: "u4", outcome: "failed", host: "h", reason: "HTTP 503 https://secret.example/x" });
    expect(line).toMatch(/^\s+failed\s+u4\s+h$/);
    expect(line).not.toMatch(/503|secret|https?:/);
  });
});

describe("scripts/rehost-provider-avatars.mjs", () => {
  const script = readFileSync(path.resolve(__dirname, "../../../scripts/rehost-provider-avatars.mjs"), "utf8");

  it("does nothing but read unless --apply is passed", () => {
    expect(script).toMatch(/parseArgs\(process\.argv\.slice\(2\)\)/);
    expect(script).toMatch(/apply:\s*args\.apply/);
  });

  it("asks for Spaces keys only when it will write", () => {
    expect(script).toMatch(/if \(args\.apply\)[\s\S]{0,200}SPACES_ACCESS_KEY_ID/);
  });

  it("does not print e-mail addresses or avatar URLs", () => {
    expect(script).not.toMatch(/email/i);
  });

  it("exits non-zero when any user failed", () => {
    expect(script).toMatch(/process\.exit\(exitCodeFor\(/);
    expect(script).not.toMatch(/process\.exit\(0\)/);
  });

  it("can delete an uploaded copy, and hands that to the core", () => {
    expect(script).toMatch(/DeleteObjectCommand/);
    expect(script).toMatch(/\bremove\b/);
  });

  it("applies --limit through the core, not by cutting the cursor (failed users must not use up the limit)", () => {
    expect(script).not.toMatch(/\.limit\(/);
    expect(script).toMatch(/runRehost\(/);
  });

  it("has a header comment that reads as a comment: no line over 100 characters, and the Recovered sentence has its own line", () => {
    const header = script.slice(0, script.indexOf("*/") + 2);
    expect(header.startsWith("/**")).toBe(true);
    const tooLong = header.split("\n").filter((line) => line.length > 100);
    expect(tooLong).toEqual([]);
    expect(header).toMatch(/^ \*\s+- New URL there: counted as copied/m);
  });

  it("prints each finished user through resultLine, so object keys reach the output as they happen", () => {
    expect(script).toMatch(/out\(resultLine\(result\)\)/);
  });

  it("hands the early stop to the report and to the exit status", () => {
    expect(script).toMatch(/stoppedEarly/);
    expect(script).toMatch(/exitCodeFor\(results,\s*\{\s*stoppedEarly\s*\}\)/);
  });

  it("--help documents the stop after 10 consecutive failures and what --limit counts", () => {
    const helpText = core.usageLines().join("\n");
    expect(helpText).toMatch(/Usage: node scripts\/rehost-provider-avatars\.mjs/);
    expect(helpText).toMatch(/10 users in a row/i);
    expect(helpText).toMatch(/exit(s)? (with )?(status )?1/i);
    expect(helpText).toMatch(/--limit/);
    expect(helpText).toMatch(/dead links?[\s\S]{0,200}do not count toward the stop[\s\S]{0,80}do not use up --limit[\s\S]{0,60}do not set exit status 1/i);
    // the number in the text is the constant, not a second copy
    expect(helpText).toContain(String(core.MAX_CONSECUTIVE_FAILURES));

    // and the real CLI prints it, in plain Node, with no database and no env file (cwd = temp dir)
    const env = { ...process.env };
    delete env.MONGODB_URI;
    const printed = execFileSync(process.execPath, [path.resolve(__dirname, "../../../scripts/rehost-provider-avatars.mjs"), "--help"], {
      cwd: os.tmpdir(),
      encoding: "utf8",
      env,
    });
    expect(printed).toMatch(/10 users in a row/i);
  });
});

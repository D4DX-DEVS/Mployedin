/**
 * @jest-environment node
 *
 * lib/storage/spaces.ts on both providers: where each object goes (bucket, key,
 * ACL/cache headers), the URL it gets back, and that key <-> URL round-trips.
 */
import sharp from "sharp";

const mockSent: Array<{ kind: string; input: Record<string, unknown> }> = [];
const mockClients: Array<Record<string, unknown>> = [];

jest.mock("@aws-sdk/client-s3", () => {
  const command = (kind: string) =>
    class {
      kind = kind;
      constructor(public input: Record<string, unknown>) {}
    };
  return {
    S3Client: class {
      constructor(config: Record<string, unknown>) {
        mockClients.push(config);
      }
      send(cmd: { kind: string; input: Record<string, unknown> }) {
        mockSent.push(cmd);
        return Promise.resolve({ Body: { transformToByteArray: async () => new Uint8Array([1, 2, 3]) } });
      }
    },
    PutObjectCommand: command("Put"),
    DeleteObjectCommand: command("Delete"),
    HeadObjectCommand: command("Head"),
    GetObjectCommand: command("Get"),
  };
});
jest.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: jest.fn(async (_client: unknown, cmd: { input: { Bucket: string; Key: string } }) => `signed:${cmd.input.Bucket}/${cmd.input.Key}`),
}));
jest.mock("@aws-sdk/lib-storage", () => ({
  Upload: class {
    constructor(public opts: { params: Record<string, unknown> }) {
      mockSent.push({ kind: "Upload", input: opts.params });
    }
    done() {
      return Promise.resolve();
    }
  },
}));
jest.mock("@/lib/security/malware-scan", () => ({
  scanForMalware: jest.fn(async () => ({ clean: true })),
  MalwareDetectedError: class extends Error {},
}));

import {
  deleteFile,
  downloadBuffer,
  fileExists,
  getPresignedUrl,
  keyToUrl,
  uploadBuffer,
  uploadLarge,
  urlToKey,
} from "@/lib/storage/spaces";

const ACCOUNT = "0123456789abcdef0123456789abcdef";
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const PDF = Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF");

const lastPut = () => [...mockSent].reverse().find((c) => c.kind === "Put")!.input;

describe("storage on R2", () => {
  const saved = { ...process.env };
  beforeEach(() => {
    mockSent.length = 0;
    mockClients.length = 0;
    process.env = {
      ...saved,
      STORAGE_PROVIDER: "r2",
      R2_ACCOUNT_ID: ACCOUNT,
      R2_ACCESS_KEY_ID: "key",
      R2_SECRET_ACCESS_KEY: "secret",
      R2_PUBLIC_BUCKET: "pub",
      R2_PRIVATE_BUCKET: "priv",
      NEXT_PUBLIC_R2_PUBLIC_HOST: "cdn.mployedin.com",
    };
    delete process.env.IMAGE_UPLOAD_OPTIMIZE;
  });
  afterAll(() => {
    process.env = saved;
  });

  it("talks to the account's R2 endpoint, path style", async () => {
    await fileExists("avatars/a.jpg");
    expect(mockClients[0]).toMatchObject({
      region: "auto",
      endpoint: `https://${ACCOUNT}.r2.cloudflarestorage.com`,
      forcePathStyle: true,
      credentials: { accessKeyId: "key", secretAccessKey: "secret" },
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
  });

  it("stores a document in the private bucket under private/, with no ACL and no public URL", async () => {
    const res = await uploadBuffer(PDF, { folder: "documents", fileName: "cv.pdf", contentType: "application/pdf" });
    expect(res.key).toMatch(new RegExp(`^private/documents/${UUID}\\.pdf$`));
    expect(res.bucket).toBe("priv");
    expect(res.url).toBe(`https://${ACCOUNT}.r2.cloudflarestorage.com/priv/${res.key}`);
    const put = lastPut();
    expect(put).toMatchObject({ Bucket: "priv", Key: res.key, ContentType: "application/pdf" });
    expect(put).not.toHaveProperty("ACL");
    expect(put).not.toHaveProperty("CacheControl");
    // Private PDFs are stored byte for byte.
    expect(put.Body).toBe(PDF);

    expect(urlToKey(res.url)).toBe(res.key);
    expect(await getPresignedUrl(res.key)).toBe(`signed:priv/${res.key}`);
  });

  it("cleans a public image, stores it in the public bucket with one-day caching", async () => {
    const png = await sharp({ create: { width: 1200, height: 900, channels: 3, background: "#369" } })
      .png()
      .withExifMerge({ IFD0: { Make: "PhoneCo" } })
      .toBuffer();
    const res = await uploadBuffer(png, { folder: "avatars", fileName: "me.png", contentType: "image/png" });

    expect(res.key).toMatch(new RegExp(`^avatars/${UUID}\\.jpg$`));
    expect(res.bucket).toBe("pub");
    expect(res.url).toBe(`https://cdn.mployedin.com/${res.key}`);
    expect(res.contentType).toBe("image/jpeg");
    const put = lastPut();
    expect(put).toMatchObject({
      Bucket: "pub",
      ContentType: "image/jpeg",
      CacheControl: "public, max-age=86400",
      ContentDisposition: expect.stringContaining('filename="me.jpg"'),
    });
    const meta = await sharp(put.Body as Buffer).metadata();
    expect(Math.max(meta.width!, meta.height!)).toBe(512);
    expect(meta.exif).toBeUndefined();
    expect(res.size).toBe((put.Body as Buffer).byteLength);
  });

  it("keeps a private image (an ID scan) byte for byte", async () => {
    const jpg = await sharp({ create: { width: 900, height: 600, channels: 3, background: "#999" } }).jpeg().toBuffer();
    await uploadBuffer(jpg, { folder: "documents", fileName: "id.jpg", contentType: "image/jpeg" });
    expect(lastPut().Body).toBe(jpg);
  });

  it("stores public images as sent when IMAGE_UPLOAD_OPTIMIZE=off", async () => {
    process.env.IMAGE_UPLOAD_OPTIMIZE = "off";
    const png = await sharp({ create: { width: 10, height: 10, channels: 3, background: "#000" } }).png().toBuffer();
    const res = await uploadBuffer(png, { folder: "media", fileName: "a.png", contentType: "image/png" });
    expect(res.key.endsWith(".png")).toBe(true);
    expect(lastPut().Body).toBe(png);
  });

  it("routes delete, download and presign by the key alone", async () => {
    await deleteFile("https://cdn.mployedin.com/avatars/x.jpg");
    await downloadBuffer(`https://${ACCOUNT}.r2.cloudflarestorage.com/priv/private/cvs/y.pdf`);
    const [del, get] = mockSent;
    expect(del.input).toEqual({ Bucket: "pub", Key: "avatars/x.jpg" });
    expect(get.input).toEqual({ Bucket: "priv", Key: "private/cvs/y.pdf" });
    expect(await getPresignedUrl("avatars/x.jpg")).toBe("signed:pub/avatars/x.jpg");
  });

  it("round-trips keys and URLs, and leaves foreign URLs alone", () => {
    for (const key of ["avatars/a.jpg", "private/documents/b.pdf"]) expect(urlToKey(keyToUrl(key))).toBe(key);
    expect(urlToKey("https://elsewhere.example/avatars/a.jpg")).toBe("https://elsewhere.example/avatars/a.jpg");
  });

  it("multipart uploads follow the same bucket rules", async () => {
    const res = await uploadLarge(PDF, { folder: "exports", fileName: "data.zip", contentType: "application/zip" });
    expect(res.key).toMatch(/^private\/exports\//);
    const upload = mockSent.find((c) => c.kind === "Upload")!.input;
    expect(upload).toMatchObject({ Bucket: "priv", Key: res.key });
    expect(upload).not.toHaveProperty("ACL");
  });
});

describe("storage on Spaces (default)", () => {
  const saved = { ...process.env };
  beforeEach(() => {
    mockSent.length = 0;
    process.env = { ...saved, SPACES_BUCKET_NAME: "d4dx-storage", SPACES_ENDPOINT: "blr1.digitaloceanspaces.com" };
    delete process.env.STORAGE_PROVIDER;
    delete process.env.DO_SPACES_CDN_ENDPOINT;
    delete process.env.DO_SPACES_FOLDER;
  });
  afterAll(() => {
    process.env = saved;
  });

  it("keeps one bucket with per-object ACLs and the Spaces URL", async () => {
    const res = await uploadBuffer(PDF, { folder: "cvs", fileName: "cv.pdf", contentType: "application/pdf" });
    expect(res.key).toMatch(new RegExp(`^cvs/${UUID}\\.pdf$`));
    expect(res.url).toBe(`https://d4dx-storage.blr1.digitaloceanspaces.com/${res.key}`);
    expect(lastPut()).toMatchObject({ Bucket: "d4dx-storage", ACL: "private" });
    expect(lastPut()).not.toHaveProperty("CacheControl");

    const pub = await uploadBuffer(PDF, { folder: "other", fileName: "a.pdf", contentType: "application/pdf" });
    expect(lastPut()).toMatchObject({ Bucket: "d4dx-storage", ACL: "public-read" });
    expect(urlToKey(pub.url)).toBe(pub.key);
  });
});

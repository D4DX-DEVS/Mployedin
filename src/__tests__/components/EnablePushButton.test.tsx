/**
 * @jest-environment jsdom
 *
 * With the worker now registered only on a user action, a visitor who has never
 * enabled notifications has no registration at all. The button used to wait on
 * `navigator.serviceWorker.ready`, which never settles without a registration,
 * so it would never have shown. It must show, and register the worker itself
 * when it is clicked.
 */
const toastSuccess = jest.fn();
const toastError = jest.fn();
jest.mock("sonner", () => ({
  toast: { success: (...args: unknown[]) => toastSuccess(...args), error: (...args: unknown[]) => toastError(...args) },
}));

const enableServiceWorker = jest.fn();
jest.mock("@/lib/pwa/enableServiceWorker", () => ({
  enableServiceWorker: (...args: unknown[]) => enableServiceWorker(...args),
}));

const mutableEnv = process.env as Record<string, string | undefined>;
const originalNodeEnv = mutableEnv.NODE_ENV;

import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EnablePushButton } from "@/components/shared/EnablePushButton";

const getRegistration = jest.fn();
const subscribe = jest.fn();
const requestPermission = jest.fn();
const fetchMock = jest.fn();
const order: string[] = [];

function installBrowser({ permission = "default", readyNeverSettles = false } = {}) {
  const readyRegistration = { pushManager: { subscribe } };
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: {
      getRegistration,
      get ready() {
        order.push("ready");
        return readyNeverSettles ? new Promise(() => {}) : Promise.resolve(readyRegistration);
      },
    },
  });
  Object.defineProperty(window, "PushManager", { configurable: true, value: class {} });
  Object.defineProperty(window, "Notification", {
    configurable: true,
    value: { permission, requestPermission },
  });
}

const button = () => screen.queryByRole("button", { name: /enable push notifications/i });

beforeEach(() => {
  mutableEnv.NODE_ENV = "production";
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "test-vapid-key";
  order.length = 0;
  toastSuccess.mockReset();
  toastError.mockReset();
  getRegistration.mockReset().mockResolvedValue(undefined);
  requestPermission.mockReset().mockResolvedValue("granted");
  enableServiceWorker.mockReset().mockImplementation(async () => {
    order.push("enable");
    return { scope: "/" };
  });
  subscribe.mockReset().mockResolvedValue({
    toJSON: () => ({ endpoint: "https://push.test/a", keys: { p256dh: "p", auth: "a" } }),
  });
  fetchMock.mockReset().mockResolvedValue({ ok: true });
  global.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  mutableEnv.NODE_ENV = originalNodeEnv;
});

afterAll(() => {
  delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
});

describe("EnablePushButton visibility", () => {
  it("shows when there is no service worker registration at all", async () => {
    installBrowser();
    getRegistration.mockResolvedValue(undefined);

    render(<EnablePushButton />);

    await waitFor(() => expect(button()).toBeInTheDocument());
    // It must not wait on `ready`, which never settles without a registration.
    expect(order).not.toContain("ready");
  });

  it("shows when a registration exists but holds no push subscription", async () => {
    installBrowser();
    getRegistration.mockResolvedValue({ pushManager: { getSubscription: jest.fn().mockResolvedValue(null) } });

    render(<EnablePushButton />);

    await waitFor(() => expect(button()).toBeInTheDocument());
  });

  it("stays hidden when the device is already subscribed", async () => {
    installBrowser();
    const getSubscription = jest.fn().mockResolvedValue({ endpoint: "https://push.test/a" });
    getRegistration.mockResolvedValue({ pushManager: { getSubscription } });

    render(<EnablePushButton />);

    await waitFor(() => expect(getSubscription).toHaveBeenCalled());
    expect(button()).not.toBeInTheDocument();
  });

  it("stays hidden when notifications were blocked", async () => {
    installBrowser({ permission: "denied" });

    render(<EnablePushButton />);

    await Promise.resolve();
    expect(button()).not.toBeInTheDocument();
  });

  it("stays hidden outside production, where no worker can be registered", async () => {
    installBrowser();
    mutableEnv.NODE_ENV = "development";

    render(<EnablePushButton />);

    await Promise.resolve();
    expect(getRegistration).not.toHaveBeenCalled();
    expect(button()).not.toBeInTheDocument();
  });

  it("stays hidden when no VAPID key is configured", async () => {
    installBrowser();
    delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

    render(<EnablePushButton />);

    await Promise.resolve();
    expect(button()).not.toBeInTheDocument();
  });
});

describe("EnablePushButton click", () => {
  it("registers the worker, waits for it, then subscribes and tells the server", async () => {
    installBrowser();
    render(<EnablePushButton />);
    await waitFor(() => expect(button()).toBeInTheDocument());

    await userEvent.click(button()!);

    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
    expect(order).toEqual(["enable", "ready"]);
    expect(subscribe).toHaveBeenCalledWith({ userVisibleOnly: true, applicationServerKey: "test-vapid-key" });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/push/subscription",
      expect.objectContaining({ method: "POST" }),
    );
    expect(button()).not.toBeInTheDocument();
  });

  it("does not register a worker for someone who declines the permission prompt", async () => {
    installBrowser();
    requestPermission.mockResolvedValue("denied");
    render(<EnablePushButton />);
    await waitFor(() => expect(button()).toBeInTheDocument());

    await userEvent.click(button()!);

    await waitFor(() => expect(button()).not.toBeInTheDocument());
    expect(enableServiceWorker).not.toHaveBeenCalled();
    expect(subscribe).not.toHaveBeenCalled();
  });

  it("reports a failure instead of hanging when the worker cannot be registered", async () => {
    installBrowser();
    enableServiceWorker.mockResolvedValue(null);
    render(<EnablePushButton />);
    await waitFor(() => expect(button()).toBeInTheDocument());

    await userEvent.click(button()!);

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(order).not.toContain("ready");
    expect(subscribe).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    // Still there to try again, and no longer busy.
    expect(button()).toBeEnabled();
  });

  describe("when the worker never becomes ready", () => {
    afterEach(() => {
      jest.useRealTimers();
    });

    it("gives up after 10 seconds with the error toast and clears the busy state", async () => {
      installBrowser({ readyNeverSettles: true });
      render(<EnablePushButton />);
      await waitFor(() => expect(button()).toBeInTheDocument());
      jest.useFakeTimers();
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

      await user.click(button()!);
      await waitFor(() => expect(order).toContain("ready"));
      expect(button()).toBeDisabled();

      await act(async () => {
        await jest.advanceTimersByTimeAsync(9_000);
      });
      expect(toastError).not.toHaveBeenCalled();

      await act(async () => {
        await jest.advanceTimersByTimeAsync(1_500);
      });

      expect(toastError).toHaveBeenCalledTimes(1);
      expect(subscribe).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
      expect(button()).toBeEnabled();
    });

    it("does not report a timeout when the worker is ready in time", async () => {
      installBrowser();
      render(<EnablePushButton />);
      await waitFor(() => expect(button()).toBeInTheDocument());
      jest.useFakeTimers();
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

      await user.click(button()!);
      await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
      await act(async () => {
        await jest.advanceTimersByTimeAsync(20_000);
      });

      expect(toastError).not.toHaveBeenCalled();
    });
  });

  it("reports a failure when the server rejects the subscription", async () => {
    installBrowser();
    fetchMock.mockResolvedValue({ ok: false });
    render(<EnablePushButton />);
    await waitFor(() => expect(button()).toBeInTheDocument());

    await userEvent.click(button()!);

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(toastSuccess).not.toHaveBeenCalled();
  });
});

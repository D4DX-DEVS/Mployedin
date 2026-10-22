import { render, screen } from "@testing-library/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { UserAvatar } from "@/components/shared/UserAvatar";

const GOOGLE = "https://lh3.googleusercontent.com/a/ACg8ocJxyz=s96-c";
const LINKEDIN = "https://media.licdn.com/dms/image/v2/x/profile-displayphoto-shrink_100_100/0/1?e=1&t=sig";
const SPACES = "https://d4dx-storage.blr1.digitaloceanspaces.com/avatars/a.jpg";

function proxied(url: string): string {
  return `/api/proxy-image?url=${encodeURIComponent(url)}`;
}

/**
 * Radix only mounts the <img> once a preloading Image reports "loaded", and
 * jsdom never loads anything. The stub records every address the preloader is
 * asked for (that is the request the browser would make) and reports success.
 */
const requested: string[] = [];
const RealImage = window.Image;

beforeAll(() => {
  class LoadingImage {
    complete = false;
    naturalWidth = 0;
    private current = "";
    private listeners: Record<string, Array<() => void>> = {};
    get src(): string {
      return this.current;
    }
    set src(value: string) {
      this.current = value;
      requested.push(value);
      queueMicrotask(() => {
        this.complete = true;
        this.naturalWidth = 1;
        for (const listener of this.listeners.load ?? []) listener();
      });
    }
    addEventListener(type: string, listener: () => void): void {
      (this.listeners[type] ??= []).push(listener);
    }
    removeEventListener(type: string, listener: () => void): void {
      this.listeners[type] = (this.listeners[type] ?? []).filter((candidate) => candidate !== listener);
    }
  }
  Object.defineProperty(window, "Image", { configurable: true, writable: true, value: LoadingImage });
});

afterAll(() => {
  Object.defineProperty(window, "Image", { configurable: true, writable: true, value: RealImage });
});

beforeEach(() => {
  requested.length = 0;
});

describe("AvatarImage", () => {
  it("renders a Google avatar through the first-party proxy and never asks Google's host", async () => {
    render(
      <Avatar>
        <AvatarImage src={GOOGLE} alt="Sara" />
        <AvatarFallback>SA</AvatarFallback>
      </Avatar>,
    );
    const img = await screen.findByAltText("Sara");
    expect(img).toHaveAttribute("src", proxied(GOOGLE));
    expect(requested).toEqual([proxied(GOOGLE)]);
    expect(requested.join(" ")).not.toContain("https://lh3.googleusercontent.com");
  });

  it("renders a LinkedIn avatar through the first-party proxy", async () => {
    render(
      <Avatar>
        <AvatarImage src={LINKEDIN} alt="Omar" />
      </Avatar>,
    );
    expect(await screen.findByAltText("Omar")).toHaveAttribute("src", proxied(LINKEDIN));
  });

  it("leaves our own storage URL as it is", async () => {
    render(
      <Avatar>
        <AvatarImage src={SPACES} alt="Lina" />
      </Avatar>,
    );
    expect(await screen.findByAltText("Lina")).toHaveAttribute("src", SPACES);
  });

  it("keeps showing the fallback when there is no src", () => {
    render(
      <Avatar>
        <AvatarImage alt="Nobody" />
        <AvatarFallback>NB</AvatarFallback>
      </Avatar>,
    );
    expect(screen.queryByAltText("Nobody")).toBeNull();
    expect(screen.getByText("NB")).toBeInTheDocument();
  });
});

describe("UserAvatar", () => {
  it("shows a provider photo through the proxy", async () => {
    render(<UserAvatar name="Sara Ali" src={GOOGLE} />);
    expect(await screen.findByAltText("Sara Ali")).toHaveAttribute("src", proxied(GOOGLE));
  });

  it("falls back to initials with no photo", () => {
    render(<UserAvatar name="Sara Ali" />);
    expect(screen.getByText("SA")).toBeInTheDocument();
  });
});

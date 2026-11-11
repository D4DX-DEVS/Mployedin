/**
 * <html lang dir> is written by the root layout, which Next does not render
 * again on an in-page navigation. Switching language by a link therefore left
 * the document English / left-to-right until a reload, and everything drawn
 * outside the locale wrapper (dialogs, menus, the cookie settings) with it.
 */
import { render } from "@testing-library/react";
import HtmlLocaleSync from "@/components/shared/HtmlLocaleSync";

afterEach(() => {
  document.documentElement.removeAttribute("lang");
  document.documentElement.removeAttribute("dir");
});

describe("HtmlLocaleSync", () => {
  it("puts the page's language and direction on <html>", () => {
    document.documentElement.lang = "en";
    document.documentElement.dir = "ltr";
    render(<HtmlLocaleSync locale="ar" />);
    expect(document.documentElement.lang).toBe("ar");
    expect(document.documentElement.dir).toBe("rtl");
  });

  it("follows a switch back to English", () => {
    const { rerender } = render(<HtmlLocaleSync locale="ar" />);
    rerender(<HtmlLocaleSync locale="en" />);
    expect(document.documentElement.lang).toBe("en");
    expect(document.documentElement.dir).toBe("ltr");
  });

  it("renders nothing", () => {
    const { container } = render(<HtmlLocaleSync locale="en" />);
    expect(container).toBeEmptyDOMElement();
  });
});

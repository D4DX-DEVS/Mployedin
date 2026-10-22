/**
 * @jest-environment jsdom
 *
 * After a Google sign-in the pages leave with a full page load, which is what
 * drops the hidden Google iframe and window.gapi Firebase's popup resolver adds.
 * It must replace the history entry (as router.replace did), so Back never
 * returns through the sign-in page.
 */
import { navigateWithPageLoad } from "@/lib/browser/navigateWithPageLoad";

describe("navigateWithPageLoad", () => {
  it("replaces the current history entry with a full page load", () => {
    const replace = jest.fn();

    // jsdom's own location cannot be spied on or swapped, so the helper takes it as a parameter.
    navigateWithPageLoad("/en/job-seeker", { replace });

    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith("/en/job-seeker");
  });

  it("does not add a history entry: assign is never used", () => {
    const location = { replace: jest.fn(), assign: jest.fn() };

    navigateWithPageLoad("/en/login", location);

    expect(location.assign).not.toHaveBeenCalled();
    expect(location.replace).toHaveBeenCalledWith("/en/login");
  });
});

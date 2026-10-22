/**
 * @jest-environment node
 *
 * [LEGAL] wording in the Cookie settings dialog that the review corrected:
 * - Strictly necessary says what the cookies are for, and that they can't be switched off.
 * - The display-settings "undo" line must not say the settings never leave the
 *   device: NEXT_LOCALE and mployedin_a11y are cookies, which the browser sends
 *   to our server on every request. It matches the withdrawal table of the
 *   published Cookie Policy ("Nothing. These settings are only used to show the
 *   site the way you set it.").
 */
import en from "../../../messages/en.json";
import ar from "../../../messages/ar.json";

type Settings = Record<string, string>;
const settings = (messages: unknown): Settings => (messages as { consent: { settings: Settings } }).consent.settings;
const items = (messages: unknown): Settings => (messages as { consent: { items: Settings } }).consent.items;

describe("consent.settings wording", () => {
  it("necessaryDescription (en)", () => {
    expect(settings(en).necessaryDescription).toBe(
      "Needed to provide the services you ask for, keep you signed in and protect your account. They can't be switched off.",
    );
  });

  it("preferencesUndo (en)", () => {
    expect(settings(en).preferencesUndo).toBe(
      "These settings are only used to show the site the way you set it, so there is nothing else to undo.",
    );
  });

  it("no longer says the settings never leave the device (they are cookies the browser sends to us)", () => {
    expect(settings(en).preferencesUndo).not.toMatch(/never leave/i);
    expect(settings(ar).preferencesUndo).not.toContain("لا تغادر");
  });

  it("has Arabic for both, in the dialog's style", () => {
    expect(settings(ar).necessaryDescription).toBe(
      "لازمة لتقديم الخدمات التي تطلبها، والإبقاء على تسجيل دخولك، وحماية حسابك. لا يمكن إيقافها.",
    );
    expect(settings(ar).preferencesUndo).toBe(
      "تُستخدم هذه الإعدادات فقط لعرض الموقع بالطريقة التي اخترتها، لذا لا يوجد ما يلزم التراجع عنه.",
    );
  });

  // Final review M5: the Videos switch decides whether a third party (YouTube) is loaded at all,
  // which is not "storing" anything, so the dialog's description names it too.
  it("describes both what is stored and whether YouTube videos load", () => {
    expect(settings(en).description).toBe(
      "Choose what this site may store in your browser and whether it may load videos from YouTube. Your choice applies to this browser only, and you can change it at any time.",
    );
    expect(settings(ar).description).toBe(
      "اختر ما يمكن لهذا الموقع حفظه في متصفحك، وما إذا كان يمكنه تحميل مقاطع الفيديو من YouTube. ينطبق اختيارك على هذا المتصفح فقط، ويمكنك تغييره في أي وقت.",
    );
  });

  it("uses no error-style copy", () => {
    for (const messages of [en, ar]) {
      expect(settings(messages).necessaryDescription).not.toMatch(/^Failed to/);
      expect(settings(messages).preferencesUndo).not.toMatch(/^Failed to/);
    }
  });
});

describe("consent.items for the tab-scoped dismissal", () => {
  it("noticeDismissed is labelled in both languages", () => {
    expect(items(en).noticeDismissed).toBe("Remembering a notice you closed, in this tab");
    expect(items(ar).noticeDismissed).toBe("تذكّر إشعار أغلقته، في علامة التبويب هذه");
  });
});

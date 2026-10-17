import { useTranslations } from "next-intl";
it("dbg", () => {
  const t = useTranslations("backgroundCheckWork");
  console.log("X1", t("rowActionProgress"), t("rowAction.start"), t("saved"));
});

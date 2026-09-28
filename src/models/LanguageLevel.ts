import { createAttributeModel, type IAttribute } from "./shared/attributeModel";

export type ILanguageLevel = IAttribute;

export const LanguageLevel = createAttributeModel<ILanguageLevel>("LanguageLevel", {}, "languagelevels");
export default LanguageLevel;

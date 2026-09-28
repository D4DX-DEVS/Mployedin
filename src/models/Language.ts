import { createAttributeModel, type IAttribute } from "./shared/attributeModel";

/** Spoken language (ISO 639-1). */
export interface ILanguage extends IAttribute {
  code: string;
  nativeName: string;
}

export const Language = createAttributeModel<ILanguage>(
  "Language",
  {
    code: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 3 },
    nativeName: { type: String, default: "", trim: true },
  },
  "languages",
);
export default Language;

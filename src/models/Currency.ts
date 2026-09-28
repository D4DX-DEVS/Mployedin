import { createAttributeModel, type IAttribute } from "./shared/attributeModel";

/** ISO 4217 currency. `slug` is the lower-cased code so the generic admin CRUD applies. */
export interface ICurrency extends IAttribute {
  code: string;
  symbol: string;
  decimalDigits: number;
}

export const Currency = createAttributeModel<ICurrency>(
  "Currency",
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true, maxlength: 3 },
    symbol: { type: String, default: "", trim: true },
    decimalDigits: { type: Number, default: 2 },
  },
  "currencies",
);
export default Currency;

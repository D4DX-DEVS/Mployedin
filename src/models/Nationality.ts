import { createAttributeModel, type IAttribute } from "./shared/attributeModel";

export type INationality = IAttribute;

export const Nationality = createAttributeModel<INationality>("Nationality", {}, "nationalities");
export default Nationality;

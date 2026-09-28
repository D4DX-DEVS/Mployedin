import { createAttributeModel, type IAttribute } from "./shared/attributeModel";

export type IBenefit = IAttribute;

export const Benefit = createAttributeModel<IBenefit>("Benefit", {}, "benefits");
export default Benefit;

import { createAttributeModel, type IAttribute } from "./shared/attributeModel";

export type ICareerLevel = IAttribute;

export const CareerLevel = createAttributeModel<ICareerLevel>("CareerLevel", {}, "careerlevels");
export default CareerLevel;

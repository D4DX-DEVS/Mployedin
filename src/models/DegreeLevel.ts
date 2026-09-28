import { createAttributeModel, type IAttribute } from "./shared/attributeModel";

export type IDegreeLevel = IAttribute;

export const DegreeLevel = createAttributeModel<IDegreeLevel>("DegreeLevel", {}, "degreelevels");
export default DegreeLevel;

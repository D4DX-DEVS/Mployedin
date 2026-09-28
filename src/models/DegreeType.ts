import { createAttributeModel, type IAttribute } from "./shared/attributeModel";

export type IDegreeType = IAttribute;

export const DegreeType = createAttributeModel<IDegreeType>("DegreeType", {}, "degreetypes");
export default DegreeType;

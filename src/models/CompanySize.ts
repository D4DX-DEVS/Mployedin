import { createAttributeModel, type IAttribute } from "./shared/attributeModel";

export type ICompanySize = IAttribute;

export const CompanySize = createAttributeModel<ICompanySize>("CompanySize", {}, "companysizes");
export default CompanySize;

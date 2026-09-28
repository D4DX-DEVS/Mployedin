import { createAttributeModel, type IAttribute } from "./shared/attributeModel";

export type IVisaStatus = IAttribute;

export const VisaStatus = createAttributeModel<IVisaStatus>("VisaStatus", {}, "visastatuses");
export default VisaStatus;

import { createAttributeModel, type IAttribute } from "./shared/attributeModel";

export type IJobShift = IAttribute;

export const JobShift = createAttributeModel<IJobShift>("JobShift", {}, "jobshifts");
export default JobShift;

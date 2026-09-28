import { createAttributeModel, type IAttribute } from "./shared/attributeModel";

export type IJobType = IAttribute;

export const JobType = createAttributeModel<IJobType>("JobType", {}, "jobtypes");
export default JobType;

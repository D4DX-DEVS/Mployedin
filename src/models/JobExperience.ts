import { createAttributeModel, type IAttribute } from "./shared/attributeModel";

export type IJobExperience = IAttribute;

export const JobExperience = createAttributeModel<IJobExperience>("JobExperience", {}, "jobexperiences");
export default JobExperience;

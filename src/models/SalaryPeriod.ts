import { createAttributeModel, type IAttribute } from "./shared/attributeModel";

export type ISalaryPeriod = IAttribute;

export const SalaryPeriod = createAttributeModel<ISalaryPeriod>("SalaryPeriod", {}, "salaryperiods");
export default SalaryPeriod;

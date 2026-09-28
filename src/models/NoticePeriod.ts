import { createAttributeModel, type IAttribute } from "./shared/attributeModel";

export type INoticePeriod = IAttribute;

export const NoticePeriod = createAttributeModel<INoticePeriod>("NoticePeriod", {}, "noticeperiods");
export default NoticePeriod;

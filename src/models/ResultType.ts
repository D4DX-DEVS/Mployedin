import { createAttributeModel, type IAttribute } from "./shared/attributeModel";

export type IResultType = IAttribute;

export const ResultType = createAttributeModel<IResultType>("ResultType", {}, "resulttypes");
export default ResultType;

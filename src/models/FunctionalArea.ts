import { createAttributeModel, type IAttribute } from "./shared/attributeModel";

export type IFunctionalArea = IAttribute;

export const FunctionalArea = createAttributeModel<IFunctionalArea>("FunctionalArea", {}, "functionalareas");
export default FunctionalArea;

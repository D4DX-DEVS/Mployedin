import { createAttributeModel, type IAttribute } from "./shared/attributeModel";

export type IOwnershipType = IAttribute;

export const OwnershipType = createAttributeModel<IOwnershipType>("OwnershipType", {}, "ownershiptypes");
export default OwnershipType;

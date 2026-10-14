import {
  validateSupportItems,
  getAllocationSummary,
  getDeliverySummary,
  validateAllocationRequest,
  validateDeliveryRequest,
  type SupportItem,
} from "@/lib/exhibitions/supportItems";

describe("exhibitionSupportItems", () => {
  describe("validateSupportItems", () => {
    it("accepts valid support items", () => {
      const input = [
        { item: "tv", requestedQty: 2 },
        { item: "rollup_banner", requestedQty: 1 },
        { item: "visiting_cards", requestedQty: 500 },
        { item: "volunteers", requestedQty: 3 },
        { item: "other", label: "Custom item", requestedQty: 10 },
      ];
      const result = validateSupportItems(input);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.items).toHaveLength(5);
        expect(result.items[4].label).toBe("Custom item");
      }
    });

    it("rejects non-array input", () => {
      const result = validateSupportItems("not an array");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("must be a list");
      }
    });

    it("rejects unknown item type", () => {
      const result = validateSupportItems([{ item: "unknown_type", requestedQty: 5 }]);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("Choose support items from the list");
      }
    });

    it("rejects duplicate item types", () => {
      const result = validateSupportItems([
        { item: "tv", requestedQty: 2 },
        { item: "tv", requestedQty: 3 },
      ]);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("listed twice");
      }
    });

    it("rejects 'other' without label", () => {
      const result = validateSupportItems([{ item: "other", requestedQty: 5 }]);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("Say what the \"Other\" support item is");
      }
    });

    it("rejects 'other' with empty label", () => {
      const result = validateSupportItems([{ item: "other", label: "   ", requestedQty: 5 }]);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("Say what the \"Other\" support item is");
      }
    });

    it("rejects label exceeding 120 characters", () => {
      const longLabel = "a".repeat(121);
      const result = validateSupportItems([{ item: "other", label: longLabel, requestedQty: 5 }]);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("120 characters");
      }
    });

    it("rejects non-integer requestedQty", () => {
      const result = validateSupportItems([{ item: "tv", requestedQty: 2.5 }]);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("whole-number quantity from 1 to 100,000");
      }
    });

    it("rejects requestedQty < 1", () => {
      const result = validateSupportItems([{ item: "tv", requestedQty: 0 }]);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("whole-number quantity from 1 to 100,000");
      }
    });

    it("rejects requestedQty > 100000", () => {
      const result = validateSupportItems([{ item: "tv", requestedQty: 100001 }]);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("whole-number quantity from 1 to 100,000");
      }
    });
  });

  describe("getAllocationSummary", () => {
    it("returns 'none' when no items have allocation", () => {
      const items: SupportItem[] = [
        { item: "tv", requestedQty: 2, deliveryStatus: "pending" },
      ];
      const summary = getAllocationSummary(items);
      expect(summary.status).toBe("none");
      expect(summary.shortage).toBe(2);
      expect(summary.allocatedCount).toBe(0);
    });

    it("returns 'partial' when some items are allocated", () => {
      const items: SupportItem[] = [
        { item: "tv", requestedQty: 2, allocatedQty: 1, deliveryStatus: "pending" },
        { item: "rollup_banner", requestedQty: 3, allocatedQty: 0, deliveryStatus: "pending" },
      ];
      const summary = getAllocationSummary(items);
      expect(summary.status).toBe("partial");
      expect(summary.shortage).toBe(4); // 1 + 3
      expect(summary.allocatedCount).toBe(1);
    });

    it("returns 'full' when all items are fully allocated", () => {
      const items: SupportItem[] = [
        { item: "tv", requestedQty: 2, allocatedQty: 2, deliveryStatus: "pending" },
        { item: "rollup_banner", requestedQty: 3, allocatedQty: 3, deliveryStatus: "pending" },
      ];
      const summary = getAllocationSummary(items);
      expect(summary.status).toBe("full");
      expect(summary.shortage).toBe(0);
      expect(summary.allocatedCount).toBe(2);
    });

    it("handles empty array", () => {
      const summary = getAllocationSummary([]);
      expect(summary.status).toBe("none");
      expect(summary.shortage).toBe(0);
      expect(summary.totalItems).toBe(0);
    });
  });

  describe("getDeliverySummary", () => {
    it("returns all delivered when status is 'delivered'", () => {
      const items: SupportItem[] = [
        { item: "tv", requestedQty: 2, deliveryStatus: "delivered", deliveredQty: 2 },
      ];
      const summary = getDeliverySummary(items);
      expect(summary.allDelivered).toBe(true);
      expect(summary.pendingCount).toBe(0);
      expect(summary.hasIssues).toBe(false);
    });

    it("counts pending items", () => {
      const items: SupportItem[] = [
        { item: "tv", requestedQty: 2, deliveryStatus: "pending" },
        { item: "rollup_banner", requestedQty: 3, deliveryStatus: "ready" },
      ];
      const summary = getDeliverySummary(items);
      expect(summary.allDelivered).toBe(false);
      expect(summary.pendingCount).toBe(2);
    });

    it("detects issues", () => {
      const items: SupportItem[] = [
        { item: "tv", requestedQty: 2, deliveryStatus: "issue", deliveryNote: "Damaged in transit" },
      ];
      const summary = getDeliverySummary(items);
      expect(summary.hasIssues).toBe(true);
    });

    it("handles empty array", () => {
      const summary = getDeliverySummary([]);
      expect(summary.allDelivered).toBe(true);
      expect(summary.pendingCount).toBe(0);
      expect(summary.hasIssues).toBe(false);
    });
  });

  describe("validateAllocationRequest", () => {
    const supportItems: SupportItem[] = [
      { item: "tv", requestedQty: 5, deliveryStatus: "pending" },
      { item: "volunteers", requestedQty: 10, deliveryStatus: "pending" },
    ];

    it("accepts valid allocation request", () => {
      const result = validateAllocationRequest(
        [
          { index: 0, allocatedQty: 5, responsiblePerson: "John" },
          { index: 1, allocatedQty: 8 },
        ],
        supportItems,
      );
      expect(result.ok).toBe(true);
    });

    it("rejects allocatedQty > requestedQty", () => {
      const result = validateAllocationRequest(
        [{ index: 0, allocatedQty: 6 }],
        supportItems,
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("Allocate between 0 and");
      }
    });

    it("rejects responsiblePerson exceeding 120 chars", () => {
      const result = validateAllocationRequest(
        [{ index: 0, allocatedQty: 2, responsiblePerson: "a".repeat(121) }],
        supportItems,
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("120 characters");
      }
    });

    it("rejects allocationNote exceeding 500 chars", () => {
      const result = validateAllocationRequest(
        [{ index: 0, allocatedQty: 2, allocationNote: "a".repeat(501) }],
        supportItems,
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("500 characters");
      }
    });

    it("allows negative allocatedQty to zero", () => {
      const result = validateAllocationRequest(
        [{ index: 0, allocatedQty: 0 }],
        supportItems,
      );
      expect(result.ok).toBe(true);
    });
  });

  describe("validateDeliveryRequest", () => {
    const supportItems: SupportItem[] = [
      {
        item: "tv",
        requestedQty: 5,
        allocatedQty: 3,
        deliveryStatus: "pending",
      },
    ];

    it("accepts valid delivery update", () => {
      const result = validateDeliveryRequest(
        [{ index: 0, deliveryStatus: "delivered", deliveredQty: 3 }],
        supportItems,
      );
      expect(result.ok).toBe(true);
    });

    it("rejects invalid deliveryStatus", () => {
      const result = validateDeliveryRequest(
        [{ index: 0, deliveryStatus: "invalid_status" }],
        supportItems,
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("Choose a delivery status");
      }
    });

    it("requires allocatedQty > 0 for 'delivered' status", () => {
      const items: SupportItem[] = [
        { item: "tv", requestedQty: 2, deliveryStatus: "pending" },
      ];
      const result = validateDeliveryRequest(
        [{ index: 0, deliveryStatus: "delivered", deliveredQty: 1 }],
        items,
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("nothing has been allocated");
      }
    });

    it("requires deliveredQty for 'delivered' status", () => {
      const result = validateDeliveryRequest(
        [{ index: 0, deliveryStatus: "delivered" }],
        supportItems,
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("between 1 and the");
      }
    });

    it("rejects deliveredQty > allocatedQty", () => {
      const result = validateDeliveryRequest(
        [{ index: 0, deliveryStatus: "delivered", deliveredQty: 4 }],
        supportItems,
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("between 1 and the");
      }
    });

    it("requires deliveryNote for 'issue' status", () => {
      const result = validateDeliveryRequest(
        [{ index: 0, deliveryStatus: "issue" }],
        supportItems,
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("what went wrong");
      }
    });

    it("accepts 'issue' with note", () => {
      const result = validateDeliveryRequest(
        [{ index: 0, deliveryStatus: "issue", deliveryNote: "Damaged" }],
        supportItems,
      );
      expect(result.ok).toBe(true);
    });
  });
});

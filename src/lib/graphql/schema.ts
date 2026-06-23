/**
 * GraphQL Schema + Resolvers for the Admin Subscription Dashboard.
 *
 * All MongoDB aggregation pipelines are defined here.
 * The single root query `subscriptionDashboard` returns every metric the
 * dashboard UI needs in one round-trip.
 */

import { createSchema } from "graphql-yoga";
import Subscription from "@/models/Subscription";
import Invoice from "@/models/Invoice";
import SubscriptionHistory from "@/models/SubscriptionHistory";

// ── helpers ──────────────────────────────────────────────────────────────────

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function startOfPreviousMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() - 1, 1);
}

function endOfPreviousMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 0, 23, 59, 59, 999);
}

function pct(a: number, b: number) {
  if (b === 0) return a > 0 ? 100 : 0;
  return Math.round(((a - b) / b) * 1000) / 10;
}

// ── type-defs ────────────────────────────────────────────────────────────────

const typeDefs = /* GraphQL */ `
  type Query {
    subscriptionDashboard(dateFrom: String, dateTo: String): SubscriptionDashboard!
  }

  type SubscriptionDashboard {
    overview: Overview!
    kpiComparisons: KpiComparisons!
    revenueTrend: [RevenueTrendPoint!]!
    subscriptionFunnel: SubscriptionFunnel!
    planDistribution: [PlanDistributionItem!]!
    topCustomers: [TopCustomer!]!
    topAgents: [TopAgent!]!
    renewalForecast: RenewalForecast!
    recentActivity: [ActivityItem!]!
    invoiceHealth: InvoiceHealth!
    revenueByCountry: [CountryRevenue!]!
  }

  type Overview {
    total: Int!
    active: Int!
    expired: Int!
    cancelled: Int!
    suspended: Int!
    mrr: Float!
    arr: Float!
    churnRate: Float!
    expiringSoon: Int!
    cancelledThisMonth: Int!
    employerActive: Int!
    jobSeekerActive: Int!
    paidActiveCount: Int!
  }

  type KpiComparisons {
    totalPrev: Int!
    activePrev: Int!
    mrrPrev: Float!
    churnPrev: Float!
    cancelledPrev: Int!
    totalChange: Float!
    activeChange: Float!
    mrrChange: Float!
    churnChange: Float!
    cancelledChange: Float!
  }

  type RevenueTrendPoint {
    month: String!
    year: Int!
    monthNum: Int!
    mrr: Float!
    newSubs: Int!
    employerMrr: Float!
    jobSeekerMrr: Float!
  }

  type SubscriptionFunnel {
    employer: [FunnelStage!]!
    jobSeeker: [FunnelStage!]!
  }

  type FunnelStage {
    name: String!
    count: Int!
    percentage: Float!
  }

  type PlanDistributionItem {
    planName: String!
    tier: Int!
    revenue: Float!
    percentage: Float!
    count: Int!
  }

  type TopCustomer {
    userId: String!
    name: String!
    email: String!
    planName: String!
    tier: Int!
    mrr: Float!
    since: String!
  }

  type TopAgent {
    agentId: String!
    name: String!
    subscriptionsSold: Int!
    revenue: Float!
  }

  type RenewalForecast {
    totalRenewing: Int!
    expectedRevenue: Float!
    within7: RenewalBucket!
    within15: RenewalBucket!
    within30: RenewalBucket!
  }

  type RenewalBucket {
    count: Int!
    revenue: Float!
  }

  type ActivityItem {
    id: String!
    userName: String!
    userEmail: String!
    action: String!
    toPlanName: String
    fromPlanName: String
    performedByName: String
    reason: String
    createdAt: String!
  }

  type InvoiceHealth {
    paidCount: Int!
    pendingCount: Int!
    overdueCount: Int!
    collectedRevenue: Float!
  }

  type CountryRevenue {
    country: String!
    revenue: Float!
    subscriptions: Int!
    percentage: Float!
  }
`;

// ── resolvers ────────────────────────────────────────────────────────────────

const resolvers = {
  Query: {
    subscriptionDashboard: async () => {
      const now = new Date();
      const som = startOfMonth(now);
      const sopm = startOfPreviousMonth(now);
      const eopm = endOfPreviousMonth(now);
      const in7 = new Date(now.getTime() + 7 * 864e5);
      const in15 = new Date(now.getTime() + 15 * 864e5);
      const in30 = new Date(now.getTime() + 30 * 864e5);

      // ── Parallel aggregations ──────────────────────────────────────

      const [
        statusCounts,
        roleCounts,
        mrrStats,
        cancelledThisMonth,
        prevMonthOverview,
        prevMrr,
        tierDistribution,
        revenueTrend,
        funnelEmployer,
        funnelJobSeeker,
        topCustomers,
        topAgents,
        renewalBuckets,
        recentActivity,
        invoiceHealth,
        countryRevenue,
      ] = await Promise.all([
        // 1 — status counts
        Subscription.aggregate([
          { $group: { _id: "$status", count: { $sum: 1 } } },
        ]),

        // 2 — active by role
        Subscription.aggregate([
          { $match: { status: "active" } },
          { $group: { _id: "$targetRole", count: { $sum: 1 } } },
        ]),

        // 3 — MRR (normalised)
        Subscription.aggregate([
          { $match: { status: "active", "planSnapshot.price": { $gt: 0 } } },
          {
            $group: {
              _id: null,
              mrr: {
                $sum: {
                  $divide: [
                    { $ifNull: ["$planSnapshot.price", 0] },
                    {
                      $switch: {
                        branches: [
                          { case: { $eq: ["$planSnapshot.billingCycle", "yearly"] }, then: 12 },
                          { case: { $eq: ["$planSnapshot.billingCycle", "quarterly"] }, then: 3 },
                        ],
                        default: 1,
                      },
                    },
                  ],
                },
              },
              paidActiveCount: { $sum: 1 },
            },
          },
        ]),

        // 4 — cancelled this month
        Subscription.countDocuments({
          status: "cancelled",
          cancelledAt: { $gte: som },
        }),

        // 5 — previous month overview (active count at end of prev month)
        Subscription.aggregate([
          {
            $match: {
              startDate: { $lte: eopm },
              $or: [
                { status: "active" },
                { status: "cancelled", cancelledAt: { $gt: eopm } },
                { status: "expired", endDate: { $gt: eopm } },
              ],
            },
          },
          { $group: { _id: "$status", count: { $sum: 1 } } },
        ]),

        // 6 — previous month MRR
        Subscription.aggregate([
          {
            $match: {
              "planSnapshot.price": { $gt: 0 },
              startDate: { $lte: eopm },
              $or: [
                { status: "active" },
                { status: "cancelled", cancelledAt: { $gt: eopm } },
                { status: "expired", endDate: { $gt: eopm } },
              ],
            },
          },
          {
            $group: {
              _id: null,
              mrr: {
                $sum: {
                  $divide: [
                    { $ifNull: ["$planSnapshot.price", 0] },
                    {
                      $switch: {
                        branches: [
                          { case: { $eq: ["$planSnapshot.billingCycle", "yearly"] }, then: 12 },
                          { case: { $eq: ["$planSnapshot.billingCycle", "quarterly"] }, then: 3 },
                        ],
                        default: 1,
                      },
                    },
                  ],
                },
              },
            },
          },
        ]),

        // 7 — tier distribution (revenue)
        Subscription.aggregate([
          { $match: { status: "active" } },
          {
            $group: {
              _id: { tier: "$planSnapshot.tier", name: "$planSnapshot.name" },
              count: { $sum: 1 },
              revenue: {
                $sum: {
                  $divide: [
                    { $ifNull: ["$planSnapshot.price", 0] },
                    {
                      $switch: {
                        branches: [
                          { case: { $eq: ["$planSnapshot.billingCycle", "yearly"] }, then: 12 },
                          { case: { $eq: ["$planSnapshot.billingCycle", "quarterly"] }, then: 3 },
                        ],
                        default: 1,
                      },
                    },
                  ],
                },
              },
            },
          },
          { $sort: { "_id.tier": -1 } },
        ]),

        // 8 — revenue trend (last 6 months) with employer/jobseeker split
        Subscription.aggregate([
          {
            $match: {
              status: { $in: ["active", "expired", "cancelled"] },
              startDate: {
                $gte: new Date(now.getFullYear(), now.getMonth() - 5, 1),
              },
            },
          },
          {
            $group: {
              _id: {
                year: { $year: "$startDate" },
                month: { $month: "$startDate" },
              },
              newSubs: { $sum: 1 },
              totalMrr: {
                $sum: {
                  $divide: [
                    { $ifNull: ["$planSnapshot.price", 0] },
                    {
                      $switch: {
                        branches: [
                          { case: { $eq: ["$planSnapshot.billingCycle", "yearly"] }, then: 12 },
                          { case: { $eq: ["$planSnapshot.billingCycle", "quarterly"] }, then: 3 },
                        ],
                        default: 1,
                      },
                    },
                  ],
                },
              },
              employerMrr: {
                $sum: {
                  $cond: [
                    { $eq: ["$targetRole", "employer"] },
                    {
                      $divide: [
                        { $ifNull: ["$planSnapshot.price", 0] },
                        {
                          $switch: {
                            branches: [
                              { case: { $eq: ["$planSnapshot.billingCycle", "yearly"] }, then: 12 },
                              { case: { $eq: ["$planSnapshot.billingCycle", "quarterly"] }, then: 3 },
                            ],
                            default: 1,
                          },
                        },
                      ],
                    },
                    0,
                  ],
                },
              },
              jobSeekerMrr: {
                $sum: {
                  $cond: [
                    { $eq: ["$targetRole", "job_seeker"] },
                    {
                      $divide: [
                        { $ifNull: ["$planSnapshot.price", 0] },
                        {
                          $switch: {
                            branches: [
                              { case: { $eq: ["$planSnapshot.billingCycle", "yearly"] }, then: 12 },
                              { case: { $eq: ["$planSnapshot.billingCycle", "quarterly"] }, then: 3 },
                            ],
                            default: 1,
                          },
                        },
                      ],
                    },
                    0,
                  ],
                },
              },
            },
          },
          { $sort: { "_id.year": 1, "_id.month": 1 } },
        ]),

        // 9 — employer funnel
        Subscription.aggregate([
          { $match: { status: "active", targetRole: "employer" } },
          {
            $group: {
              _id: { tier: "$planSnapshot.tier", name: "$planSnapshot.name" },
              count: { $sum: 1 },
            },
          },
          { $sort: { "_id.tier": 1 } },
        ]),

        // 10 — jobseeker funnel
        Subscription.aggregate([
          { $match: { status: "active", targetRole: "job_seeker" } },
          {
            $group: {
              _id: { tier: "$planSnapshot.tier", name: "$planSnapshot.name" },
              count: { $sum: 1 },
            },
          },
          { $sort: { "_id.tier": 1 } },
        ]),

        // 11 — top customers by MRR
        Subscription.aggregate([
          { $match: { status: "active", "planSnapshot.price": { $gt: 0 } } },
          {
            $group: {
              _id: "$userId",
              mrr: {
                $sum: {
                  $divide: [
                    { $ifNull: ["$planSnapshot.price", 0] },
                    {
                      $switch: {
                        branches: [
                          { case: { $eq: ["$planSnapshot.billingCycle", "yearly"] }, then: 12 },
                          { case: { $eq: ["$planSnapshot.billingCycle", "quarterly"] }, then: 3 },
                        ],
                        default: 1,
                      },
                    },
                  ],
                },
              },
              planName: { $first: "$planSnapshot.name" },
              tier: { $max: "$planSnapshot.tier" },
              since: { $min: "$startDate" },
            },
          },
          { $sort: { mrr: -1 } },
          { $limit: 5 },
          {
            $lookup: {
              from: "users",
              localField: "_id",
              foreignField: "_id",
              as: "user",
              pipeline: [{ $project: { name: 1, email: 1 } }],
            },
          },
          { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
        ]),

        // 12 — top selling agents (by invoice commission)
        Invoice.aggregate([
          { $match: { status: "paid", "commissions.0": { $exists: true } } },
          { $unwind: "$commissions" },
          { $match: { "commissions.role": "agent" } },
          {
            $group: {
              _id: "$commissions.agentId",
              subscriptionsSold: { $sum: 1 },
              revenue: { $sum: "$amount" },
            },
          },
          { $sort: { revenue: -1 } },
          { $limit: 5 },
          {
            $lookup: {
              from: "users",
              localField: "_id",
              foreignField: "_id",
              as: "user",
              pipeline: [{ $project: { name: 1 } }],
            },
          },
          { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
        ]),

        // 13 — renewal forecast (3 buckets: 7d, 15d, 30d)
        Subscription.aggregate([
          {
            $match: {
              status: "active",
              endDate: { $gte: now, $lte: in30 },
            },
          },
          {
            $group: {
              _id: {
                $switch: {
                  branches: [
                    { case: { $lte: ["$endDate", in7] }, then: "within7" },
                    { case: { $lte: ["$endDate", in15] }, then: "within15" },
                  ],
                  default: "within30",
                },
              },
              count: { $sum: 1 },
              revenue: {
                $sum: {
                  $divide: [
                    { $ifNull: ["$planSnapshot.price", 0] },
                    {
                      $switch: {
                        branches: [
                          { case: { $eq: ["$planSnapshot.billingCycle", "yearly"] }, then: 12 },
                          { case: { $eq: ["$planSnapshot.billingCycle", "quarterly"] }, then: 3 },
                        ],
                        default: 1,
                      },
                    },
                  ],
                },
              },
            },
          },
        ]),

        // 14 — recent activity (last 20)
        SubscriptionHistory.find()
          .sort({ createdAt: -1 })
          .limit(20)
          .populate("userId", "name email")
          .populate("performedBy", "name")
          .lean(),

        // 15 — invoice health (this month)
        Invoice.aggregate([
          {
            $facet: {
              paid: [
                { $match: { status: "paid", paidAt: { $gte: som } } },
                { $group: { _id: null, count: { $sum: 1 }, total: { $sum: "$amount" } } },
              ],
              pending: [
                { $match: { status: { $in: ["issued", "sent", "pending_approval"] } } },
                { $group: { _id: null, count: { $sum: 1 } } },
              ],
              overdue: [
                {
                  $match: {
                    status: { $nin: ["paid", "voided", "cancelled", "credited"] },
                    dueDate: { $lt: now },
                  },
                },
                { $group: { _id: null, count: { $sum: 1 } } },
              ],
            },
          },
        ]),

        // 16 — revenue by country (via Employer model)
        Subscription.aggregate([
          { $match: { status: "active", targetRole: "employer" } },
          {
            $lookup: {
              from: "employers",
              localField: "userId",
              foreignField: "userId",
              as: "employer",
              pipeline: [{ $project: { country: 1 } }],
            },
          },
          { $unwind: { path: "$employer", preserveNullAndEmptyArrays: true } },
          {
            $group: {
              _id: { $ifNull: ["$employer.country", "Unknown"] },
              subscriptions: { $sum: 1 },
              revenue: {
                $sum: {
                  $divide: [
                    { $ifNull: ["$planSnapshot.price", 0] },
                    {
                      $switch: {
                        branches: [
                          { case: { $eq: ["$planSnapshot.billingCycle", "yearly"] }, then: 12 },
                          { case: { $eq: ["$planSnapshot.billingCycle", "quarterly"] }, then: 3 },
                        ],
                        default: 1,
                      },
                    },
                  ],
                },
              },
            },
          },
          { $sort: { revenue: -1 } },
          { $limit: 5 },
        ]),
      ]);

      // ── Post-process ─────────────────────────────────────────────────

      const statusMap: Record<string, number> = {};
      for (const s of statusCounts) statusMap[s._id] = s.count;

      const roleMap: Record<string, number> = {};
      for (const r of roleCounts) roleMap[r._id] = r.count;

      const currentMrr = Math.round((mrrStats[0]?.mrr ?? 0) * 100) / 100;
      const currentArr = Math.round(currentMrr * 12 * 100) / 100;
      const paidActiveCount = mrrStats[0]?.paidActiveCount ?? 0;

      const totalNow = Object.values(statusMap).reduce((a, b) => a + b, 0);
      const activeNow = statusMap.active ?? 0;

      // Previous month
      const prevMap: Record<string, number> = {};
      for (const p of prevMonthOverview) prevMap[p._id] = p.count;
      const prevActive = prevMap.active ?? 0;
      const totalPrev = Object.values(prevMap).reduce((a, b) => a + b, 0);
      const prevMrrVal = Math.round((prevMrr[0]?.mrr ?? 0) * 100) / 100;

      // Previous month cancelled
      const prevCancelled = await Subscription.countDocuments({
        status: "cancelled",
        cancelledAt: { $gte: sopm, $lt: som },
      });

      // Churn = cancelled this month / active at start of month
      const activeAtSom = prevActive; // active at end of previous month ≈ active at start of this month
      const churnRate = activeAtSom > 0 ? Math.round((cancelledThisMonth / activeAtSom) * 1000) / 10 : 0;
      const prevChurn = prevActive > 0 ? Math.round((prevCancelled / prevActive) * 1000) / 10 : 0;

      // ── Funnel ────────────────────────────────────────────────────
      const buildFunnel = (
        stages: Array<{ _id: { tier: number; name: string }; count: number }>,
        totalActive: number,
      ) => {
        const totalLabel = totalActive > 0 ? "Total" : "Total";
        const result = [
          { name: totalLabel, count: totalActive, percentage: 100 },
        ];
        for (const s of stages) {
          result.push({
            name: s._id.name || `Tier ${s._id.tier}`,
            count: s.count,
            percentage: totalActive > 0 ? Math.round((s.count / totalActive) * 1000) / 10 : 0,
          });
        }
        return result;
      };

      const employerTotal = roleMap.employer ?? 0;
      const jobSeekerTotal = roleMap.job_seeker ?? 0;

      // ── Plan distribution ────────────────────────────────────────
      const totalRevenue = tierDistribution.reduce(
        (a: number, t: { revenue: number }) => a + t.revenue,
        0,
      );

      // ── Renewal buckets ──────────────────────────────────────────
      const renewalMap: Record<string, { count: number; revenue: number }> = {
        within7: { count: 0, revenue: 0 },
        within15: { count: 0, revenue: 0 },
        within30: { count: 0, revenue: 0 },
      };
      for (const b of renewalBuckets) {
        renewalMap[b._id] = { count: b.count, revenue: Math.round(b.revenue * 100) / 100 };
      }
      const totalRenewing =
        renewalMap.within7.count + renewalMap.within15.count + renewalMap.within30.count;
      const expectedRenewalRevenue =
        renewalMap.within7.revenue + renewalMap.within15.revenue + renewalMap.within30.revenue;

      // ── Invoice health ───────────────────────────────────────────
      const ih = invoiceHealth[0] ?? { paid: [], pending: [], overdue: [] };

      // ── Country revenue ──────────────────────────────────────────
      const totalCountryRevenue = countryRevenue.reduce(
        (a: number, c: { revenue: number }) => a + c.revenue,
        0,
      );

      // ── Month names ──────────────────────────────────────────────
      const MONTH_NAMES = [
        "", "Jan", "Feb", "Mar", "Apr", "May", "Jun",
        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
      ];

      return {
        overview: {
          total: totalNow,
          active: activeNow,
          expired: statusMap.expired ?? 0,
          cancelled: statusMap.cancelled ?? 0,
          suspended: statusMap.suspended ?? 0,
          mrr: currentMrr,
          arr: currentArr,
          churnRate,
          expiringSoon: totalRenewing,
          cancelledThisMonth,
          employerActive: employerTotal,
          jobSeekerActive: jobSeekerTotal,
          paidActiveCount,
        },
        kpiComparisons: {
          totalPrev,
          activePrev: prevActive,
          mrrPrev: prevMrrVal,
          churnPrev: prevChurn,
          cancelledPrev: prevCancelled,
          totalChange: pct(totalNow, totalPrev),
          activeChange: pct(activeNow, prevActive),
          mrrChange: pct(currentMrr, prevMrrVal),
          churnChange: pct(churnRate, prevChurn),
          cancelledChange: pct(cancelledThisMonth, prevCancelled),
        },
        revenueTrend: revenueTrend.map(
          (m: {
            _id: { year: number; month: number };
            newSubs: number;
            totalMrr: number;
            employerMrr: number;
            jobSeekerMrr: number;
          }) => ({
            month: MONTH_NAMES[m._id.month] || `M${m._id.month}`,
            year: m._id.year,
            monthNum: m._id.month,
            mrr: Math.round(m.totalMrr * 100) / 100,
            newSubs: m.newSubs,
            employerMrr: Math.round(m.employerMrr * 100) / 100,
            jobSeekerMrr: Math.round(m.jobSeekerMrr * 100) / 100,
          }),
        ),
        subscriptionFunnel: {
          employer: buildFunnel(funnelEmployer, employerTotal),
          jobSeeker: buildFunnel(funnelJobSeeker, jobSeekerTotal),
        },
        planDistribution: tierDistribution.map(
          (t: {
            _id: { tier: number; name: string };
            count: number;
            revenue: number;
          }) => ({
            planName: t._id.name || `Tier ${t._id.tier}`,
            tier: t._id.tier,
            revenue: Math.round(t.revenue * 100) / 100,
            percentage:
              totalRevenue > 0
                ? Math.round((t.revenue / totalRevenue) * 1000) / 10
                : 0,
            count: t.count,
          }),
        ),
        topCustomers: topCustomers.map(
          (c: {
            _id: unknown;
            user?: { name?: string; email?: string };
            planName: string;
            tier: number;
            mrr: number;
            since: Date;
          }) => ({
            userId: String(c._id),
            name: c.user?.name ?? "Unknown",
            email: c.user?.email ?? "",
            planName: c.planName,
            tier: c.tier,
            mrr: Math.round(c.mrr * 100) / 100,
            since: c.since?.toISOString?.() ?? "",
          }),
        ),
        topAgents: topAgents.map(
          (a: {
            _id: unknown;
            user?: { name?: string };
            subscriptionsSold: number;
            revenue: number;
          }) => ({
            agentId: String(a._id),
            name: a.user?.name ?? "Unknown",
            subscriptionsSold: a.subscriptionsSold,
            revenue: Math.round(a.revenue * 100) / 100,
          }),
        ),
        renewalForecast: {
          totalRenewing,
          expectedRevenue: Math.round(expectedRenewalRevenue * 100) / 100,
          within7: renewalMap.within7,
          within15: renewalMap.within15,
          within30: renewalMap.within30,
        },
        recentActivity: (
          recentActivity as Array<{
            _id: unknown;
            userId?: { name?: string; email?: string } | null;
            action: string;
            toPlanName?: string;
            fromPlanName?: string;
            performedBy?: { name?: string } | null;
            reason?: string;
            createdAt: Date;
          }>
        ).map((a) => ({
          id: String(a._id),
          userName: a.userId?.name ?? "User",
          userEmail: a.userId?.email ?? "",
          action: a.action,
          toPlanName: a.toPlanName ?? null,
          fromPlanName: a.fromPlanName ?? null,
          performedByName: a.performedBy?.name ?? null,
          reason: a.reason ?? null,
          createdAt: a.createdAt?.toISOString?.() ?? "",
        })),
        invoiceHealth: {
          paidCount: ih.paid[0]?.count ?? 0,
          pendingCount: ih.pending[0]?.count ?? 0,
          overdueCount: ih.overdue[0]?.count ?? 0,
          collectedRevenue: Math.round((ih.paid[0]?.total ?? 0) * 100) / 100,
        },
        revenueByCountry: countryRevenue.map(
          (c: { _id: string; subscriptions: number; revenue: number }) => ({
            country: c._id,
            subscriptions: c.subscriptions,
            revenue: Math.round(c.revenue * 100) / 100,
            percentage:
              totalCountryRevenue > 0
                ? Math.round((c.revenue / totalCountryRevenue) * 1000) / 10
                : 0,
          }),
        ),
      };
    },
  },
};

export const schema = createSchema({ typeDefs, resolvers });

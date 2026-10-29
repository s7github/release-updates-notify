import { limitsFor, tierLabel, TIER_ORDER, type TierEntitlements } from "../../services/entitlements";
import Page, { H1 } from "./Page";

const ROWS: { label: string; value: (e: TierEntitlements) => string }[] = [
  { label: "Followed items", value: (e) => (e.maxTrackedItems === null ? "Unlimited" : String(e.maxTrackedItems)) },
  { label: "Release history", value: (e) => (e.historyDays === null ? "Full history" : `${e.historyDays} days`) },
  { label: "Releases shown per product", value: (e) => String(e.timelineItems) },
  { label: "History backfill", value: (e) => (e.historyBackfill ? "Yes" : "No") },
  { label: "Export", value: (e) => (e.exportEnabled ? "CSV and JSON" : "No") },
  { label: "Source discovery per hour", value: (e) => String(e.discoveryPerHour) },
  { label: "Refreshes per hour", value: (e) => String(e.refreshPerHour) },
];

export default function Pricing() {
  return (
    <Page path="/pricing">
      <H1>Plans</H1>
      <p className="mt-4 max-w-2xl text-white/70">
        Free is free. Paid plans are not on sale yet: Pro and Enterprise are switched on by us on request, and prices are not
        published until checkout exists.
      </p>
      <div className="mt-8 overflow-x-auto">
        <table className="w-full min-w-[34rem] border-collapse text-left text-sm">
          <caption className="sr-only">What each plan includes</caption>
          <thead>
            <tr className="border-b border-white/15">
              <th scope="col" className="py-3 pr-4 font-semibold text-white/60">
                Feature
              </th>
              {TIER_ORDER.map((t) => (
                <th key={t} scope="col" className="py-3 pr-4 text-base font-bold">
                  {tierLabel(t)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => (
              <tr key={r.label} className="border-b border-white/10">
                <th scope="row" className="py-3 pr-4 font-normal text-white/70">
                  {r.label}
                </th>
                {TIER_ORDER.map((t) => (
                  <td key={t} className="py-3 pr-4">
                    {r.value(limitsFor(t))}
                  </td>
                ))}
              </tr>
            ))}
            <tr>
              <th scope="row" className="py-3 pr-4 font-normal text-white/70">
                Price
              </th>
              <td className="py-3 pr-4">Free</td>
              <td className="py-3 pr-4">Contact us</td>
              <td className="py-3 pr-4">Contact us</td>
            </tr>
          </tbody>
        </table>
      </div>
    </Page>
  );
}

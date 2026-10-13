import Card from "./Card";
import type { EqualWeightCheck, NudgeSummary } from "@/lib/reliability";
import { CONCERN_LABELS } from "@/lib/zonePlanner";

/**
 * "Is the ranking reliable?": how far the top of the ranking depends on the
 * weights, from two tests (see `lib/reliability.ts`).
 *
 * The panel reports what the tests found, including the part that does move.
 * A stability claim that hid the one locality that drops out would be worth
 * less than one that names it.
 */

const list = (names: string[]) =>
  names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

/** Filled dots for kept, hollow for lost. The count is also in words for anyone who cannot see them. */
function KeptDots({ kept, of }: { kept: number; of: number }) {
  return (
    <span className="inline-flex items-center gap-1" role="img" aria-label={`${kept} of ${of} kept`}>
      {Array.from({ length: of }, (_, i) => (
        <span
          key={i}
          className={`h-2.5 w-2.5 rounded-full border border-foreground/70 ${i < kept ? "bg-foreground/80" : "bg-transparent"}`}
        />
      ))}
    </span>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <p className="font-mono text-3xl font-semibold text-foreground">{value}</p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{label}</p>
    </div>
  );
}

export default function ReliabilityPanel({ nudges, equal }: { nudges: NudgeSummary; equal: EqualWeightCheck | null }) {
  const n = nudges.topN;
  return (
    <Card id="reliability">
      <p className="kicker">Is the ranking reliable?</p>
      <h2 className="mt-2 text-lg font-semibold text-foreground">
        {nudges.alwaysTop.length} of the top {n} stay there however the weights are nudged
      </h2>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
        The weights come from a statistical analysis, and a different reasonable method would give different ones. So
        the ranking was recomputed {nudges.runs.length} times, each time with one factor&apos;s weight moved{" "}
        {nudges.nudgePct}% up or down, to see whether the answer changes.
      </p>

      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        <Stat
          value={`${nudges.meanKept.toFixed(1)} of ${n}`}
          label={`of the top ${n} stay in the top ${n}, on average across the ${nudges.runs.length} tests`}
        />
        <Stat value={`${nudges.worstKept} of ${n}`} label="stay in the worst of the tests" />
        <Stat
          value={`${nudges.meanPairsInSameOrderPct.toFixed(0)}%`}
          label="of all pairs of localities keep their order, top of the list to bottom"
        />
      </div>

      <div className="mt-5 space-y-1.5 text-sm leading-relaxed text-foreground">
        {nudges.alwaysTop.length > 0 && (
          <p>
            <span className="font-semibold">In the top {n} in every test:</span> {list(nudges.alwaysTop)}.
          </p>
        )}
        {nudges.sometimesTop.map((item) => {
          const rivals = [...new Set(nudges.runs.filter((r) => r.left.includes(item.wardId)).flatMap((r) => r.entered))];
          return (
            <p key={item.wardId}>
              <span className="font-semibold">Depends on the weights:</span> {item.wardId}, in the top {n} in{" "}
              {item.runsKept} of {nudges.runs.length} tests
              {rivals.length > 0 ? `. In the others ${list(rivals)} ${rivals.length === 1 ? "takes" : "take"} its place.` : "."}
            </p>
          );
        })}
      </div>

      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[36rem] text-left text-sm">
          <thead>
            <tr className="text-xs text-muted-foreground">
              <th className="py-1.5 pr-4 font-medium">Factor</th>
              <th className="py-1.5 pr-4 font-medium">Its weight</th>
              <th className="py-1.5 pr-4 font-medium">Top {n} kept</th>
              <th className="py-1.5 font-medium">What changed</th>
            </tr>
          </thead>
          <tbody>
            {nudges.runs.map((run) => (
              <tr key={`${run.indicator}${run.perturbation}`} className="border-t border-border">
                <td className="py-2 pr-4 text-foreground">{CONCERN_LABELS[run.indicator] ?? run.indicator}</td>
                <td className="py-2 pr-4 font-mono text-foreground">{run.perturbation.replace("-", "−")}</td>
                <td className="py-2 pr-4">
                  <span className="flex items-center gap-2">
                    <KeptDots kept={run.kept} of={n} />
                    <span className="font-mono text-xs text-muted-foreground">
                      {run.kept}/{n}
                    </span>
                  </span>
                </td>
                <td className="py-2 text-muted-foreground">
                  {run.left.length === 0 ? "Nothing" : `${list(run.left)} out, ${list(run.entered)} in`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {equal && (
        <div className="mt-5 rounded-lg border border-border bg-background p-4 text-sm leading-relaxed text-foreground">
          <p className="font-semibold">A blunter test: every factor weighted the same</p>
          <p className="mt-1 text-muted-foreground">
            <span className="font-mono text-foreground">
              {equal.kept} of {equal.topN}
            </span>{" "}
            of the top {equal.topN} stay
            {equal.left.length > 0 ? ` (${list(equal.left)} out, ${list(equal.entered)} in)` : ""}, and{" "}
            <span className="font-mono text-foreground">
              {equal.withinThreePlaces} of {equal.total}
            </span>{" "}
            localities move three places or fewer.
            {equal.biggestMove && equal.biggestMove.from !== equal.biggestMove.to && (
              <>
                {" "}
                The biggest move is {equal.biggestMove.wardId}, from {equal.biggestMove.from} to {equal.biggestMove.to}.
              </>
            )}
          </p>
        </div>
      )}

      <p className="mt-5 border-t border-border pt-4 text-xs leading-relaxed text-muted-foreground">
        What this does and does not show. It shows how much the ranking leans on the choice of weights. It does not
        show that the ranking is right: that would take a comparison with what heat has actually done to people in each
        locality, and no open data records that. Localities near the middle of the list are closer together than those
        at the ends, so their order means less. You can run any weighting yourself in the calculator.
      </p>
    </Card>
  );
}

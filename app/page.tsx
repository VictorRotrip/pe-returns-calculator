"use client";

import { useState, useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Cell, PieChart, Pie,
} from "recharts";

// ── Types ───────────────────────────────────────────────────────────────────

interface FundParams {
  investmentYears: number; fundLife: number; fundCostsPA: number;
  mgmtFeePA: number; hurdleRate: number; perfFeeRate: number;
  hasCatchup: boolean; hasFoF: boolean; fofMgmtFeePA: number;
  fofPerfFeeRate: number; fofHasCatchup: boolean; taxRate: number;
}

interface DealParams {
  entryMultiple: number; exitMultiple: number; leverage: number;
  holdingPeriod: number; ebitdaGrowth: number;
}

interface WaterfallResult {
  grossIRR: number; effectiveFundCost: number; irrAfterFundCosts: number;
  effectiveMgmtFee: number; irrAfterMgmt: number; perfFee: number;
  irrAfterPerf: number; fofMgmtFee: number; irrAfterFofMgmt: number;
  fofPerfFee: number; irrBeforeTax: number; tax: number;
  netIRR: number; moneyMultiple: number;
}

// ── Calculations ────────────────────────────────────────────────────────────

function calcPerformanceFee(irr: number, hurdle: number, feeRate: number, catchup: boolean): number {
  if (irr <= hurdle) return 0;
  if (!catchup) return feeRate * (irr - hurdle);
  const t = hurdle / (1 - feeRate);
  if (irr <= t) return irr - hurdle;
  return feeRate * irr;
}

function calcMgmtFeeTotal(rate: number, invYears: number, fundLife: number): number {
  const committed = Math.pow(1 + rate, invYears) - 1;
  const dp = fundLife - invYears;
  let invested = 1;
  for (let k = 1; k <= dp; k++) invested *= 1 + rate * (1 - k / dp);
  invested -= 1;
  return (1 + committed) * (1 + invested) - 1;
}

function calculateWaterfall(grossIRR: number, p: FundParams): WaterfallResult {
  const effectiveFundCost = Math.pow(1 + p.fundCostsPA, p.fundLife / p.investmentYears) - 1;
  const irrAfterFundCosts = grossIRR - effectiveFundCost;
  const effectiveMgmtFee = Math.pow(1 + calcMgmtFeeTotal(p.mgmtFeePA, p.investmentYears, p.fundLife), 1 / p.investmentYears) - 1;
  const irrAfterMgmt = irrAfterFundCosts - effectiveMgmtFee;
  const perfFee = calcPerformanceFee(irrAfterMgmt, p.hurdleRate, p.perfFeeRate, p.hasCatchup);
  const irrAfterPerf = irrAfterMgmt - perfFee;
  let fofMgmtFee = 0, irrAfterFofMgmt = irrAfterPerf, fofPerfFee = 0;
  if (p.hasFoF) {
    fofMgmtFee = Math.pow(1 + calcMgmtFeeTotal(p.fofMgmtFeePA, p.investmentYears, p.fundLife), 1 / p.investmentYears) - 1;
    irrAfterFofMgmt = irrAfterPerf - fofMgmtFee;
    fofPerfFee = calcPerformanceFee(irrAfterFofMgmt, p.hurdleRate, p.fofPerfFeeRate, p.fofHasCatchup);
  }
  const irrBeforeTax = irrAfterFofMgmt - fofPerfFee;
  const tax = p.taxRate * irrBeforeTax;
  const netIRR = irrBeforeTax - tax;
  const moneyMultiple = Math.pow(1 + netIRR, p.investmentYears);
  return { grossIRR, effectiveFundCost, irrAfterFundCosts, effectiveMgmtFee, irrAfterMgmt, perfFee, irrAfterPerf, fofMgmtFee, irrAfterFofMgmt, fofPerfFee, irrBeforeTax, tax, netIRR, moneyMultiple };
}

function calcGrossIRR(d: DealParams): number {
  // Entry equity = EV * (1 - leverage)
  // Exit EV = entry EBITDA * (1+g)^h * exitMultiple
  // Exit equity = Exit EV - Debt = Exit EV - entry EV * leverage
  // Equity MoM = exit equity / entry equity
  const entryEV = 1; // normalize
  const entryEquity = entryEV * (1 - d.leverage);
  if (entryEquity <= 0) return 0;
  const exitEV = (entryEV / d.entryMultiple) * Math.pow(1 + d.ebitdaGrowth, d.holdingPeriod) * d.exitMultiple;
  const debt = entryEV * d.leverage;
  const exitEquity = exitEV - debt;
  if (exitEquity <= 0) return -1;
  const equityMoM = exitEquity / entryEquity;
  return Math.pow(equityMoM, 1 / d.holdingPeriod) - 1;
}

// ── Formatting ──────────────────────────────────────────────────────────────

const pct = (v: number) => (v * 100).toFixed(2) + "%";
const pct1 = (v: number) => (v * 100).toFixed(1) + "%";
const pct0 = (v: number) => (v * 100).toFixed(0) + "%";
const fm = (v: number) => v.toFixed(2) + "x";

// ── Reusable components ─────────────────────────────────────────────────────

function Slider({ label, hint, value, onChange, min, max, step, format }: {
  label: string; hint?: string; value: number; onChange: (v: number) => void;
  min: number; max: number; step: number; format: (v: number) => string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <label className="text-sm font-medium text-gray-700">{label}</label>
        <span className="text-sm font-semibold text-gray-900 tabular-nums">{format(value)}</span>
      </div>
      {hint && <p className="text-xs text-gray-400">{hint}</p>}
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 bg-gray-200 rounded-full appearance-none cursor-pointer accent-blue-600" />
      <div className="flex justify-between text-[10px] text-gray-400">
        <span>{format(min)}</span><span>{format(max)}</span>
      </div>
    </div>
  );
}

function Toggle({ label, hint, checked, onChange }: {
  label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 cursor-pointer group" onClick={() => onChange(!checked)}>
      <div>
        <span className="text-sm font-medium text-gray-700 group-hover:text-gray-900">{label}</span>
        {hint && <p className="text-xs text-gray-400">{hint}</p>}
      </div>
      <div className={`relative w-9 h-5 rounded-full transition-colors ${checked ? "bg-blue-600" : "bg-gray-300"}`}>
        <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${checked ? "translate-x-4" : "translate-x-0.5"}`} />
      </div>
    </div>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-white rounded-xl shadow-sm border border-gray-200 ${className}`}>{children}</div>;
}

// ── Icons ────────────────────────────────────────────────────────────────────

const IconCompany = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z" />
  </svg>
);
const IconInvestor = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
  </svg>
);
const IconArrow = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
  </svg>
);

// ── Charts ───────────────────────────────────────────────────────────────────

const COLORS = {
  net: "#2563eb", fundExp: "#f97316", mgmt: "#ef4444",
  carry: "#8b5cf6", fofMgmt: "#ec4899", fofCarry: "#f43f5e", tax: "#6b7280",
};

function StackedChart({ results, labels, hasFoF }: {
  results: WaterfallResult[]; labels: string[]; hasFoF: boolean;
}) {
  const data = results.map((r, i) => ({
    name: labels[i],
    "Net IRR": +(r.netIRR * 100).toFixed(2),
    "Tax": +(r.tax * 100).toFixed(2),
    ...(hasFoF ? { "FoF Carry": +(r.fofPerfFee * 100).toFixed(2), "FoF Mgmt": +(r.fofMgmtFee * 100).toFixed(2) } : {}),
    "Carry": +(r.perfFee * 100).toFixed(2),
    "Mgmt Fee": +(r.effectiveMgmtFee * 100).toFixed(2),
    "Fund Exp.": +(r.effectiveFundCost * 100).toFixed(2),
  }));
  const keys = ["Net IRR", "Tax", ...(hasFoF ? ["FoF Carry", "FoF Mgmt"] : []), "Carry", "Mgmt Fee", "Fund Exp."];
  const colors = [COLORS.net, COLORS.tax, ...(hasFoF ? [COLORS.fofCarry, COLORS.fofMgmt] : []), COLORS.carry, COLORS.mgmt, COLORS.fundExp];
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => v + "%"} />
        <Tooltip formatter={(value: number) => value.toFixed(2) + "%"} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {keys.map((k, i) => <Bar key={k} dataKey={k} stackId="a" fill={colors[i]} radius={i === keys.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} />)}
      </BarChart>
    </ResponsiveContainer>
  );
}

function FeePie({ result, hasFoF }: { result: WaterfallResult; hasFoF: boolean }) {
  const drag = result.grossIRR - result.netIRR;
  if (drag <= 0) return null;
  const slices = [
    { name: "Fund Exp.", value: +(result.effectiveFundCost / drag * 100).toFixed(1), color: COLORS.fundExp },
    { name: "Mgmt Fee", value: +(result.effectiveMgmtFee / drag * 100).toFixed(1), color: COLORS.mgmt },
    { name: "Carry", value: +(result.perfFee / drag * 100).toFixed(1), color: COLORS.carry },
    ...(hasFoF ? [
      { name: "FoF Mgmt", value: +(result.fofMgmtFee / drag * 100).toFixed(1), color: COLORS.fofMgmt },
      { name: "FoF Carry", value: +(result.fofPerfFee / drag * 100).toFixed(1), color: COLORS.fofCarry },
    ] : []),
    { name: "Tax", value: +(result.tax / drag * 100).toFixed(1), color: COLORS.tax },
  ].filter(s => s.value > 0);
  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie data={slices} cx="50%" cy="50%" innerRadius={50} outerRadius={82}
          paddingAngle={2} dataKey="value" label={({ name, value }) => `${name} ${value}%`}
          labelLine={{ strokeWidth: 1 }} style={{ fontSize: 10 }}>
          {slices.map((s, i) => <Cell key={i} fill={s.color} />)}
        </Pie>
        <Tooltip formatter={(value: number) => value.toFixed(1) + "%"} />
      </PieChart>
    </ResponsiveContainer>
  );
}

// ── Sensitivity Matrix ───────────────────────────────────────────────────────

function SensitivityMatrix({ deal, fundParams, mode }: {
  deal: DealParams; fundParams: FundParams; mode: "gross" | "net";
}) {
  const growthSteps = [-0.05, 0, 0.05, 0.10, 0.15, 0.20, 0.25];
  const multipleSteps = [
    deal.entryMultiple - 4,
    deal.entryMultiple - 2,
    deal.entryMultiple,
    deal.entryMultiple + 2,
    deal.entryMultiple + 4,
  ].filter(m => m > 0);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr>
            <th className="py-2 px-2 text-left text-gray-400 font-medium">
              <div className="text-[10px] uppercase tracking-wider">EBITDA growth &darr;</div>
              <div className="text-[10px] uppercase tracking-wider">Exit multiple &rarr;</div>
            </th>
            {multipleSteps.map((em) => (
              <th key={em} className={`py-2 px-2 text-center font-semibold ${
                em === deal.exitMultiple ? "text-blue-600" : "text-gray-500"
              }`}>
                {em.toFixed(1)}x
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {growthSteps.map((g) => (
            <tr key={g} className="border-t border-gray-100">
              <td className={`py-2 px-2 font-semibold ${
                Math.abs(g - deal.ebitdaGrowth) < 0.001 ? "text-blue-600" : "text-gray-500"
              }`}>
                {(g * 100).toFixed(0)}%
              </td>
              {multipleSteps.map((em) => {
                const d = { ...deal, ebitdaGrowth: g, exitMultiple: em };
                const grossIRR = calcGrossIRR(d);
                let displayVal: number;
                if (mode === "net") {
                  const w = calculateWaterfall(Math.max(grossIRR, 0), fundParams);
                  displayVal = w.netIRR;
                } else {
                  displayVal = grossIRR;
                }
                const isCurrentCell = Math.abs(g - deal.ebitdaGrowth) < 0.001 && em === deal.exitMultiple;
                const bg = displayVal < 0 ? "bg-red-100 text-red-700"
                  : displayVal < 0.08 ? "bg-orange-50 text-orange-700"
                  : displayVal < 0.15 ? "bg-yellow-50 text-yellow-800"
                  : displayVal < 0.25 ? "bg-green-50 text-green-700"
                  : "bg-emerald-100 text-emerald-800";

                return (
                  <td key={em} className={`py-2 px-2 text-center tabular-nums font-medium ${bg} ${
                    isCurrentCell ? "ring-2 ring-blue-500 ring-inset rounded" : ""
                  }`}>
                    {grossIRR <= -1 ? "Loss" : pct1(displayVal)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Methodology ──────────────────────────────────────────────────────────────

function Methodology({ params }: { params: FundParams }) {
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <button className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-gray-50 transition-colors" onClick={() => setOpen(!open)}>
        <div>
          <h2 className="text-sm font-semibold text-gray-900">How are these calculated?</h2>
          <p className="text-xs text-gray-400 mt-0.5">Click to {open ? "hide" : "view"} methodology and formulas</p>
        </div>
        <svg className={`w-5 h-5 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="px-5 pb-5 space-y-6 text-sm text-gray-600 border-t border-gray-100 pt-4">
          <div>
            <h3 className="font-semibold text-gray-800 mb-2">Deal → Gross IRR</h3>
            <div className="bg-gray-50 rounded-lg p-3 font-mono text-xs space-y-1">
              <div>Entry Equity = Entry EV &times; (1 − Leverage%)</div>
              <div>Exit EV = (Entry EV / Entry Multiple) &times; (1 + EBITDA Growth)^Hold &times; Exit Multiple</div>
              <div>Exit Equity = Exit EV − Debt</div>
              <div>Gross IRR = (Exit Equity / Entry Equity)^(1/Hold) − 1</div>
            </div>
            <p className="mt-2 text-xs text-gray-400">Assumes no interim cash flows or debt paydown during the hold period.</p>
          </div>
          <div>
            <h3 className="font-semibold text-gray-800 mb-2">Fund Expenses ({pct1(params.fundCostsPA)} p.a.)</h3>
            <p className="mb-2">Charged over the full {params.fundLife}-year fund life, but compressed to the {params.investmentYears}-year investment period:</p>
            <div className="bg-gray-50 rounded-lg p-3 font-mono text-xs">
              Effective = (1 + {pct1(params.fundCostsPA)})^({params.fundLife}/{params.investmentYears}) − 1 = {pct(Math.pow(1 + params.fundCostsPA, params.fundLife / params.investmentYears) - 1)}
            </div>
          </div>
          <div>
            <h3 className="font-semibold text-gray-800 mb-2">Management Fee ({pct1(params.mgmtFeePA)} p.a.)</h3>
            <p className="mb-2">{pct1(params.mgmtFeePA)} on committed capital years 1–{params.investmentYears}, then linearly declining as companies are exited.</p>
            <div className="bg-gray-50 rounded-lg p-3 font-mono text-xs space-y-1">
              <div>Committed: (1 + {pct1(params.mgmtFeePA)})^{params.investmentYears} − 1</div>
              <div>Decline: fee &times; (1 − k/{params.fundLife - params.investmentYears}) for each remaining year</div>
              <div>Effective annual: {pct(Math.pow(1 + calcMgmtFeeTotal(params.mgmtFeePA, params.investmentYears, params.fundLife), 1 / params.investmentYears) - 1)}</div>
            </div>
            <p className="mt-2 text-xs text-gray-400">
              The effective rate is higher than {pct1(params.mgmtFeePA)} because fees are charged over {params.fundLife} years but capital is only working for {params.investmentYears}.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-gray-800 mb-2">Carried Interest ({pct0(params.perfFeeRate)} with {pct0(params.hurdleRate)} hurdle{params.hasCatchup ? " + catchup" : ""})</h3>
            {params.hasCatchup ? (
              <div className="bg-gray-50 rounded-lg p-3 text-xs space-y-1.5">
                <div><strong>IRR &le; {pct0(params.hurdleRate)}:</strong> No carry — 100% to LP</div>
                <div><strong>{pct0(params.hurdleRate)} &lt; IRR &le; {pct1(params.hurdleRate / (1 - params.perfFeeRate))}:</strong> Catchup zone — 100% to GP until GP has {pct0(params.perfFeeRate)} of total</div>
                <div><strong>IRR &gt; {pct1(params.hurdleRate / (1 - params.perfFeeRate))}:</strong> {pct0(params.perfFeeRate)} of total IRR after costs</div>
              </div>
            ) : (
              <div className="bg-gray-50 rounded-lg p-3 text-xs space-y-1.5">
                <div><strong>IRR &le; {pct0(params.hurdleRate)}:</strong> No carry</div>
                <div><strong>IRR &gt; {pct0(params.hurdleRate)}:</strong> {pct0(params.perfFeeRate)} &times; (IRR − {pct0(params.hurdleRate)})</div>
              </div>
            )}
          </div>
          {params.hasFoF && (
            <div>
              <h3 className="font-semibold text-gray-800 mb-2">Fund of Fund Fees</h3>
              <p>Same structure as fund-level fees at FoF rates ({pct1(params.fofMgmtFeePA)} mgmt, {pct0(params.fofPerfFeeRate)} carry). Applied after the underlying fund&apos;s fees.</p>
            </div>
          )}
          <div>
            <h3 className="font-semibold text-gray-800 mb-2">Corporate Tax & Money Multiple</h3>
            <p>{pct0(params.taxRate)} flat rate on pre-tax IRR. Money Multiple = (1 + net IRR)^{params.investmentYears}.</p>
          </div>
        </div>
      )}
    </Card>
  );
}

// ── Section type ─────────────────────────────────────────────────────────────

type Section = "deal" | "investor";

// ── Main component ──────────────────────────────────────────────────────────

export default function PEReturnsCalculator() {
  const [fundParams, setFundParams] = useState<FundParams>({
    investmentYears: 5, fundLife: 10, fundCostsPA: 0.005, mgmtFeePA: 0.02,
    hurdleRate: 0.08, perfFeeRate: 0.2, hasCatchup: true, hasFoF: true,
    fofMgmtFeePA: 0.007, fofPerfFeeRate: 0.05, fofHasCatchup: true, taxRate: 0.2,
  });
  const [deal, setDeal] = useState<DealParams>({
    entryMultiple: 10, exitMultiple: 10, leverage: 0.5, holdingPeriod: 5, ebitdaGrowth: 0.10,
  });
  const [section, setSection] = useState<Section>("deal");
  const [netMatrix, setNetMatrix] = useState(false);

  const fp = <K extends keyof FundParams>(k: K, v: FundParams[K]) => setFundParams((p) => ({ ...p, [k]: v }));
  const dp = <K extends keyof DealParams>(k: K, v: DealParams[K]) => setDeal((p) => ({ ...p, [k]: v }));

  // Computed gross IRR from deal
  const grossIRR = useMemo(() => calcGrossIRR(deal), [deal]);

  // Waterfall from that gross IRR
  const waterfall = useMemo(() => calculateWaterfall(Math.max(grossIRR, 0), fundParams), [grossIRR, fundParams]);

  // Multiple scenario gross IRRs for waterfall comparison
  const scenarioGrowths = [0.05, 0.10, 0.15, 0.20];
  const scenarioResults = useMemo(() =>
    scenarioGrowths.map((g) => {
      const d = { ...deal, ebitdaGrowth: g };
      const irr = calcGrossIRR(d);
      return calculateWaterfall(Math.max(irr, 0), fundParams);
    }),
    [deal, fundParams]
  );
  const scenarioLabels = scenarioGrowths.map((g) => `${(g * 100).toFixed(0)}% growth`);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-900">PE Returns Calculator</h1>
              <p className="text-xs text-gray-400 mt-0.5">From deal performance to LP net returns</p>
            </div>
          </div>

          {/* Two-section nav with flow arrow */}
          <div className="mt-4 flex items-center gap-0">
            <button onClick={() => setSection("deal")}
              className={`flex items-center gap-2.5 px-5 py-3 rounded-xl border transition-all ${
                section === "deal"
                  ? "bg-emerald-50 border-emerald-200 ring-2 ring-emerald-100 shadow-sm"
                  : "bg-white border-gray-200 hover:border-gray-300"
              }`}>
              <div className={section === "deal" ? "text-emerald-600" : "text-gray-400"}><IconCompany /></div>
              <div className="text-left">
                <div className={`text-sm font-semibold ${section === "deal" ? "text-emerald-700" : "text-gray-700"}`}>
                  Build a Deal
                </div>
                <div className="text-[11px] text-gray-400">Company performance → Gross IRR</div>
              </div>
            </button>

            <div className="px-3 text-gray-300"><IconArrow /></div>

            <button onClick={() => setSection("investor")}
              className={`flex items-center gap-2.5 px-5 py-3 rounded-xl border transition-all ${
                section === "investor"
                  ? "bg-violet-50 border-violet-200 ring-2 ring-violet-100 shadow-sm"
                  : "bg-white border-gray-200 hover:border-gray-300"
              }`}>
              <div className={section === "investor" ? "text-violet-600" : "text-gray-400"}><IconInvestor /></div>
              <div className="text-left">
                <div className={`text-sm font-semibold ${section === "investor" ? "text-violet-700" : "text-gray-700"}`}>
                  LP Returns
                </div>
                <div className="text-[11px] text-gray-400">Gross IRR → fees & tax → Net IRR</div>
              </div>
            </button>

            {/* Live gross IRR badge */}
            <div className="ml-auto hidden sm:flex items-center gap-4">
              <div className="text-right">
                <div className="text-[10px] text-gray-400 uppercase tracking-wider">Gross IRR</div>
                <div className={`text-lg font-bold tabular-nums ${grossIRR < 0 ? "text-red-600" : "text-emerald-600"}`}>
                  {grossIRR <= -1 ? "Total loss" : pct1(grossIRR)}
                </div>
              </div>
              <div className="text-gray-200">→</div>
              <div className="text-right">
                <div className="text-[10px] text-gray-400 uppercase tracking-wider">Net IRR</div>
                <div className={`text-lg font-bold tabular-nums ${waterfall.netIRR < 0 ? "text-red-600" : "text-violet-600"}`}>
                  {pct1(waterfall.netIRR)}
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">

          {/* ── Sidebar ──────────────────────────────────────────── */}
          <aside className="space-y-5">
            {section === "deal" && (
              <>
                <Card className="p-5 border-emerald-200">
                  <h2 className="text-xs font-semibold text-emerald-600 uppercase tracking-wider mb-1">The Deal</h2>
                  <p className="text-[11px] text-gray-400 mb-4">Define how the PE fund buys a company</p>
                  <div className="space-y-4">
                    <Slider label="Entry EV/EBITDA" hint="What the fund pays relative to earnings" value={deal.entryMultiple}
                      onChange={(v) => dp("entryMultiple", v)} min={4} max={20} step={0.5} format={(v) => v.toFixed(1) + "x"} />
                    <Slider label="Leverage" hint="How much debt is used to finance the purchase" value={deal.leverage}
                      onChange={(v) => dp("leverage", v)} min={0} max={0.8} step={0.05} format={pct0} />
                    <Slider label="Holding period" hint="How long the fund owns the company" value={deal.holdingPeriod}
                      onChange={(v) => dp("holdingPeriod", v)} min={2} max={10} step={1} format={(v) => v + " yr"} />
                  </div>
                </Card>

                <Card className="p-5 border-emerald-200">
                  <h2 className="text-xs font-semibold text-emerald-600 uppercase tracking-wider mb-1">Company Performance</h2>
                  <p className="text-[11px] text-gray-400 mb-4">What happens during the hold period</p>
                  <div className="space-y-4">
                    <Slider label="EBITDA growth p.a." hint="How fast the company grows its profits" value={deal.ebitdaGrowth}
                      onChange={(v) => dp("ebitdaGrowth", v)} min={-0.1} max={0.3} step={0.01} format={(v) => pct0(v)} />
                    <Slider label="Exit EV/EBITDA" hint="What the company sells for at exit" value={deal.exitMultiple}
                      onChange={(v) => dp("exitMultiple", v)} min={4} max={20} step={0.5} format={(v) => v.toFixed(1) + "x"} />
                  </div>
                  {deal.exitMultiple !== deal.entryMultiple && (
                    <div className={`mt-3 px-3 py-2 rounded-lg text-xs ${
                      deal.exitMultiple > deal.entryMultiple
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-amber-50 text-amber-700"
                    }`}>
                      {deal.exitMultiple > deal.entryMultiple ? "Multiple expansion" : "Multiple compression"}:
                      {" "}{deal.entryMultiple.toFixed(1)}x → {deal.exitMultiple.toFixed(1)}x
                      ({deal.exitMultiple > deal.entryMultiple ? "+" : ""}{((deal.exitMultiple / deal.entryMultiple - 1) * 100).toFixed(0)}%)
                    </div>
                  )}
                </Card>
              </>
            )}

            {section === "investor" && (
              <>
                <Card className="p-5 border-violet-200">
                  <h2 className="text-xs font-semibold text-violet-600 uppercase tracking-wider mb-1">Fund Fees</h2>
                  <p className="text-[11px] text-gray-400 mb-4">Costs the GP charges to run the fund</p>
                  <div className="space-y-4">
                    <Slider label="Investment period" hint="Years actively deploying capital" value={fundParams.investmentYears}
                      onChange={(v) => fp("investmentYears", v)} min={1} max={10} step={1} format={(v) => v + " yr"} />
                    <Slider label="Fund life" hint="Total fund duration including exits" value={fundParams.fundLife}
                      onChange={(v) => fp("fundLife", v)} min={5} max={15} step={1} format={(v) => v + " yr"} />
                    <Slider label="Fund expenses p.a." hint="Legal, admin, reporting costs" value={fundParams.fundCostsPA}
                      onChange={(v) => fp("fundCostsPA", v)} min={0} max={0.02} step={0.001} format={pct1} />
                    <Slider label="Management fee p.a." hint="On committed capital, declining after investment period" value={fundParams.mgmtFeePA}
                      onChange={(v) => fp("mgmtFeePA", v)} min={0} max={0.04} step={0.001} format={pct1} />
                  </div>
                </Card>

                <Card className="p-5 border-violet-200">
                  <h2 className="text-xs font-semibold text-violet-600 uppercase tracking-wider mb-1">Carry & Hurdle</h2>
                  <p className="text-[11px] text-gray-400 mb-4">GP&apos;s profit share above the preferred return</p>
                  <div className="space-y-4">
                    <Slider label="Hurdle rate" hint="LP preferred return before GP earns carry" value={fundParams.hurdleRate}
                      onChange={(v) => fp("hurdleRate", v)} min={0} max={0.15} step={0.01} format={pct0} />
                    <Slider label="Carried interest" value={fundParams.perfFeeRate}
                      onChange={(v) => fp("perfFeeRate", v)} min={0} max={0.3} step={0.01} format={pct0} />
                    <Toggle label="GP catchup" hint="GP gets 100% in catchup zone" checked={fundParams.hasCatchup} onChange={(v) => fp("hasCatchup", v)} />
                  </div>
                </Card>

                <Card className="p-5 border-violet-200">
                  <Toggle label="Fund of Fund layer" hint="Extra fee layer for FoF investors" checked={fundParams.hasFoF} onChange={(v) => fp("hasFoF", v)} />
                  {fundParams.hasFoF && (
                    <div className="space-y-4 pt-3 mt-3 border-t border-gray-100">
                      <Slider label="FoF management fee" value={fundParams.fofMgmtFeePA} onChange={(v) => fp("fofMgmtFeePA", v)}
                        min={0} max={0.02} step={0.001} format={pct1} />
                      <Slider label="FoF carry" value={fundParams.fofPerfFeeRate} onChange={(v) => fp("fofPerfFeeRate", v)}
                        min={0} max={0.15} step={0.01} format={pct0} />
                      <Toggle label="FoF catchup" checked={fundParams.fofHasCatchup} onChange={(v) => fp("fofHasCatchup", v)} />
                    </div>
                  )}
                </Card>

                <Card className="p-5 border-violet-200">
                  <Slider label="Corporate tax rate" value={fundParams.taxRate} onChange={(v) => fp("taxRate", v)}
                    min={0} max={0.4} step={0.01} format={pct0} />
                </Card>
              </>
            )}
          </aside>

          {/* ── Main content ──────────────────────────────────────── */}
          <main className="space-y-6">

            {/* ═══ DEAL SECTION ═══════════════════════════════════ */}
            {section === "deal" && (
              <>
                {/* Hero result */}
                <div className="bg-emerald-600 rounded-xl p-6 text-white shadow-lg shadow-emerald-200">
                  <div className="flex items-center gap-2 text-emerald-200 text-xs uppercase tracking-wider mb-4">
                    <IconCompany /> Deal Result
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                    <div>
                      <div className={`text-3xl font-bold ${grossIRR < 0 ? "text-red-200" : ""}`}>
                        {grossIRR <= -1 ? "Loss" : pct1(grossIRR)}
                      </div>
                      <div className="text-xs text-emerald-200 mt-1">Gross IRR</div>
                    </div>
                    <div>
                      <div className="text-3xl font-bold">
                        {fm(Math.max(0, Math.pow(1 + grossIRR, deal.holdingPeriod)))}
                      </div>
                      <div className="text-xs text-emerald-200 mt-1">Equity Multiple</div>
                    </div>
                    <div>
                      <div className="text-3xl font-bold text-emerald-100">
                        {pct1(waterfall.netIRR)}
                      </div>
                      <div className="text-xs text-emerald-200 mt-1">Net IRR (after fees & tax)</div>
                    </div>
                    <div>
                      <div className="text-3xl font-bold text-emerald-100">
                        {fm(waterfall.moneyMultiple)}
                      </div>
                      <div className="text-xs text-emerald-200 mt-1">Net Money Multiple</div>
                    </div>
                  </div>
                  <div className="mt-4 pt-4 border-t border-emerald-500 text-sm text-emerald-100">
                    Buy at {deal.entryMultiple.toFixed(1)}x with {pct0(deal.leverage)} debt
                    → grow EBITDA {pct0(deal.ebitdaGrowth)}/yr for {deal.holdingPeriod} years
                    → sell at {deal.exitMultiple.toFixed(1)}x
                    {deal.exitMultiple !== deal.entryMultiple && (
                      <span className="ml-1">
                        ({deal.exitMultiple > deal.entryMultiple ? "+" : ""}{((deal.exitMultiple / deal.entryMultiple - 1) * 100).toFixed(0)}% multiple {deal.exitMultiple > deal.entryMultiple ? "expansion" : "compression"})
                      </span>
                    )}
                  </div>
                </div>

                {/* Return attribution */}
                <Card className="p-5">
                  <h2 className="text-sm font-semibold text-gray-900 mb-3">Where does the return come from?</h2>
                  <div className="grid grid-cols-3 gap-4">
                    {(() => {
                      // Decompose return: EBITDA growth, multiple change, leverage effect
                      const ebitdaEffect = Math.pow(1 + deal.ebitdaGrowth, deal.holdingPeriod);
                      const multipleEffect = deal.exitMultiple / deal.entryMultiple;
                      const evGrowth = ebitdaEffect * multipleEffect;
                      const unleveredMoM = evGrowth;
                      const leveredMoM = deal.leverage > 0 ? (evGrowth - deal.leverage) / (1 - deal.leverage) : evGrowth;
                      return (
                        <>
                          <div className="text-center p-4 bg-emerald-50 rounded-lg">
                            <div className="text-2xl font-bold text-emerald-700">{fm(ebitdaEffect)}</div>
                            <div className="text-xs text-gray-500 mt-1">EBITDA Growth</div>
                            <div className="text-[10px] text-gray-400">{pct0(deal.ebitdaGrowth)} p.a. for {deal.holdingPeriod}yr</div>
                          </div>
                          <div className="text-center p-4 bg-blue-50 rounded-lg">
                            <div className={`text-2xl font-bold ${multipleEffect >= 1 ? "text-blue-700" : "text-amber-700"}`}>{fm(multipleEffect)}</div>
                            <div className="text-xs text-gray-500 mt-1">Multiple Change</div>
                            <div className="text-[10px] text-gray-400">{deal.entryMultiple.toFixed(1)}x → {deal.exitMultiple.toFixed(1)}x</div>
                          </div>
                          <div className="text-center p-4 bg-violet-50 rounded-lg">
                            <div className="text-2xl font-bold text-violet-700">{fm(leveredMoM > 0 ? leveredMoM / unleveredMoM : 0)}</div>
                            <div className="text-xs text-gray-500 mt-1">Leverage Effect</div>
                            <div className="text-[10px] text-gray-400">{pct0(deal.leverage)} LTV</div>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </Card>

                {/* Sensitivity matrices */}
                <Card>
                  <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                    <div>
                      <h2 className="text-sm font-semibold text-gray-900">Sensitivity Matrix</h2>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {netMatrix ? "Net IRR to LP" : "Gross IRR"} for different EBITDA growth rates and exit multiples.
                        Your current deal is highlighted.
                      </p>
                    </div>
                    <div className="flex bg-gray-100 rounded-lg p-0.5 text-xs">
                      <button onClick={() => setNetMatrix(false)}
                        className={`px-3 py-1 rounded-md font-medium transition-colors ${!netMatrix ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}>
                        Gross IRR
                      </button>
                      <button onClick={() => setNetMatrix(true)}
                        className={`px-3 py-1 rounded-md font-medium transition-colors ${netMatrix ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}>
                        Net IRR
                      </button>
                    </div>
                  </div>
                  <div className="p-5">
                    <SensitivityMatrix deal={deal} fundParams={fundParams} mode={netMatrix ? "net" : "gross"} />
                  </div>
                  <div className="px-5 pb-4 flex gap-3 text-[10px]">
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-100"></span>Negative</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-orange-50 border border-orange-200"></span>&lt;8%</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-yellow-50 border border-yellow-200"></span>8–15%</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-50 border border-green-200"></span>15–25%</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-100"></span>&gt;25%</span>
                  </div>
                </Card>

                <Card className="p-5">
                  <p className="text-sm text-gray-500 leading-relaxed">
                    This is the return the <strong>fund</strong> earns on the deal. But as an investor (LP), you don&apos;t receive
                    this — fund expenses, management fees, carried interest{fundParams.hasFoF ? ", fund-of-fund fees" : ""}, and taxes all take a cut.
                    {" "}<button onClick={() => setSection("investor")} className="text-violet-600 font-medium hover:underline">See what the LP actually receives →</button>
                  </p>
                </Card>
              </>
            )}

            {/* ═══ INVESTOR SECTION ══════════════════════════════ */}
            {section === "investor" && (
              <>
                {/* Context banner */}
                <div className="bg-violet-600 rounded-xl p-5 text-white shadow-lg shadow-violet-200">
                  <div className="flex items-center gap-2 text-violet-200 text-xs uppercase tracking-wider mb-3">
                    <IconInvestor /> LP (Investor) Perspective
                  </div>
                  <p className="text-sm text-violet-100 leading-relaxed">
                    The fund earns <strong>{pct1(grossIRR)} gross IRR</strong> on its deals.
                    But as an LP, multiple fee layers sit between the fund&apos;s performance and your actual return.
                    Below is exactly where your return goes.
                  </p>
                  <div className="grid grid-cols-4 gap-4 mt-4 pt-4 border-t border-violet-500">
                    <div><div className="text-2xl font-bold">{pct1(grossIRR)}</div><div className="text-xs text-violet-200">Gross IRR</div></div>
                    <div><div className="text-2xl font-bold">{pct1(waterfall.netIRR)}</div><div className="text-xs text-violet-200">Net IRR</div></div>
                    <div><div className="text-2xl font-bold">{fm(waterfall.moneyMultiple)}</div><div className="text-xs text-violet-200">Net MoM</div></div>
                    <div><div className="text-2xl font-bold text-violet-300">{pct1(grossIRR - waterfall.netIRR)}</div><div className="text-xs text-violet-200">Total drag</div></div>
                  </div>
                </div>

                {/* Charts */}
                <Card className="p-5">
                  <h2 className="text-sm font-semibold text-gray-900 mb-1">IRR Composition at Different Growth Rates</h2>
                  <p className="text-xs text-gray-400 mb-4">Net return (blue) + each fee/tax layer = gross IRR. Same deal structure, varying company growth.</p>
                  <StackedChart results={scenarioResults} labels={scenarioLabels} hasFoF={fundParams.hasFoF} />
                </Card>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <Card className="p-5">
                    <h2 className="text-sm font-semibold text-gray-900 mb-1">Fee Drag Breakdown</h2>
                    <p className="text-xs text-gray-400 mb-2">Current deal: {pct(waterfall.grossIRR - waterfall.netIRR)} total drag</p>
                    <FeePie result={waterfall} hasFoF={fundParams.hasFoF} />
                  </Card>
                  <Card className="p-5">
                    <h2 className="text-sm font-semibold text-gray-900 mb-3">Fee Impact Summary</h2>
                    <div className="space-y-3">
                      {[
                        { label: "Fund expenses", value: waterfall.effectiveFundCost, color: "bg-orange-500" },
                        { label: "Management fee", value: waterfall.effectiveMgmtFee, color: "bg-red-500" },
                        { label: "Carried interest", value: waterfall.perfFee, color: "bg-violet-500" },
                        ...(fundParams.hasFoF ? [
                          { label: "FoF management fee", value: waterfall.fofMgmtFee, color: "bg-pink-500" },
                          { label: "FoF carry", value: waterfall.fofPerfFee, color: "bg-rose-500" },
                        ] : []),
                        { label: "Corporate tax", value: waterfall.tax, color: "bg-gray-500" },
                      ].map((item, i) => (
                        <div key={i} className="flex items-center gap-3">
                          <div className={`w-2 h-2 rounded-full ${item.color}`} />
                          <div className="flex-1 text-sm text-gray-600">{item.label}</div>
                          <div className="text-sm font-semibold tabular-nums text-gray-900">−{pct(item.value)}</div>
                          <div className="w-24 h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${item.color}`}
                              style={{ width: `${Math.min((item.value / (waterfall.grossIRR - waterfall.netIRR || 1)) * 100, 100)}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                </div>

                {/* Waterfall table */}
                <Card className="overflow-x-auto">
                  <div className="px-5 py-4 border-b border-gray-100">
                    <h2 className="text-sm font-semibold text-gray-900">Gross-to-Net Waterfall</h2>
                    <p className="text-xs text-gray-400 mt-0.5">Step-by-step from fund return to what you receive as LP</p>
                  </div>
                  <table className="w-full text-sm">
                    <tbody>
                      {([
                        { label: "Gross IRR", value: waterfall.grossIRR, type: "subtotal" },
                        { label: "Fund expenses", value: waterfall.effectiveFundCost, type: "cost" },
                        { label: "After fund expenses", value: waterfall.irrAfterFundCosts, type: "subtotal" },
                        { label: "Management fee", value: waterfall.effectiveMgmtFee, type: "cost" },
                        { label: "After management fee", value: waterfall.irrAfterMgmt, type: "subtotal" },
                        { label: "Carried interest", value: waterfall.perfFee, type: "cost" },
                        { label: "After carry", value: waterfall.irrAfterPerf, type: "subtotal" },
                        ...(fundParams.hasFoF ? [
                          { label: "FoF management fee", value: waterfall.fofMgmtFee, type: "cost" },
                          { label: "After FoF mgmt fee", value: waterfall.irrAfterFofMgmt, type: "subtotal" },
                          { label: "FoF carried interest", value: waterfall.fofPerfFee, type: "cost" },
                        ] : []),
                        { label: "Net IRR (pre-tax)", value: waterfall.irrBeforeTax, type: "subtotal" },
                        { label: `Corporate tax (${pct0(fundParams.taxRate)})`, value: waterfall.tax, type: "cost" },
                        { label: "Net IRR (after tax)", value: waterfall.netIRR, type: "total" },
                        { label: "Money Multiple", value: waterfall.moneyMultiple, type: "mult" },
                      ] as { label: string; value: number; type: string }[]).map((row, i) => (
                        <tr key={i} className={`border-b last:border-0 ${
                          row.type === "total" ? "bg-violet-50 border-violet-100"
                          : row.type === "mult" ? "bg-gray-50/80"
                          : row.type === "cost" ? "border-gray-50"
                          : "border-gray-100"
                        }`}>
                          <td className={`py-3 px-5 w-72 ${
                            row.type === "cost" ? "text-gray-400 pl-9 text-xs"
                            : row.type === "total" ? "text-violet-900 font-bold"
                            : row.type === "mult" ? "text-gray-600 font-medium"
                            : "text-gray-700 font-medium"
                          }`}>
                            {row.type === "cost" && <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-300 mr-2 -translate-y-px" />}
                            {row.label}
                          </td>
                          <td className={`py-3 px-5 text-right tabular-nums ${
                            row.type === "cost" ? "text-red-500 text-xs"
                            : row.type === "total" ? "text-violet-900 font-bold text-lg"
                            : row.type === "mult" ? "text-gray-600 font-semibold"
                            : "text-gray-900 font-medium"
                          }`}>
                            {row.type === "mult" ? fm(row.value) : row.type === "cost" ? "−" + pct(row.value) : pct(row.value)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>

                <Methodology params={fundParams} />
              </>
            )}
          </main>
        </div>
      </div>

      <footer className="border-t border-gray-200 mt-12">
        <div className="max-w-7xl mx-auto px-6 py-4 text-center text-xs text-gray-400">
          PE Returns Calculator &middot; Standard PE fee structure with linear portfolio runoff
        </div>
      </footer>
    </div>
  );
}

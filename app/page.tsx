"use client";

import { useState, useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Cell, PieChart, Pie,
} from "recharts";

// ── Types ───────────────────────────────────────────────────────────────────

interface Scenario { label: string; grossIRR: number }

interface FundParams {
  investmentYears: number; fundLife: number; fundCostsPA: number;
  mgmtFeePA: number; hurdleRate: number; perfFeeRate: number;
  hasCatchup: boolean; hasFoF: boolean; fofMgmtFeePA: number;
  fofPerfFeeRate: number; fofHasCatchup: boolean; taxRate: number;
}

interface EBITDAParams { entryMultiple: number; leverage: number; holdingPeriod: number }

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
  const catchupThreshold = hurdle / (1 - feeRate);
  if (irr <= catchupThreshold) return irr - hurdle;
  return feeRate * irr;
}

function calcMgmtFeeTotal(annualRate: number, investmentYears: number, fundLife: number): number {
  const committed = Math.pow(1 + annualRate, investmentYears) - 1;
  const declinePeriod = fundLife - investmentYears;
  let invested = 1;
  for (let k = 1; k <= declinePeriod; k++) {
    invested *= 1 + annualRate * (1 - k / declinePeriod);
  }
  invested -= 1;
  return (1 + committed) * (1 + invested) - 1;
}

function calculateWaterfall(grossIRR: number, p: FundParams): WaterfallResult {
  const effectiveFundCost = Math.pow(1 + p.fundCostsPA, p.fundLife / p.investmentYears) - 1;
  const irrAfterFundCosts = grossIRR - effectiveFundCost;
  const totalMgmt = calcMgmtFeeTotal(p.mgmtFeePA, p.investmentYears, p.fundLife);
  const effectiveMgmtFee = Math.pow(1 + totalMgmt, 1 / p.investmentYears) - 1;
  const irrAfterMgmt = irrAfterFundCosts - effectiveMgmtFee;
  const perfFee = calcPerformanceFee(irrAfterMgmt, p.hurdleRate, p.perfFeeRate, p.hasCatchup);
  const irrAfterPerf = irrAfterMgmt - perfFee;
  let fofMgmtFee = 0, irrAfterFofMgmt = irrAfterPerf, fofPerfFee = 0;
  if (p.hasFoF) {
    const totalFofMgmt = calcMgmtFeeTotal(p.fofMgmtFeePA, p.investmentYears, p.fundLife);
    fofMgmtFee = Math.pow(1 + totalFofMgmt, 1 / p.investmentYears) - 1;
    irrAfterFofMgmt = irrAfterPerf - fofMgmtFee;
    fofPerfFee = calcPerformanceFee(irrAfterFofMgmt, p.hurdleRate, p.fofPerfFeeRate, p.fofHasCatchup);
  }
  const irrBeforeTax = irrAfterFofMgmt - fofPerfFee;
  const tax = p.taxRate * irrBeforeTax;
  const netIRR = irrBeforeTax - tax;
  const moneyMultiple = Math.pow(1 + netIRR, p.investmentYears);
  return {
    grossIRR, effectiveFundCost, irrAfterFundCosts, effectiveMgmtFee,
    irrAfterMgmt, perfFee, irrAfterPerf, fofMgmtFee, irrAfterFofMgmt,
    fofPerfFee, irrBeforeTax, tax, netIRR, moneyMultiple,
  };
}

function requiredEBITDAGrowth(grossIRR: number, ep: EBITDAParams, exitMultipleOverride?: number): number | null {
  const equityMoM = Math.pow(1 + grossIRR, ep.holdingPeriod);
  const exitMult = exitMultipleOverride ?? ep.entryMultiple;
  const num = equityMoM * ep.entryMultiple * (1 - ep.leverage) + ep.entryMultiple * ep.leverage;
  const compound = num / exitMult;
  if (compound <= 0) return null;
  return Math.pow(compound, 1 / ep.holdingPeriod) - 1;
}

function requiredExitMultiple(grossIRR: number, ep: EBITDAParams, ebitdaGrowth: number): number {
  const equityMoM = Math.pow(1 + grossIRR, ep.holdingPeriod);
  const num = equityMoM * ep.entryMultiple * (1 - ep.leverage) + ep.entryMultiple * ep.leverage;
  return num / Math.pow(1 + ebitdaGrowth, ep.holdingPeriod);
}

// ── Formatting ──────────────────────────────────────────────────────────────

const pct = (v: number) => (v * 100).toFixed(2) + "%";
const pct1 = (v: number) => (v * 100).toFixed(1) + "%";
const mult = (v: number) => v.toFixed(2) + "x";

// ── Reusable components ─────────────────────────────────────────────────────

function SliderInput({ label, hint, value, onChange, min, max, step, format }: {
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

// ── Charts ───────────────────────────────────────────────────────────────────

const FEE_COLORS = {
  netIRR: "#2563eb",
  fundExpenses: "#f97316",
  mgmtFee: "#ef4444",
  carry: "#8b5cf6",
  fofMgmt: "#ec4899",
  fofCarry: "#f43f5e",
  tax: "#6b7280",
};

function WaterfallChart({ results, scenarios, hasFoF }: {
  results: WaterfallResult[]; scenarios: Scenario[]; hasFoF: boolean;
}) {
  const data = results.map((r, i) => ({
    name: scenarios[i].label,
    "Net IRR": +(r.netIRR * 100).toFixed(2),
    "Tax": +(r.tax * 100).toFixed(2),
    ...(hasFoF ? {
      "FoF Carry": +(r.fofPerfFee * 100).toFixed(2),
      "FoF Mgmt": +(r.fofMgmtFee * 100).toFixed(2),
    } : {}),
    "Carry": +(r.perfFee * 100).toFixed(2),
    "Mgmt Fee": +(r.effectiveMgmtFee * 100).toFixed(2),
    "Fund Exp.": +(r.effectiveFundCost * 100).toFixed(2),
  }));

  const stackKeys = [
    "Net IRR", "Tax",
    ...(hasFoF ? ["FoF Carry", "FoF Mgmt"] : []),
    "Carry", "Mgmt Fee", "Fund Exp.",
  ];
  const colors = [
    FEE_COLORS.netIRR, FEE_COLORS.tax,
    ...(hasFoF ? [FEE_COLORS.fofCarry, FEE_COLORS.fofMgmt] : []),
    FEE_COLORS.carry, FEE_COLORS.mgmtFee, FEE_COLORS.fundExpenses,
  ];

  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={data} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="name" tick={{ fontSize: 12 }} />
        <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => v + "%"} />
        <Tooltip formatter={(value: number) => value.toFixed(2) + "%"} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {stackKeys.map((key, i) => (
          <Bar key={key} dataKey={key} stackId="a" fill={colors[i]} radius={i === stackKeys.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

function FeeBreakdownPie({ result, hasFoF }: { result: WaterfallResult; hasFoF: boolean }) {
  const totalDrag = result.grossIRR - result.netIRR;
  if (totalDrag <= 0) return null;

  const slices = [
    { name: "Fund Exp.", value: +(result.effectiveFundCost / totalDrag * 100).toFixed(1), color: FEE_COLORS.fundExpenses },
    { name: "Mgmt Fee", value: +(result.effectiveMgmtFee / totalDrag * 100).toFixed(1), color: FEE_COLORS.mgmtFee },
    { name: "Carry", value: +(result.perfFee / totalDrag * 100).toFixed(1), color: FEE_COLORS.carry },
    ...(hasFoF ? [
      { name: "FoF Mgmt", value: +(result.fofMgmtFee / totalDrag * 100).toFixed(1), color: FEE_COLORS.fofMgmt },
      { name: "FoF Carry", value: +(result.fofPerfFee / totalDrag * 100).toFixed(1), color: FEE_COLORS.fofCarry },
    ] : []),
    { name: "Tax", value: +(result.tax / totalDrag * 100).toFixed(1), color: FEE_COLORS.tax },
  ].filter(s => s.value > 0);

  return (
    <ResponsiveContainer width="100%" height={240}>
      <PieChart>
        <Pie data={slices} cx="50%" cy="50%" innerRadius={55} outerRadius={90}
          paddingAngle={2} dataKey="value" label={({ name, value }) => `${name} ${value}%`}
          labelLine={{ strokeWidth: 1 }} style={{ fontSize: 11 }}>
          {slices.map((s, i) => <Cell key={i} fill={s.color} />)}
        </Pie>
        <Tooltip formatter={(value: number) => value.toFixed(1) + "%"} />
      </PieChart>
    </ResponsiveContainer>
  );
}

// ── Methodology ──────────────────────────────────────────────────────────────

function MethodologySection({ params }: { params: FundParams }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <button
        className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-gray-50 transition-colors"
        onClick={() => setOpen(!open)}
      >
        <div>
          <h2 className="text-sm font-semibold text-gray-900">How are these calculated?</h2>
          <p className="text-xs text-gray-400 mt-0.5">Click to {open ? "hide" : "view"} the methodology and formulas</p>
        </div>
        <svg className={`w-5 h-5 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="px-5 pb-5 space-y-6 text-sm text-gray-600 border-t border-gray-100 pt-4">
          <div>
            <h3 className="font-semibold text-gray-800 mb-2">1. Fund Expenses</h3>
            <p className="mb-2">
              The annual fund expense rate ({(params.fundCostsPA * 100).toFixed(1)}%) is charged over the entire fund life ({params.fundLife} years),
              but since capital is only deployed for {params.investmentYears} years, the cost must be &ldquo;compressed&rdquo;:
            </p>
            <div className="bg-gray-50 rounded-lg p-3 font-mono text-xs">
              Effective annual cost = (1 + {(params.fundCostsPA * 100).toFixed(1)}%)^({params.fundLife}/{params.investmentYears}) − 1
              = {pct(Math.pow(1 + params.fundCostsPA, params.fundLife / params.investmentYears) - 1)}
            </div>
            <p className="mt-2 text-xs text-gray-400">
              Covers: legal, accounting, registration, bank fees, notary costs, reporting, and other fund-level expenses.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-gray-800 mb-2">2. Management Fee</h3>
            <p className="mb-2">
              {(params.mgmtFeePA * 100).toFixed(1)}% on committed capital during the investment period (years 1-{params.investmentYears}),
              then declining linearly on invested capital as portfolio companies are exited (years {params.investmentYears + 1}-{params.fundLife}).
            </p>
            <div className="bg-gray-50 rounded-lg p-3 font-mono text-xs space-y-1">
              <div>Committed portion = (1 + {(params.mgmtFeePA * 100).toFixed(1)}%)^{params.investmentYears} − 1</div>
              <div>Invested portion = &prod;(1 + {(params.mgmtFeePA * 100).toFixed(1)}% &times; declining fraction) − 1</div>
              <div>Total = (1 + committed)(1 + invested) − 1</div>
              <div>Effective annual = (1 + total)^(1/{params.investmentYears}) − 1</div>
            </div>
            <p className="mt-2 text-xs text-gray-400">
              The effective rate ({pct(Math.pow(1 + calcMgmtFeeTotal(params.mgmtFeePA, params.investmentYears, params.fundLife), 1 / params.investmentYears) - 1)}) is higher than the stated {(params.mgmtFeePA * 100).toFixed(1)}%
              because fees are charged over the full fund life but capital is deployed for fewer years.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-gray-800 mb-2">3. Carried Interest (Performance Fee)</h3>
            <p className="mb-2">
              {(params.perfFeeRate * 100).toFixed(0)}% carry with {(params.hurdleRate * 100).toFixed(0)}% hurdle
              {params.hasCatchup ? " and GP catchup" : " (no catchup)"}:
            </p>
            {params.hasCatchup ? (
              <div className="bg-gray-50 rounded-lg p-3 text-xs space-y-1.5">
                <div className="flex gap-2">
                  <span className="text-gray-400 w-40 shrink-0">IRR after costs &le; {(params.hurdleRate * 100).toFixed(0)}%:</span>
                  <span>No carry — 100% to LP</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-gray-400 w-40 shrink-0">{(params.hurdleRate * 100).toFixed(0)}% &lt; IRR &le; {pct1(params.hurdleRate / (1 - params.perfFeeRate))}:</span>
                  <span>Catchup — 100% to GP until GP has {(params.perfFeeRate * 100).toFixed(0)}% of total</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-gray-400 w-40 shrink-0">IRR &gt; {pct1(params.hurdleRate / (1 - params.perfFeeRate))}:</span>
                  <span>Carry = {(params.perfFeeRate * 100).toFixed(0)}% &times; IRR after costs ({(100 - params.perfFeeRate * 100).toFixed(0)}/{(params.perfFeeRate * 100).toFixed(0)} split)</span>
                </div>
              </div>
            ) : (
              <div className="bg-gray-50 rounded-lg p-3 text-xs space-y-1.5">
                <div className="flex gap-2">
                  <span className="text-gray-400 w-40 shrink-0">IRR after costs &le; {(params.hurdleRate * 100).toFixed(0)}%:</span>
                  <span>No carry</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-gray-400 w-40 shrink-0">IRR &gt; {(params.hurdleRate * 100).toFixed(0)}%:</span>
                  <span>Carry = {(params.perfFeeRate * 100).toFixed(0)}% &times; (IRR − {(params.hurdleRate * 100).toFixed(0)}%)</span>
                </div>
              </div>
            )}
          </div>

          {params.hasFoF && (
            <div>
              <h3 className="font-semibold text-gray-800 mb-2">4. Fund of Fund Fees</h3>
              <p>
                Same structure as fund-level fees but with FoF rates: {(params.fofMgmtFeePA * 100).toFixed(1)}% management fee
                and {(params.fofPerfFeeRate * 100).toFixed(0)}% carry. Applied after the underlying fund&apos;s fees have been deducted.
              </p>
            </div>
          )}

          <div>
            <h3 className="font-semibold text-gray-800 mb-2">{params.hasFoF ? "5" : "4"}. Corporate Tax</h3>
            <p>
              {(params.taxRate * 100).toFixed(0)}% flat rate applied to the net pre-tax IRR. Final money multiple = (1 + net IRR)^{params.investmentYears}.
            </p>
          </div>

          <div className="border-t border-gray-100 pt-4">
            <h3 className="font-semibold text-gray-800 mb-2">EBITDA Reverse-Engineering</h3>
            <p className="mb-2">
              Given an entry EV/EBITDA multiple, leverage ratio, and holding period, the required
              EBITDA growth to achieve a target gross IRR is derived from:
            </p>
            <div className="bg-gray-50 rounded-lg p-3 font-mono text-xs space-y-1">
              <div>Equity MoM = (1 + Gross IRR)^holding period</div>
              <div>Exit EV = Entry EBITDA &times; (1+g)^h &times; Exit Multiple</div>
              <div>Exit Equity = Exit EV − Debt</div>
              <div className="pt-1 border-t border-gray-200 mt-1">Solving for g:</div>
              <div>(1+g)^h = (Equity MoM &times; Entry EV &times; (1−lev) + Entry EV &times; lev) / Exit Multiple</div>
            </div>
            <p className="mt-2 text-xs text-gray-400">
              Assumes: no interim cash flows, no debt paydown, constant interest rate.
              These simplifications mean the model underestimates the leverage benefit slightly.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

export default function PEReturnsCalculator() {
  const [scenarios, setScenarios] = useState<Scenario[]>([
    { label: "Best Case", grossIRR: 0.3 },
    { label: "Strong", grossIRR: 0.25 },
    { label: "Base Case", grossIRR: 0.18 },
    { label: "Weak", grossIRR: 0.15 },
    { label: "Worst Case", grossIRR: 0.13 },
  ]);

  const [params, setParams] = useState<FundParams>({
    investmentYears: 5, fundLife: 10, fundCostsPA: 0.005, mgmtFeePA: 0.02,
    hurdleRate: 0.08, perfFeeRate: 0.2, hasCatchup: true, hasFoF: true,
    fofMgmtFeePA: 0.007, fofPerfFeeRate: 0.05, fofHasCatchup: true, taxRate: 0.2,
  });

  const [ebitda, setEBITDA] = useState<EBITDAParams>({
    entryMultiple: 10, leverage: 0.5, holdingPeriod: 5,
  });

  const [activeSection, setActiveSection] = useState<"waterfall" | "ebitda">("waterfall");

  const results = useMemo(
    () => scenarios.map((s) => calculateWaterfall(s.grossIRR, params)),
    [scenarios, params]
  );

  const updateScenario = (idx: number, grossIRR: number) => {
    setScenarios((prev) => prev.map((s, i) => (i === idx ? { ...s, grossIRR } : s)));
  };
  const updateParam = <K extends keyof FundParams>(key: K, value: FundParams[K]) => {
    setParams((prev) => ({ ...prev, [key]: value }));
  };
  const updateEBITDA = <K extends keyof EBITDAParams>(key: K, value: EBITDAParams[K]) => {
    setEBITDA((prev) => ({ ...prev, [key]: value }));
  };

  const waterfallRows: { label: string; key: keyof WaterfallResult; type: "subtotal" | "cost" | "total" | "mult" }[] = [
    { label: "Gross IRR", key: "grossIRR", type: "subtotal" },
    { label: "Fund expenses", key: "effectiveFundCost", type: "cost" },
    { label: "After fund expenses", key: "irrAfterFundCosts", type: "subtotal" },
    { label: "Management fee", key: "effectiveMgmtFee", type: "cost" },
    { label: "After management fee", key: "irrAfterMgmt", type: "subtotal" },
    { label: "Carried interest", key: "perfFee", type: "cost" },
    { label: "After carry", key: "irrAfterPerf", type: "subtotal" },
    ...(params.hasFoF ? [
      { label: "FoF management fee", key: "fofMgmtFee" as keyof WaterfallResult, type: "cost" as const },
      { label: "After FoF mgmt fee", key: "irrAfterFofMgmt" as keyof WaterfallResult, type: "subtotal" as const },
      { label: "FoF carried interest", key: "fofPerfFee" as keyof WaterfallResult, type: "cost" as const },
    ] : []),
    { label: "Net IRR (pre-tax)", key: "irrBeforeTax", type: "subtotal" },
    { label: `Corporate tax (${(params.taxRate * 100).toFixed(0)}%)`, key: "tax", type: "cost" },
    { label: "Net IRR (after tax)", key: "netIRR", type: "total" },
    { label: "Money Multiple", key: "moneyMultiple", type: "mult" },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">PE Returns Calculator</h1>
            <p className="text-xs text-gray-400 mt-0.5">Gross-to-net IRR waterfall &middot; Fee impact &middot; Implied portfolio performance</p>
          </div>
          <div className="hidden sm:flex bg-gray-100 rounded-lg p-0.5 text-sm">
            {(["waterfall", "ebitda"] as const).map((s) => (
              <button key={s} onClick={() => setActiveSection(s)}
                className={`px-4 py-1.5 rounded-md font-medium transition-colors ${activeSection === s ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
                {s === "waterfall" ? "Fee Waterfall" : "EBITDA Analysis"}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
          {/* ── Sidebar ─────────────────────────────────────────── */}
          <aside className="space-y-5">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">Gross IRR Scenarios</h2>
              <div className="space-y-3">
                {scenarios.map((s, i) => (
                  <SliderInput key={i} label={s.label} value={s.grossIRR} onChange={(v) => updateScenario(i, v)}
                    min={0} max={0.5} step={0.01} format={(v) => (v * 100).toFixed(0) + "%"} />
                ))}
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">Fund Structure</h2>
              <div className="space-y-4">
                <SliderInput label="Investment period" hint="Years capital is actively deployed" value={params.investmentYears}
                  onChange={(v) => updateParam("investmentYears", v)} min={1} max={10} step={1} format={(v) => v + " yr"} />
                <SliderInput label="Fund life" hint="Total fund duration including harvest" value={params.fundLife}
                  onChange={(v) => updateParam("fundLife", v)} min={5} max={15} step={1} format={(v) => v + " yr"} />
                <SliderInput label="Fund expenses" hint="Legal, accounting, admin costs p.a." value={params.fundCostsPA}
                  onChange={(v) => updateParam("fundCostsPA", v)} min={0} max={0.02} step={0.001} format={(v) => (v * 100).toFixed(1) + "%"} />
                <SliderInput label="Management fee" hint="Annual fee on committed capital" value={params.mgmtFeePA}
                  onChange={(v) => updateParam("mgmtFeePA", v)} min={0} max={0.04} step={0.001} format={(v) => (v * 100).toFixed(1) + "%"} />
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">Carry & Hurdle</h2>
              <div className="space-y-4">
                <SliderInput label="Hurdle rate" hint="Preferred return before GP participates" value={params.hurdleRate}
                  onChange={(v) => updateParam("hurdleRate", v)} min={0} max={0.15} step={0.01} format={(v) => (v * 100).toFixed(0) + "%"} />
                <SliderInput label="Carried interest" hint="GP share of profits above hurdle" value={params.perfFeeRate}
                  onChange={(v) => updateParam("perfFeeRate", v)} min={0} max={0.3} step={0.01} format={(v) => (v * 100).toFixed(0) + "%"} />
                <Toggle label="GP catchup" hint="GP receives 100% until caught up" checked={params.hasCatchup} onChange={(v) => updateParam("hasCatchup", v)} />
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
              <div className="mb-4">
                <Toggle label="Fund of Fund layer" hint="Additional fee layer for FoF investors" checked={params.hasFoF} onChange={(v) => updateParam("hasFoF", v)} />
              </div>
              {params.hasFoF && (
                <div className="space-y-4 pt-2 border-t border-gray-100">
                  <SliderInput label="FoF management fee" value={params.fofMgmtFeePA} onChange={(v) => updateParam("fofMgmtFeePA", v)}
                    min={0} max={0.02} step={0.001} format={(v) => (v * 100).toFixed(1) + "%"} />
                  <SliderInput label="FoF carry" value={params.fofPerfFeeRate} onChange={(v) => updateParam("fofPerfFeeRate", v)}
                    min={0} max={0.15} step={0.01} format={(v) => (v * 100).toFixed(0) + "%"} />
                  <Toggle label="FoF catchup" checked={params.fofHasCatchup} onChange={(v) => updateParam("fofHasCatchup", v)} />
                </div>
              )}
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
              <SliderInput label="Corporate tax rate" value={params.taxRate} onChange={(v) => updateParam("taxRate", v)}
                min={0} max={0.4} step={0.01} format={(v) => (v * 100).toFixed(0) + "%"} />
            </div>

            {activeSection === "ebitda" && (
              <div className="bg-white rounded-xl shadow-sm border border-blue-200 p-5">
                <h2 className="text-xs font-semibold text-blue-600 uppercase tracking-wider mb-4">Deal Assumptions</h2>
                <div className="space-y-4">
                  <SliderInput label="Entry EV/EBITDA" hint="Purchase price as multiple of EBITDA" value={ebitda.entryMultiple}
                    onChange={(v) => updateEBITDA("entryMultiple", v)} min={4} max={20} step={0.5} format={(v) => v.toFixed(1) + "x"} />
                  <SliderInput label="Leverage" hint="Debt as % of enterprise value" value={ebitda.leverage}
                    onChange={(v) => updateEBITDA("leverage", v)} min={0} max={0.8} step={0.05} format={(v) => (v * 100).toFixed(0) + "%"} />
                  <SliderInput label="Holding period" value={ebitda.holdingPeriod}
                    onChange={(v) => updateEBITDA("holdingPeriod", v)} min={2} max={10} step={1} format={(v) => v + " yr"} />
                </div>
              </div>
            )}
          </aside>

          {/* ── Main content ────────────────────────────────────── */}
          <main className="space-y-6">
            {/* Mobile toggle */}
            <div className="flex sm:hidden bg-gray-100 rounded-lg p-0.5 text-sm">
              {(["waterfall", "ebitda"] as const).map((s) => (
                <button key={s} onClick={() => setActiveSection(s)}
                  className={`flex-1 px-4 py-2 rounded-md font-medium transition-colors ${activeSection === s ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}>
                  {s === "waterfall" ? "Fee Waterfall" : "EBITDA Analysis"}
                </button>
              ))}
            </div>

            {activeSection === "waterfall" && (
              <>
                {/* Key metrics */}
                <div className="grid grid-cols-5 gap-3">
                  {results.map((r, i) => (
                    <div key={i} className={`rounded-xl p-4 text-center ${i === 2 ? "bg-blue-600 text-white shadow-lg shadow-blue-200" : "bg-white border border-gray-200 shadow-sm"}`}>
                      <div className={`text-[10px] uppercase tracking-wider font-medium mb-2 ${i === 2 ? "text-blue-200" : "text-gray-400"}`}>{scenarios[i].label}</div>
                      <div className={`text-2xl font-bold tabular-nums ${i === 2 ? "text-white" : "text-gray-900"}`}>{(r.netIRR * 100).toFixed(1)}%</div>
                      <div className={`text-xs mt-1 ${i === 2 ? "text-blue-200" : "text-gray-400"}`}>{mult(r.moneyMultiple)} MoM</div>
                    </div>
                  ))}
                </div>

                {/* Stacked bar chart */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                  <h2 className="text-sm font-semibold text-gray-900 mb-1">IRR Composition by Scenario</h2>
                  <p className="text-xs text-gray-400 mb-4">Stacked view: net return (blue) + each fee layer = gross IRR</p>
                  <WaterfallChart results={results} scenarios={scenarios} hasFoF={params.hasFoF} />
                </div>

                {/* Fee breakdown pie for base case */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                    <h2 className="text-sm font-semibold text-gray-900 mb-1">Fee Drag Breakdown — Base Case</h2>
                    <p className="text-xs text-gray-400 mb-2">Share of total drag by fee type</p>
                    <FeeBreakdownPie result={results[2]} hasFoF={params.hasFoF} />
                  </div>
                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                    <h2 className="text-sm font-semibold text-gray-900 mb-1">Fee Drag Breakdown — Best Case</h2>
                    <p className="text-xs text-gray-400 mb-2">Share of total drag by fee type</p>
                    <FeeBreakdownPie result={results[0]} hasFoF={params.hasFoF} />
                  </div>
                </div>

                {/* Waterfall table */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto">
                  <div className="px-5 py-4 border-b border-gray-100">
                    <h2 className="text-sm font-semibold text-gray-900">Gross-to-Net IRR Waterfall</h2>
                    <p className="text-xs text-gray-400 mt-0.5">Step-by-step from gross to net returns across all scenarios</p>
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50/50">
                        <th className="text-left py-3 px-5 text-gray-400 font-medium text-xs uppercase tracking-wider w-64">Step</th>
                        {scenarios.map((s, i) => (
                          <th key={i} className={`text-right py-3 px-4 text-xs uppercase tracking-wider font-semibold ${i === 2 ? "text-blue-600" : "text-gray-500"}`}>{s.label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {waterfallRows.map((row, ri) => {
                        const { type } = row;
                        return (
                          <tr key={ri} className={`border-b last:border-0 ${type === "total" ? "bg-blue-50 border-blue-100" : type === "mult" ? "bg-gray-50/80" : type === "cost" ? "border-gray-50" : "border-gray-100"}`}>
                            <td className={`py-2.5 px-5 ${type === "cost" ? "text-gray-400 pl-9 text-xs" : type === "total" ? "text-blue-900 font-bold" : type === "mult" ? "text-gray-600 font-medium" : "text-gray-700 font-medium"}`}>
                              {type === "cost" && <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-300 mr-2 -translate-y-px" />}
                              {row.label}
                            </td>
                            {results.map((r, ci) => {
                              const val = r[row.key] as number;
                              return (
                                <td key={ci} className={`py-2.5 px-4 text-right tabular-nums ${type === "cost" ? "text-red-500 text-xs" : type === "total" ? "text-blue-900 font-bold" : type === "mult" ? "text-gray-600 font-semibold" : ci === 2 ? "text-gray-900 font-medium" : "text-gray-700"}`}>
                                  {type === "mult" ? mult(val) : type === "cost" ? "−" + pct(val) : pct(val)}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Fee drag summary */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto">
                  <div className="px-5 py-4 border-b border-gray-100">
                    <h2 className="text-sm font-semibold text-gray-900">Total Fee Drag</h2>
                    <p className="text-xs text-gray-400 mt-0.5">How much of the gross return is consumed by fees and taxes</p>
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50/50">
                        <th className="text-left py-3 px-5 text-gray-400 font-medium text-xs uppercase tracking-wider w-64">&nbsp;</th>
                        {scenarios.map((s, i) => (
                          <th key={i} className={`text-right py-3 px-4 text-xs uppercase tracking-wider font-semibold ${i === 2 ? "text-blue-600" : "text-gray-500"}`}>{s.label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-gray-50">
                        <td className="py-2.5 px-5 text-gray-600">Gross IRR</td>
                        {results.map((r, i) => <td key={i} className="py-2.5 px-4 text-right tabular-nums text-gray-700">{pct(r.grossIRR)}</td>)}
                      </tr>
                      <tr className="border-b border-gray-50">
                        <td className="py-2.5 px-5 text-gray-600">Net IRR (after tax)</td>
                        {results.map((r, i) => <td key={i} className="py-2.5 px-4 text-right tabular-nums text-gray-700">{pct(r.netIRR)}</td>)}
                      </tr>
                      <tr className="border-b border-gray-50 bg-orange-50/70">
                        <td className="py-2.5 px-5 text-gray-800 font-medium">Total drag (absolute)</td>
                        {results.map((r, i) => <td key={i} className="py-2.5 px-4 text-right tabular-nums text-orange-700 font-semibold">{pct(r.grossIRR - r.netIRR)}</td>)}
                      </tr>
                      <tr className="bg-orange-50/70">
                        <td className="py-2.5 px-5 text-gray-800 font-medium">Drag as % of gross</td>
                        {results.map((r, i) => <td key={i} className="py-2.5 px-4 text-right tabular-nums text-orange-700 font-semibold">{r.grossIRR > 0 ? pct1((r.grossIRR - r.netIRR) / r.grossIRR) : "n/a"}</td>)}
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Methodology */}
                <MethodologySection params={params} />
              </>
            )}

            {activeSection === "ebitda" && (
              <>
                {/* Deal summary */}
                <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl p-5 text-white shadow-lg shadow-blue-200">
                  <div className="text-xs uppercase tracking-wider text-blue-200 mb-2">Deal Assumptions</div>
                  <div className="grid grid-cols-3 gap-6">
                    <div><div className="text-2xl font-bold">{ebitda.entryMultiple.toFixed(1)}x</div><div className="text-xs text-blue-200 mt-0.5">Entry EV/EBITDA</div></div>
                    <div><div className="text-2xl font-bold">{(ebitda.leverage * 100).toFixed(0)}%</div><div className="text-xs text-blue-200 mt-0.5">Leverage</div></div>
                    <div><div className="text-2xl font-bold">{ebitda.holdingPeriod} yr</div><div className="text-xs text-blue-200 mt-0.5">Hold period</div></div>
                  </div>
                </div>

                {/* Required EBITDA growth */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto">
                  <div className="px-5 py-4 border-b border-gray-100">
                    <h2 className="text-sm font-semibold text-gray-900">Required EBITDA Growth</h2>
                    <p className="text-xs text-gray-400 mt-0.5">Annual EBITDA CAGR needed to achieve each gross IRR at different exit multiples</p>
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50/50">
                        <th className="text-left py-3 px-5 text-gray-400 font-medium text-xs uppercase tracking-wider w-64">Exit multiple scenario</th>
                        {scenarios.map((s, i) => (
                          <th key={i} className={`text-right py-3 px-4 text-xs uppercase tracking-wider font-semibold ${i === 2 ? "text-blue-600" : "text-gray-500"}`}>
                            {s.label}<div className="text-[10px] font-normal text-gray-400 mt-0.5">{(s.grossIRR * 100).toFixed(0)}% gross</div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { label: `No expansion (${ebitda.entryMultiple.toFixed(1)}x → ${ebitda.entryMultiple.toFixed(1)}x)`, exitMult: undefined },
                        { label: `+2x expansion (→ ${(ebitda.entryMultiple + 2).toFixed(1)}x)`, exitMult: ebitda.entryMultiple + 2 },
                        { label: `−2x compression (→ ${Math.max(ebitda.entryMultiple - 2, 1).toFixed(1)}x)`, exitMult: Math.max(ebitda.entryMultiple - 2, 1) },
                      ].map((row, ri) => (
                        <tr key={ri} className={`border-b border-gray-50 ${ri === 0 ? "bg-emerald-50/50" : ""}`}>
                          <td className={`py-3 px-5 text-gray-700 ${ri === 0 ? "font-medium" : ""}`}>{row.label}</td>
                          {scenarios.map((s, ci) => {
                            const g = requiredEBITDAGrowth(s.grossIRR, ebitda, row.exitMult);
                            return (
                              <td key={ci} className={`py-3 px-4 text-right tabular-nums font-medium ${g !== null && g > 0.3 ? "text-red-500" : g !== null && g < 0 ? "text-amber-600" : ri === 0 ? "text-emerald-700" : "text-gray-700"}`}>
                                {g !== null ? pct(g) : "n/a"}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Required exit multiple */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto">
                  <div className="px-5 py-4 border-b border-gray-100">
                    <h2 className="text-sm font-semibold text-gray-900">Required Exit Multiple</h2>
                    <p className="text-xs text-gray-400 mt-0.5">Exit EV/EBITDA needed at different EBITDA growth assumptions</p>
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50/50">
                        <th className="text-left py-3 px-5 text-gray-400 font-medium text-xs uppercase tracking-wider w-64">EBITDA growth</th>
                        {scenarios.map((s, i) => (
                          <th key={i} className={`text-right py-3 px-4 text-xs uppercase tracking-wider font-semibold ${i === 2 ? "text-blue-600" : "text-gray-500"}`}>
                            {s.label}<div className="text-[10px] font-normal text-gray-400 mt-0.5">{(s.grossIRR * 100).toFixed(0)}% gross</div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { label: "No growth (0%)", growth: 0 },
                        { label: "Moderate (5%)", growth: 0.05 },
                        { label: "Strong (10%)", growth: 0.10 },
                        { label: "High (15%)", growth: 0.15 },
                      ].map((row, ri) => (
                        <tr key={ri} className={`border-b border-gray-50 ${ri === 0 ? "bg-violet-50/50" : ""}`}>
                          <td className={`py-3 px-5 text-gray-700 ${ri === 0 ? "font-medium" : ""}`}>{row.label}</td>
                          {scenarios.map((s, ci) => {
                            const m = requiredExitMultiple(s.grossIRR, ebitda, row.growth);
                            const expansion = m / ebitda.entryMultiple;
                            return (
                              <td key={ci} className={`py-3 px-4 text-right tabular-nums font-medium ${expansion > 2 ? "text-red-500" : expansion < 0.8 ? "text-emerald-600" : ri === 0 ? "text-violet-700" : "text-gray-700"}`}>
                                {mult(m)}
                                <span className="block text-[10px] font-normal text-gray-400">{expansion >= 1 ? "+" : ""}{((expansion - 1) * 100).toFixed(0)}% vs entry</span>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Reference */}
                <div className="bg-gray-50 rounded-xl border border-gray-200 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-3 px-5 text-gray-400 font-medium text-xs uppercase tracking-wider w-64">Reference</th>
                        {scenarios.map((s, i) => <th key={i} className="text-right py-3 px-4 text-gray-500 text-xs uppercase tracking-wider font-semibold">{s.label}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-gray-100">
                        <td className="py-2.5 px-5 text-gray-600">Gross Equity MoM</td>
                        {scenarios.map((s, i) => <td key={i} className="py-2.5 px-4 text-right tabular-nums text-gray-700 font-medium">{mult(Math.pow(1 + s.grossIRR, ebitda.holdingPeriod))}</td>)}
                      </tr>
                      <tr>
                        <td className="py-2.5 px-5 text-gray-600">Net MoM (after all fees & tax)</td>
                        {results.map((r, i) => <td key={i} className="py-2.5 px-4 text-right tabular-nums text-gray-700 font-medium">{mult(r.moneyMultiple)}</td>)}
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Methodology */}
                <MethodologySection params={params} />
              </>
            )}
          </main>
        </div>
      </div>

      <footer className="border-t border-gray-200 mt-12">
        <div className="max-w-7xl mx-auto px-6 py-4 text-center text-xs text-gray-400">
          PE Returns Calculator &middot; Standard PE fee structure with linear portfolio runoff after investment period
        </div>
      </footer>
    </div>
  );
}

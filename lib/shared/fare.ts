// BusGo fare engine + booking status machine (PRD §08), shared client/server
// so the breakdown a customer sees always matches what the server stores.

export type VehicleClass = "urbania" | "tempo_traveller" | "mini_bus" | "luxury_coach";

export interface VehicleClassSpec {
  label: string;
  emoji: string;
  seatRange: [number, number];
}

export const VEHICLE_CLASSES: Record<VehicleClass, VehicleClassSpec> = {
  urbania: { label: "Urbania / Van", emoji: "🚐", seatRange: [7, 13] },
  tempo_traveller: { label: "Tempo Traveller", emoji: "🚐", seatRange: [9, 26] },
  mini_bus: { label: "Mini Bus", emoji: "🚌", seatRange: [27, 35] },
  luxury_coach: { label: "Luxury Coach", emoji: "🚍", seatRange: [36, 55] },
};

export const VEHICLE_CLASS_LIST = Object.keys(VEHICLE_CLASSES) as VehicleClass[];

export type TripType = "one_way" | "round_trip" | "multi_city" | "full_day";

export const TRIP_TYPES: Record<TripType, string> = {
  one_way: "One-way",
  round_trip: "Round trip",
  multi_city: "Multi-city",
  full_day: "Full-day charter",
};

export type BookingStatus =
  | "requested"
  | "confirmed"
  | "declined"
  | "cancelled"
  | "started"
  | "completed";

export const STATUS_LABEL: Record<BookingStatus, string> = {
  requested: "Awaiting owner confirmation",
  confirmed: "Confirmed",
  declined: "Declined by owner",
  cancelled: "Cancelled",
  started: "Trip in progress",
  completed: "Completed",
};

export type PaymentStatus = "unpaid" | "advance_paid" | "paid" | "refunded";

export const PAYMENT_LABEL: Record<PaymentStatus, string> = {
  unpaid: "Payment pending",
  advance_paid: "Advance paid",
  paid: "Fully paid",
  refunded: "Refunded",
};

export const PLATFORM_FEE_PCT = 10; // BusGo service charge on base + bata
export const TOLL_EST_PER_KM = 1.8; // rough highway toll estimate, ₹/km

// Per-state levy: flat entry tax + per-passenger charge (admin-configurable).
export interface StateTaxRate {
  entryTax: number;
  perPassenger: number;
}

export const DEFAULT_STATE_TAX: StateTaxRate = { entryTax: 500, perPassenger: 0 };

export interface VehicleRates {
  perKm: number;
  perDay: number;
  minFare: number;
  bataPerDay: number; // driver daily allowance
  nightPct: number; // surcharge % when trip includes 10 PM–6 AM legs
}

export interface AgentTerms {
  // Owner-paid commission (deducted from owner settlement, not billed to customer)
  ownerPaysCommission: boolean;
  commissionType: "fixed" | "percent";
  commissionValue: number;
  // Agent's own service charge (added to the customer's total)
  serviceType: "fixed" | "percent";
  serviceValue: number;
}

export interface FareInput {
  tripType: TripType;
  km: number; // total routed distance incl. return leg for round trips
  days: number; // >= 1
  nightTravel: boolean;
  stateTaxes: number; // sum of entry taxes for states crossed (₹)
  agent?: AgentTerms | null;
}

export interface FareBreakdown {
  baseFare: number;
  driverBata: number;
  nightSurcharge: number;
  stateTaxes: number;
  tollEst: number;
  platformFee: number;
  agentServiceCharge: number; // customer pays (0 if direct booking)
  agentCommission: number; // owner pays out of settlement (informational)
  totalFare: number; // what the customer pays
}

export function calcFare(rates: VehicleRates, input: FareInput): FareBreakdown {
  const days = Math.max(1, Math.round(input.days));
  const km = Math.max(0, input.km);

  // Base fare (PRD §3.3): full-day charters bill by the day; multi-day trips
  // bill whichever is higher (the vehicle is blocked for every day); plain
  // single-day trips bill per-km. Minimum billing floors everything.
  const perKmBase = rates.perKm * km;
  let raw: number;
  if (input.tripType === "full_day") raw = Math.max(rates.perDay * days, perKmBase);
  else if (days > 1) raw = Math.max(perKmBase, rates.perDay * days);
  else raw = perKmBase;
  const baseFare = Math.round(Math.max(raw, rates.minFare));
  const driverBata = Math.round(rates.bataPerDay * days);
  const nightSurcharge = input.nightTravel
    ? Math.round((baseFare * rates.nightPct) / 100)
    : 0;
  const stateTaxes = Math.max(0, Math.round(input.stateTaxes));
  const tollEst = Math.round(km * TOLL_EST_PER_KM);
  const platformFee = Math.round(((baseFare + driverBata) * PLATFORM_FEE_PCT) / 100);

  let agentServiceCharge = 0;
  let agentCommission = 0;
  if (input.agent) {
    agentServiceCharge =
      input.agent.serviceType === "percent"
        ? Math.round((baseFare * input.agent.serviceValue) / 100)
        : Math.round(input.agent.serviceValue);
    if (input.agent.ownerPaysCommission) {
      agentCommission =
        input.agent.commissionType === "percent"
          ? Math.round((baseFare * input.agent.commissionValue) / 100)
          : Math.round(input.agent.commissionValue);
    }
  }

  const totalFare =
    baseFare +
    driverBata +
    nightSurcharge +
    stateTaxes +
    tollEst +
    platformFee +
    agentServiceCharge;

  return {
    baseFare,
    driverBata,
    nightSurcharge,
    stateTaxes,
    tollEst,
    platformFee,
    agentServiceCharge,
    agentCommission,
    totalFare,
  };
}

// Tiered advance rules (PRD §4.1 Step 4), by days until trip start.
export function advancePct(leadDays: number): number {
  if (leadDays < 2) return 100;
  if (leadDays <= 7) return 75;
  return 50;
}

export function advanceAmount(totalFare: number, startDate: string, today = new Date()): number {
  const start = new Date(startDate + "T00:00:00");
  const lead = Math.floor((start.getTime() - today.getTime()) / 86400000);
  return Math.round((totalFare * advancePct(lead)) / 100);
}

// Settlement split for a completed booking.
export function settlementSplit(b: {
  totalFare: number;
  platformFee: number;
  agentServiceCharge: number;
  agentCommission: number;
}) {
  return {
    ownerPayout: b.totalFare - b.platformFee - b.agentServiceCharge - b.agentCommission,
    agentPayout: b.agentServiceCharge + b.agentCommission,
    platformRevenue: b.platformFee,
  };
}

export function daysBetween(startDate: string, endDate: string): number {
  const s = new Date(startDate + "T00:00:00").getTime();
  const e = new Date(endDate + "T00:00:00").getTime();
  return Math.max(1, Math.round((e - s) / 86400000) + 1);
}

export function fmtINR(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

export function fmtKm(km: number | null | undefined): string {
  if (km === null || km === undefined) return "—";
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
}

export function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// Compliance: a vehicle is bookable only while all documents are valid.
export function docStatus(expiry: string | null): "valid" | "expiring" | "expired" {
  if (!expiry) return "expired";
  const days = Math.floor(
    (new Date(expiry + "T00:00:00").getTime() - Date.now()) / 86400000,
  );
  if (days < 0) return "expired";
  if (days <= 7) return "expiring";
  return "valid";
}

export function vehicleCompliance(v: {
  permitExpiry: string | null;
  insuranceExpiry: string | null;
  fitnessExpiry: string | null;
  pucExpiry: string | null;
}): { ok: boolean; issues: string[] } {
  const docs: [string, string | null][] = [
    ["Permit", v.permitExpiry],
    ["Insurance", v.insuranceExpiry],
    ["Fitness certificate", v.fitnessExpiry],
    ["PUC", v.pucExpiry],
  ];
  const issues: string[] = [];
  for (const [name, exp] of docs) {
    const s = docStatus(exp);
    if (s === "expired") issues.push(`${name} expired`);
    else if (s === "expiring") issues.push(`${name} expiring soon`);
  }
  return { ok: !issues.some((i) => i.includes("expired")), issues };
}

import { fmtINR, PAYMENT_LABEL, STATUS_LABEL } from "@/lib/shared/fare";
import type { BookingStatus, FareBreakdown, PaymentStatus } from "@/lib/shared/fare";

const STATUS_TAG: Record<BookingStatus, string> = {
  requested: "tag-warm",
  confirmed: "tag-info",
  declined: "tag-rose",
  cancelled: "tag-rose",
  started: "tag-accent",
  completed: "tag-accent",
};

export function StatusTag({ status }: { status: BookingStatus }) {
  return <span className={`tag ${STATUS_TAG[status] ?? "tag-dim"}`}>{STATUS_LABEL[status]}</span>;
}

const PAY_TAG: Record<PaymentStatus, string> = {
  unpaid: "tag-warm",
  advance_paid: "tag-info",
  paid: "tag-accent",
  refunded: "tag-dim",
};

export function PayTag({ status }: { status: PaymentStatus }) {
  return <span className={`tag ${PAY_TAG[status] ?? "tag-dim"}`}>{PAYMENT_LABEL[status]}</span>;
}

// Transparent fare breakdown table (PRD §4.1 Step 3).
export function FareLines({
  fare,
  showCommission,
}: {
  fare: FareBreakdown | Omit<FareBreakdown, "agentCommission"> & { agentCommission?: number };
  showCommission?: boolean;
}) {
  const line = (label: string, v: number, always = false) =>
    v > 0 || always ? (
      <div className="fare-line" key={label}>
        <span>{label}</span>
        <strong>{fmtINR(v)}</strong>
      </div>
    ) : null;

  return (
    <div className="fare-box">
      <div className="eyebrow">Fare breakdown</div>
      {line("Base fare", fare.baseFare, true)}
      {line("Driver bata", fare.driverBata, true)}
      {line("Night surcharge", fare.nightSurcharge)}
      {line("Inter-state taxes", fare.stateTaxes)}
      {line("Toll estimate", fare.tollEst)}
      {line("Platform fee", fare.platformFee, true)}
      {line("Agent service fee", fare.agentServiceCharge)}
      <div className="fare-line fare-total">
        <span>All-inclusive total</span>
        <span>{fmtINR(fare.totalFare)}</span>
      </div>
      {showCommission && (fare.agentCommission ?? 0) > 0 && (
        <p className="dim small" style={{ marginTop: 8 }}>
          Owner-paid agent commission: {fmtINR(fare.agentCommission ?? 0)} (deducted
          from owner settlement, not billed to the customer)
        </p>
      )}
      <p className="dim small" style={{ marginTop: 6 }}>
        Estimate with ±10% variance. Tolls/parking logged during the trip appear on
        the final invoice.
      </p>
    </div>
  );
}

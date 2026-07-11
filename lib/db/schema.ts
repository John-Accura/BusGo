import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  date,
  doublePrecision,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  phone: text("phone"),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull(), // customer | owner | agent | driver | admin
  suspended: boolean("suspended").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const ownerProfiles = pgTable("owner_profiles", {
  userId: integer("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  company: text("company"),
  city: text("city"),
  gstNo: text("gst_no"),
  paysCommission: boolean("pays_commission").notNull().default(false),
  commissionType: text("commission_type").notNull().default("percent"), // fixed | percent
  commissionValue: integer("commission_value").notNull().default(0),
});

export const agentProfiles = pgTable("agent_profiles", {
  userId: integer("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  agency: text("agency"),
  gstNo: text("gst_no"),
  serviceType: text("service_type").notNull().default("percent"), // fixed | percent
  serviceValue: integer("service_value").notNull().default(5),
});

export const driverProfiles = pgTable("driver_profiles", {
  userId: integer("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  ownerId: integer("owner_id")
    .notNull()
    .references(() => users.id),
  licenseNo: text("license_no"),
  experienceYears: integer("experience_years").notNull().default(3),
  currentLat: doublePrecision("current_lat"),
  currentLng: doublePrecision("current_lng"),
  locationAt: timestamp("location_at", { withTimezone: true }),
});

export const vehicles = pgTable("vehicles", {
  id: serial("id").primaryKey(),
  ownerId: integer("owner_id")
    .notNull()
    .references(() => users.id),
  name: text("name").notNull(),
  make: text("make"),
  model: text("model"),
  vclass: text("vclass").notNull(), // urbania | tempo_traveller | mini_bus | luxury_coach
  seats: integer("seats").notNull(),
  ac: boolean("ac").notNull().default(true),
  amenities: text("amenities").notNull().default(""),
  regNo: text("reg_no").notNull(),
  // pricing (₹)
  perKm: integer("per_km").notNull(),
  perDay: integer("per_day").notNull(),
  minFare: integer("min_fare").notNull().default(0),
  bataPerDay: integer("bata_per_day").notNull().default(400),
  nightPct: integer("night_pct").notNull().default(10),
  // home base for proximity sort
  baseCity: text("base_city").notNull().default(""),
  baseState: text("base_state").notNull().default(""),
  baseLat: doublePrecision("base_lat"),
  baseLng: doublePrecision("base_lng"),
  // compliance documents (auto-expiry system)
  permitType: text("permit_type").notNull().default("State"),
  permitExpiry: date("permit_expiry"),
  insuranceExpiry: date("insurance_expiry"),
  fitnessExpiry: date("fitness_expiry"),
  pucExpiry: date("puc_expiry"),
  // platform verification + owner instant block
  verifyStatus: text("verify_status").notNull().default("pending"), // pending | approved | rejected
  ownerActive: boolean("owner_active").notNull().default(true),
  ratingSum: integer("rating_sum").notNull().default(0),
  ratingCount: integer("rating_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const bookings = pgTable("bookings", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  status: text("status").notNull().default("requested"),
  tripType: text("trip_type").notNull(),
  // parties
  customerId: integer("customer_id").references(() => users.id), // null for agent guest bookings
  customerName: text("customer_name").notNull().default(""),
  customerPhone: text("customer_phone").notNull().default(""),
  agentId: integer("agent_id").references(() => users.id),
  ownerId: integer("owner_id")
    .notNull()
    .references(() => users.id),
  vehicleId: integer("vehicle_id")
    .notNull()
    .references(() => vehicles.id),
  driverId: integer("driver_id").references(() => users.id),
  // trip
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  days: integer("days").notNull().default(1),
  passengers: integer("passengers").notNull(),
  purpose: text("purpose").notNull().default("Tourism"),
  pickupAddr: text("pickup_addr").notNull(),
  pickupLat: doublePrecision("pickup_lat"),
  pickupLng: doublePrecision("pickup_lng"),
  dropAddr: text("drop_addr").notNull(),
  dropLat: doublePrecision("drop_lat"),
  dropLng: doublePrecision("drop_lng"),
  stopsJson: text("stops_json").notNull().default("[]"),
  statesJson: text("states_json").notNull().default("[]"),
  distanceKm: doublePrecision("distance_km").notNull(),
  nightTravel: boolean("night_travel").notNull().default(false),
  // fare breakdown (₹, locked at booking time)
  baseFare: integer("base_fare").notNull(),
  driverBata: integer("driver_bata").notNull(),
  nightSurcharge: integer("night_surcharge").notNull().default(0),
  stateTaxes: integer("state_taxes").notNull().default(0),
  tollEst: integer("toll_est").notNull().default(0),
  platformFee: integer("platform_fee").notNull(),
  agentServiceCharge: integer("agent_service_charge").notNull().default(0),
  agentCommission: integer("agent_commission").notNull().default(0),
  totalFare: integer("total_fare").notNull(),
  advanceRequired: integer("advance_required").notNull(),
  amountPaid: integer("amount_paid").notNull().default(0),
  paymentStatus: text("payment_status").notNull().default("unpaid"),
  // trip execution
  odometerStart: integer("odometer_start"),
  odometerEnd: integer("odometer_end"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  // lifecycle
  requestedAt: timestamp("requested_at", { withTimezone: true }).defaultNow(),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  declineReason: text("decline_reason"),
  rating: integer("rating"),
  ratingComment: text("rating_comment"),
});

export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  bookingId: integer("booking_id")
    .notNull()
    .references(() => bookings.id, { onDelete: "cascade" }),
  payerId: integer("payer_id").references(() => users.id),
  amount: integer("amount").notNull(), // negative = refund
  method: text("method").notNull().default("upi"),
  note: text("note").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const expenses = pgTable("expenses", {
  id: serial("id").primaryKey(),
  bookingId: integer("booking_id")
    .notNull()
    .references(() => bookings.id, { onDelete: "cascade" }),
  driverId: integer("driver_id").references(() => users.id),
  etype: text("etype").notNull(), // toll | parking | fuel | other
  amount: integer("amount").notNull(),
  note: text("note").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const disputes = pgTable("disputes", {
  id: serial("id").primaryKey(),
  bookingId: integer("booking_id")
    .notNull()
    .references(() => bookings.id, { onDelete: "cascade" }),
  raisedBy: integer("raised_by").references(() => users.id),
  message: text("message").notNull(),
  status: text("status").notNull().default("open"), // open | resolved
  resolution: text("resolution"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
});

export const stateTaxes = pgTable("state_taxes", {
  state: text("state").primaryKey(),
  entryTax: integer("entry_tax").notNull().default(500),
  perPassenger: integer("per_passenger").notNull().default(0),
});

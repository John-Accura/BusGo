// BusGo end-to-end smoke test.
// Runs the full booking lifecycle against a live server using fresh accounts:
//   owner → vehicle → admin approval → customer → search → book → confirm →
//   pay → assign driver → start → expense → complete → rate.
//
// Usage:  node scripts/smoke.mjs           (against http://localhost:3300)
//         BASE_URL=https://… node scripts/smoke.mjs
//
// Expects the simulated payment gateway (no RAZORPAY_* keys on the server).

const BASE = process.env.BASE_URL ?? "http://localhost:3300";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@busgo.local";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "admin@123";

const ts = Date.now().toString(36);
let passed = 0;
let failed = 0;

function ok(name, cond, extra = "") {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}${extra ? ` — ${extra}` : ""}`);
  }
}

function fatal(name, extra = "") {
  ok(name, false, extra);
  console.error(`\nFATAL: cannot continue.\n`);
  process.exit(1);
}

class Client {
  constructor(label) {
    this.label = label;
    this.cookies = {};
  }
  async req(path, { method = "GET", body } = {}) {
    const res = await fetch(BASE + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        cookie: Object.entries(this.cookies)
          .map(([k, v]) => `${k}=${v}`)
          .join("; "),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [pair] = c.split(";");
      const idx = pair.indexOf("=");
      this.cookies[pair.slice(0, idx)] = pair.slice(idx + 1);
    }
    const data = await res.json().catch(() => null);
    return { status: res.status, data };
  }
}

const dPlus = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const pickup = { lat: 9.9816, lng: 76.2999, addr: "Kochi, Kerala", state: "Kerala" };
const drop = { lat: 9.4981, lng: 76.3388, addr: "Alappuzha, Kerala", state: "Kerala" };

console.log(`\nBusGo smoke test → ${BASE}\n`);

// 0. health
{
  const c = new Client("probe");
  const h = await c.req("/api/health");
  if (!(h.status === 200 && h.data?.ok)) fatal("health check", `status ${h.status}`);
  ok("health check (app + db)", true);
}

// 1. owner: register, add driver, add vehicle
const owner = new Client("owner");
{
  const r = await owner.req("/api/auth/register", {
    method: "POST",
    body: {
      role: "owner",
      name: `Smoke Owner ${ts}`,
      email: `owner-${ts}@smoke.local`,
      password: "smoke123",
      company: `Smoke Fleet ${ts}`,
      city: "Kochi",
    },
  });
  if (r.status !== 200) fatal("owner registration", JSON.stringify(r.data));
  ok("owner registration", true);

  const d = await owner.req("/api/owner/drivers", {
    method: "POST",
    body: {
      name: `Smoke Driver ${ts}`,
      email: `driver-${ts}@smoke.local`,
      password: "smoke123",
      licenseNo: `KL-SMK-${ts}`,
      experienceYears: 6,
    },
  });
  ok("owner adds driver", d.status === 200, JSON.stringify(d.data));

  const v = await owner.req("/api/owner/vehicles", {
    method: "POST",
    body: {
      name: `Smoke Traveller ${ts}`,
      vclass: "tempo_traveller",
      seats: 15,
      ac: true,
      regNo: `KL-99-SM-${ts.slice(-4).toUpperCase()}`,
      perKm: 30,
      perDay: 8000,
      minFare: 2500,
      bataPerDay: 400,
      nightPct: 10,
      baseCity: "Kochi",
      baseState: "Kerala",
      baseLat: 9.98,
      baseLng: 76.3,
      permitType: "All India",
      permitExpiry: dPlus(200),
      insuranceExpiry: dPlus(200),
      fitnessExpiry: dPlus(200),
      pucExpiry: dPlus(200),
    },
  });
  ok("owner lists vehicle (pending)", v.status === 200, JSON.stringify(v.data));
}

// 2. admin: approve the vehicle
const admin = new Client("admin");
let vehicleId = 0;
{
  const r = await admin.req("/api/auth/login", {
    method: "POST",
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  if (r.status !== 200) fatal("admin login", JSON.stringify(r.data));
  ok("admin login", true);

  const ov = await admin.req("/api/admin/overview");
  const pending = ov.data?.pendingVehicles?.find((v) =>
    v.name.includes(`Smoke Traveller ${ts}`),
  );
  if (!pending) fatal("vehicle appears in verification queue");
  ok("vehicle appears in verification queue", true);
  vehicleId = pending.id;

  const verdict = await admin.req(`/api/admin/vehicles/${vehicleId}/verdict`, {
    method: "POST",
    body: { approve: true },
  });
  ok("admin approves vehicle", verdict.status === 200);
}

// 3. customer: register, search, book
const customer = new Client("customer");
let bookingId = 0;
{
  const r = await customer.req("/api/auth/register", {
    method: "POST",
    body: {
      role: "customer",
      name: `Smoke Customer ${ts}`,
      email: `customer-${ts}@smoke.local`,
      password: "smoke123",
      phone: "+919800099999",
    },
  });
  ok("customer registration", r.status === 200, JSON.stringify(r.data));

  const q = new URLSearchParams({
    passengers: "8",
    start: dPlus(12),
    end: dPlus(12),
    lat: String(pickup.lat),
    lng: String(pickup.lng),
  });
  const s = await customer.req(`/api/search?${q}`);
  const found = s.data?.results?.find((v) => v.id === vehicleId);
  if (!found) fatal("approved vehicle appears in search");
  ok("approved vehicle appears in search", true);

  const b = await customer.req("/api/bookings", {
    method: "POST",
    body: {
      vehicleId,
      tripType: "one_way",
      startDate: dPlus(12),
      endDate: dPlus(12),
      passengers: 8,
      purpose: "Tourism",
      pickup,
      drop,
      stops: [],
      distanceKm: 65,
      nightTravel: false,
    },
  });
  if (b.status !== 200) fatal("booking created", JSON.stringify(b.data));
  bookingId = b.data.booking.id;
  const f = b.data.booking.fare;
  ok("booking created (requested)", b.data.booking.status === "requested");
  const sum =
    f.baseFare +
    f.driverBata +
    f.nightSurcharge +
    f.stateTaxes +
    f.tollEst +
    f.platformFee +
    f.agentServiceCharge;
  ok("fare lines add up to total", sum === f.totalFare, `${sum} vs ${f.totalFare}`);
  ok(
    "advance tier is 50% (12 days out)",
    b.data.booking.advanceRequired === Math.round(f.totalFare * 0.5),
    `${b.data.booking.advanceRequired} vs ${Math.round(f.totalFare * 0.5)}`,
  );
}

// 4. owner confirms, customer pays, owner assigns driver
let driverUserId = 0;
{
  const c = await owner.req(`/api/bookings/${bookingId}/confirm`, { method: "POST" });
  ok("owner confirms booking", c.data?.booking?.status === "confirmed");

  const pay1 = await customer.req(`/api/bookings/${bookingId}/pay`, {
    method: "POST",
    body: { method: "upi" },
  });
  if (pay1.data?.gateway !== "simulated")
    fatal("simulated gateway active", `gateway=${pay1.data?.gateway}`);
  ok("advance payment (simulated)", pay1.data.booking.paymentStatus === "advance_paid");

  const pay2 = await customer.req(`/api/bookings/${bookingId}/pay`, {
    method: "POST",
    body: { method: "upi" },
  });
  ok("balance payment → fully paid", pay2.data?.booking?.paymentStatus === "paid");

  const dash = await owner.req("/api/owner/dashboard");
  driverUserId = dash.data?.drivers?.[0]?.userId;
  const assign = await owner.req(`/api/bookings/${bookingId}/assign-driver`, {
    method: "POST",
    body: { driverId: driverUserId },
  });
  ok("driver assigned", assign.data?.booking?.driver?.id === driverUserId);
}

// 5. driver runs the trip
const driver = new Client("driver");
{
  const r = await driver.req("/api/auth/login", {
    method: "POST",
    body: { email: `driver-${ts}@smoke.local`, password: "smoke123" },
  });
  ok("driver login", r.status === 200);

  const start = await driver.req(`/api/bookings/${bookingId}/start`, {
    method: "POST",
    body: { odometer: 10000 },
  });
  ok("trip started (odometer)", start.data?.booking?.status === "started");

  const exp = await driver.req(`/api/bookings/${bookingId}/expenses`, {
    method: "POST",
    body: { etype: "toll", amount: 120, note: "Smoke toll" },
  });
  ok("expense logged", exp.status === 200);

  const done = await driver.req(`/api/bookings/${bookingId}/complete`, {
    method: "POST",
    body: { odometer: 10068 },
  });
  ok("trip completed", done.data?.booking?.status === "completed");
  ok("actual km from odometer", done.data?.booking?.actualKm === 68);
}

// 6. customer rates; settlement sanity
{
  const rate = await customer.req(`/api/bookings/${bookingId}/rate`, {
    method: "POST",
    body: { rating: 5, comment: "Smoke test five stars" },
  });
  ok("customer rates trip", rate.data?.booking?.rating === 5);

  const ov = await admin.req("/api/admin/overview");
  const st = ov.data?.settlements?.find((s) => s.bookingId === bookingId);
  ok("settlement row exists", !!st);
  if (st)
    ok(
      "settlement split sums to total",
      st.ownerPayout + st.agentPayout + st.platformRevenue === st.totalFare,
      JSON.stringify(st),
    );
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);

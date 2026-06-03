/**
 * One-shot test: submit a minimal order through POST /api/woo/order
 * and confirm it reaches Presentail OS.
 *
 * Usage: pnpm --filter @workspace/scripts run test-os-order
 *
 * The order uses "western-union" (offline) payment so no Stripe/Mamo
 * payment verification is required. Items have no wcId so catalog price
 * lookup is skipped — the fee amount is taken directly.
 */

const API_BASE = process.env.API_BASE_URL ?? "http://localhost:80";

const payload = {
  orderId: `test-os-${Date.now()}`,
  billing: {
    firstName: "Test",
    lastName: "Buyer",
    email: "test-os-order@presentail.com",
    phone: "+96170000000",
  },
  recipient: {
    firstName: "Test",
    lastName: "Recipient",
    phone: "+96170000001",
  },
  items: [
    {
      // No wcId → treated as a non-catalog fee item; price taken as-is
      name: "Test Arrangement",
      quantity: 1,
      price: 50,
    },
  ],
  district: "Beirut",
  deliveryDate: "2026-06-10",
  deliverySlot: "",
  districtFee: 0,
  expressFee: 0,
  currencyCode: "USD",
  paymentMethod: "western",
  // No paymentRef → offline payment, no verification required
  cardMessage: "Test order from OS integration test",
  cardFrom: "Test Suite",
  cardTo: "Test Recipient",
  identitySecret: false,
};

async function run() {
  console.log(`\nPosting test order ${payload.orderId} to ${API_BASE}/api/woo/order …\n`);
  console.log("Payload:", JSON.stringify(payload, null, 2));

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/woo/order`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (err: any) {
    console.error("\n❌ Network error:", err.message);
    process.exit(1);
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    body = await res.text();
  }

  console.log(`\nHTTP ${res.status}`);
  console.log("Response:", JSON.stringify(body, null, 2));

  const parsed = body as Record<string, unknown>;
  if (res.ok && parsed?.ok === true) {
    console.log("\n✅ Order submitted successfully!");
    if (parsed.osOrderId) {
      console.log("   OS order ID:", parsed.osOrderId);
    } else {
      console.log("   (osOrderId not returned — check if OS API key has write access)");
    }
  } else {
    console.error("\n❌ Order failed:", parsed?.message ?? res.status);
    process.exit(1);
  }
}

run();

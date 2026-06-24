import Stripe from "stripe";
import { logger } from "./logger";

const APPLE_PAY_DOMAIN = "new.presentail.com";

/**
 * Register the production domain with Stripe's Apple Pay registry.
 * Must be called after the server is listening so the domain verification
 * file is already being served at /.well-known/apple-developer-merchantid-domain-association.
 *
 * Treats a "domain_already_exists" error as success — the call is idempotent.
 * Skips silently when STRIPE_SECRET_KEY is unset (local dev / CI).
 */
async function registerDomainOnAccount(key: string, label: string): Promise<void> {
  const stripe = new Stripe(key);
  try {
    await stripe.applePayDomains.create({ domain_name: APPLE_PAY_DOMAIN });
    logger.info({ domain: APPLE_PAY_DOMAIN, account: label }, "Stripe Apple Pay domain registered");
  } catch (err: unknown) {
    const stripeErr = err as { type?: string; code?: string; message?: string };
    if (stripeErr?.code === "domain_already_exists") {
      logger.info(
        { domain: APPLE_PAY_DOMAIN, account: label },
        "Stripe Apple Pay domain already registered — skipping",
      );
      return;
    }
    logger.warn(
      { domain: APPLE_PAY_DOMAIN, account: label, err },
      "Stripe Apple Pay domain registration failed — Apple Pay may not work until domain is registered manually",
    );
  }
}

export async function registerStripeApplePayDomains(): Promise<void> {
  const mainKey = process.env.STRIPE_SECRET_KEY;
  if (!mainKey) {
    logger.info("STRIPE_SECRET_KEY not set — skipping Stripe Apple Pay domain registration");
    return;
  }

  const promises: Promise<void>[] = [registerDomainOnAccount(mainKey, "main")]; // i18n-ignore

  const gulfKey = process.env.STRIPE_SECRET_KEY_GULF;
  if (gulfKey && gulfKey !== mainKey) {
    promises.push(registerDomainOnAccount(gulfKey, "gulf")); // i18n-ignore
  }

  await Promise.all(promises);
}

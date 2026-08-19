const fs = require('fs');
let content = fs.readFileSync('artifacts/presentail-web/src/pages/CampaignLanding.tsx', 'utf8');

const hookLogic = `
  // ── First-order promo eligibility ─────────────────────────────────────────
  const [promoEligible, setPromoEligible] = useState(false);
  useEffect(() => {
    let cancelled = false;
    import("@/lib/campaign").then(({ hasOrderedLocally }) => {
      if (hasOrderedLocally()) return;
      import("@/lib/api").then(({ apiFetch }) => {
        apiFetch<{ ok: boolean; eligible: boolean; known: boolean }>("/campaign/first-order-eligibility")
          .then((r) => {
            if (!cancelled && r.ok && r.eligible) setPromoEligible(true);
          })
          .catch(() => {
            if (!cancelled) setPromoEligible(true);
          });
      });
    });
    return () => { cancelled = true; };
  }, [language]); // Just an effect once

  const promoImpressionFired = useRef(false);
  useEffect(() => {
    if (!promoEligible || promoImpressionFired.current) return;
    promoImpressionFired.current = true;
    import("@/lib/campaign").then(({ markFirstOrderPromoShown }) => {
      markFirstOrderPromoShown();
      fireCampaignEvent("campaign_promo_impression");
    });
  }, [promoEligible]);
`;

// It's safer to just rewrite the file fully with WriteFile or replace in React directly.

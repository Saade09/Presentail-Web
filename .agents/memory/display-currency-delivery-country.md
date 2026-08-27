---
name: Display currency vs delivery country
description: Keep global shopper currency independent from gift destination, with a narrow exception for market-native campaign merchandising.
---

Do not feed the selected delivery country into the global display-currency resolver. The visitor's manual choice or IP-based location remains the source of truth across the storefront.

Market-native campaign landing pages may explicitly lock their campaign trust message and campaign product rails to the campaign market's currency when native-market pricing is part of that page's promise.

**Why:** A remote visitor opening a UAE campaign route correctly resolved to USD globally, but that made the UAE campaign advertise USD despite explicitly promising AED pricing. Changing the global resolver would break shoppers sending gifts across countries.

**How to apply:** Keep the exception local to campaign merchandising and price presentation. Do not mutate the global currency resolver, cart currency, checkout currency, or stored shopper preference from the delivery route.
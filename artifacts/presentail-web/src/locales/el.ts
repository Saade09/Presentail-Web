import { navStrings, navStringsEl } from "./nav?locale=el";
import { homeStrings, homeStringsEl } from "./home?locale=el";
import { shopStrings, shopStringsEl } from "./shop?locale=el";
import { productStrings, productStringsEl } from "./product?locale=el";
import { cartStrings, cartStringsEl } from "./cart?locale=el";
import { checkoutStrings, checkoutStringsEl } from "./checkout?locale=el";
import { accountStrings, accountStringsEl } from "./account?locale=el";
import { authStrings, authStringsEl } from "./auth?locale=el";
import { brandsStrings, brandsStringsEl } from "./brands?locale=el";
import { orderStrings, orderStringsEl } from "./order?locale=el";
import { seoStrings, seoStringsEl } from "./seo?locale=el";
import { footerStrings, footerStringsEl } from "./footer?locale=el";
import { commonStrings, commonStringsEl } from "./common?locale=el";
import { partnerStrings, partnerStringsEl } from "./partner?locale=el";
import { campaignStrings, campaignStringsEl } from "./campaign?locale=el";
import { withEnglishFallback } from "./table";

export const STRINGS_EL: Record<string, string> = withEnglishFallback(
  [navStrings, homeStrings, shopStrings, productStrings, cartStrings, checkoutStrings, accountStrings, authStrings, brandsStrings, orderStrings, seoStrings, footerStrings, commonStrings, partnerStrings, campaignStrings],
  [{
  ...navStringsEl,
  ...homeStringsEl,
  ...shopStringsEl,
  ...productStringsEl,
  ...cartStringsEl,
  ...checkoutStringsEl,
  ...accountStringsEl,
  ...authStringsEl,
  ...brandsStringsEl,
  ...orderStringsEl,
  ...seoStringsEl,
  ...footerStringsEl,
  ...commonStringsEl,
  ...partnerStringsEl,
  ...campaignStringsEl,
  }],
);
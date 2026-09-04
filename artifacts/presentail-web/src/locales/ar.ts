import { navStrings } from "./nav?locale=ar";
import { homeStrings } from "./home?locale=ar";
import { shopStrings } from "./shop?locale=ar";
import { productStrings } from "./product?locale=ar";
import { cartStrings } from "./cart?locale=ar";
import { checkoutStrings } from "./checkout?locale=ar";
import { accountStrings } from "./account?locale=ar";
import { authStrings } from "./auth?locale=ar";
import { brandsStrings } from "./brands?locale=ar";
import { orderStrings } from "./order?locale=ar";
import { seoStrings } from "./seo?locale=ar";
import { footerStrings } from "./footer?locale=ar";
import { commonStrings } from "./common?locale=ar";
import { partnerStrings } from "./partner?locale=ar";
import { campaignStrings } from "./campaign?locale=ar";
import { pickLanguageStrings } from "./table";

export const STRINGS_AR = pickLanguageStrings(
  [navStrings, homeStrings, shopStrings, productStrings, cartStrings, checkoutStrings, accountStrings, authStrings, brandsStrings, orderStrings, seoStrings, footerStrings, commonStrings, partnerStrings, campaignStrings],
  "ar",
);
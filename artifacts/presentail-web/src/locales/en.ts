import { navStrings } from "./nav?locale=en";
import { homeStrings } from "./home?locale=en";
import { shopStrings } from "./shop?locale=en";
import { productStrings } from "./product?locale=en";
import { cartStrings } from "./cart?locale=en";
import { checkoutStrings } from "./checkout?locale=en";
import { accountStrings } from "./account?locale=en";
import { authStrings } from "./auth?locale=en";
import { brandsStrings } from "./brands?locale=en";
import { orderStrings } from "./order?locale=en";
import { seoStrings } from "./seo?locale=en";
import { footerStrings } from "./footer?locale=en";
import { commonStrings } from "./common?locale=en";
import { partnerStrings } from "./partner?locale=en";
import { campaignStrings } from "./campaign?locale=en";
import { pickLanguageStrings } from "./table";

export const STRINGS_EN = pickLanguageStrings(
  [navStrings, homeStrings, shopStrings, productStrings, cartStrings, checkoutStrings, accountStrings, authStrings, brandsStrings, orderStrings, seoStrings, footerStrings, commonStrings, partnerStrings, campaignStrings],
  "en",
);
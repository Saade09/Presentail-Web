import { navStrings, navStringsFr } from "./nav?locale=fr";
import { homeStrings, homeStringsFr } from "./home?locale=fr";
import { shopStrings, shopStringsFr } from "./shop?locale=fr";
import { productStrings, productStringsFr } from "./product?locale=fr";
import { cartStrings, cartStringsFr } from "./cart?locale=fr";
import { checkoutStrings, checkoutStringsFr } from "./checkout?locale=fr";
import { accountStrings, accountStringsFr } from "./account?locale=fr";
import { authStrings, authStringsFr } from "./auth?locale=fr";
import { brandsStrings, brandsStringsFr } from "./brands?locale=fr";
import { orderStrings, orderStringsFr } from "./order?locale=fr";
import { seoStrings, seoStringsFr } from "./seo?locale=fr";
import { footerStrings, footerStringsFr } from "./footer?locale=fr";
import { commonStrings, commonStringsFr } from "./common?locale=fr";
import { partnerStrings, partnerStringsFr } from "./partner?locale=fr";
import { campaignStrings, campaignStringsFr } from "./campaign?locale=fr";
import { withEnglishFallback } from "./table";

export const STRINGS_FR: Record<string, string> = withEnglishFallback(
  [navStrings, homeStrings, shopStrings, productStrings, cartStrings, checkoutStrings, accountStrings, authStrings, brandsStrings, orderStrings, seoStrings, footerStrings, commonStrings, partnerStrings, campaignStrings],
  [{
  ...navStringsFr,
  ...homeStringsFr,
  ...shopStringsFr,
  ...productStringsFr,
  ...cartStringsFr,
  ...checkoutStringsFr,
  ...accountStringsFr,
  ...authStringsFr,
  ...brandsStringsFr,
  ...orderStringsFr,
  ...seoStringsFr,
  ...footerStringsFr,
  ...commonStringsFr,
  ...partnerStringsFr,
  ...campaignStringsFr,
  }],
);
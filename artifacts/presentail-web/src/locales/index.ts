import type { Dict } from "./types";

import { navStrings, navStringsFr } from "./nav";
import { homeStrings, homeStringsFr } from "./home";
import { shopStrings, shopStringsFr } from "./shop";
import { productStrings, productStringsFr } from "./product";
import { cartStrings, cartStringsFr } from "./cart";
import { checkoutStrings, checkoutStringsFr } from "./checkout";
import { accountStrings, accountStringsFr } from "./account";
import { authStrings, authStringsFr } from "./auth";
import { brandsStrings, brandsStringsFr } from "./brands";
import { orderStrings, orderStringsFr } from "./order";
import { seoStrings, seoStringsFr } from "./seo";
import { footerStrings, footerStringsFr } from "./footer";
import { commonStrings, commonStringsFr } from "./common";

export type { Dict };

export const STRINGS: Dict = {
  ...navStrings,
  ...homeStrings,
  ...shopStrings,
  ...productStrings,
  ...cartStrings,
  ...checkoutStrings,
  ...accountStrings,
  ...authStrings,
  ...brandsStrings,
  ...orderStrings,
  ...seoStrings,
  ...footerStrings,
  ...commonStrings,
};

export const STRINGS_FR: Record<string, string> = {
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
};

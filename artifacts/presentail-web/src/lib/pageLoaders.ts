// loadHomepageHeader and loadFooter moved to layoutLoaders.ts to break the
// HMR circular import: MainNavbar → pageLoaders → HomepageHeader → MainNavbar.

export const loadHome = () => import("@/pages/Home");
export const loadShop = () => import("@/pages/Shop");
export const loadProductDetail = () => import("@/pages/ProductDetail");
export const loadCart = () => import("@/pages/Cart");
export const loadCheckout = () => import("@/pages/Checkout");
export const loadSignIn = () => import("@/pages/SignIn");
export const loadSignUp = () => import("@/pages/SignUp");
export const loadAccount = () => import("@/pages/Account");
export const loadFavorites = () => import("@/pages/Favorites");
export const loadBrands = () => import("@/pages/Brands");
export const loadBrandDetail = () => import("@/pages/BrandDetail");
export const loadAllOccasions = () => import("@/pages/AllOccasions");

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from "react";
import { useLocation } from "wouter";
import {
  parseLocalePath,
  switchLanguage,
  isSupportedLang,
  type Lang,
} from "@/lib/locale-route";

export type Language = Lang;

type Entry = { en: string; ar: string };
type Dict = Record<string, Entry>;

const STRINGS: Dict = {
  // Top utility / nav
  "utility.deliverTo": { en: "Delivering to", ar: "التوصيل إلى" },
  "utility.help": { en: "Need help? We deliver across the GCC.", ar: "بحاجة إلى مساعدة؟ نوصّل في جميع أنحاء الخليج." },
  "nav.shop": { en: "Shop", ar: "تسوّق" },
  "nav.occasions": { en: "Occasions", ar: "المناسبات" },
  "nav.flowersPlants": { en: "Flowers & Plants", ar: "الأزهار والنباتات" },
  "nav.gifts": { en: "Gifts", ar: "الهدايا" },
  "nav.brands": { en: "Brands", ar: "العلامات" },
  "nav.about": { en: "About Us", ar: "من نحن" },
  "nav.searchAria": { en: "Search", ar: "بحث" },
  "nav.accountAria": { en: "Account", ar: "الحساب" },
  "nav.bagAria": { en: "Bag", ar: "الحقيبة" },
  "navbar.selectCity": { en: "Select city", ar: "اختر المدينة" },

  // Carousel / homepage
  "carousel.prev": { en: "Previous slide", ar: "الشريحة السابقة" },
  "carousel.next": { en: "Next slide", ar: "الشريحة التالية" },
  "bestSellers.title": { en: "Best Sellers", ar: "الأكثر مبيعاً" },
  "bestSellers.viewAll": { en: "View All", ar: "عرض الكل" },
  "lang.toggle": { en: "العربية", ar: "English" },
  "lang.label.en": { en: "English", ar: "English" },
  "lang.label.ar": { en: "العربية", ar: "العربية" },
  "lang.label.fr": { en: "Français", ar: "Français" },

  "categories.eyebrow": { en: "Curated Collections", ar: "تشكيلات مختارة" },
  "categories.title": { en: "Shop by Category", ar: "تسوّق حسب الفئة" },
  "categories.subtitle": {
    en: "From signature bouquets to artisanal cakes — every gift, beautifully presented.",
    ar: "من الباقات المميزة إلى الكعك الحرفي — كل هدية مقدّمة بأناقة.",
  },
  "categories.bouquets": { en: "Hand Bouquets", ar: "الباقات اليدوية" },
  "categories.boxes": { en: "Flower Boxes", ar: "صناديق الأزهار" },
  "categories.plants": { en: "Plants", ar: "النباتات" },
  "categories.cakes": { en: "Cakes", ar: "الكعك" },
  "categories.chocolate": { en: "Chocolate", ar: "الشوكولاتة" },
  "categories.gifts": { en: "Gift Sets", ar: "مجموعات الهدايا" },

  "occasions.eyebrow": { en: "For Every Moment", ar: "لكل لحظة" },
  "occasions.title": { en: "Shop by Occasion", ar: "تسوّق حسب المناسبة" },
  "occasions.subtitle": {
    en: "Find the perfect gesture for life's most meaningful days.",
    ar: "اعثر على اللمسة المثالية لأهمّ أيام الحياة.",
  },
  "occasions.birthday": { en: "Birthday", ar: "عيد ميلاد" },
  "occasions.romance": { en: "Love & Romance", ar: "الحب والرومانسية" },
  "occasions.anniversary": { en: "Anniversary", ar: "الذكرى السنوية" },
  "occasions.congrats": { en: "Congratulations", ar: "تهانينا" },
  "occasions.newBaby": { en: "New Baby", ar: "مولود جديد" },
  "occasions.thankYou": { en: "Thank You", ar: "شكراً لك" },
  "occasions.sympathy": { en: "Sympathy", ar: "تعازي" },
  "occasions.justBecause": { en: "Just Because", ar: "بدون سبب" },

  "brands.eyebrow": { en: "Maison Partners", ar: "شركاؤنا" },
  "brands.title": { en: "Brands We Love", ar: "علامات نحبّها" },
  "brands.subtitle": {
    en: "Hand-selected ateliers and chocolatiers, paired with our florals.",
    ar: "محترفون ومحلات شوكولاتة منتقاة بعناية، مع باقاتنا.",
  },
  "brands.viewAll": { en: "Discover All Brands", ar: "اكتشف كل العلامات" },

  "trust.delivery.title": { en: "Same-Day Delivery", ar: "توصيل في نفس اليوم" },
  "trust.delivery.desc": { en: "Order before 4pm across the GCC.", ar: "اطلب قبل الرابعة عصراً في الخليج." },
  "trust.fresh.title": { en: "Florist Guarantee", ar: "ضمان أزهارنا" },
  "trust.fresh.desc": { en: "Hand-arranged daily, freshness assured.", ar: "تنسيق يدوي يومي، نضارة مضمونة." },
  "trust.payment.title": { en: "Secure Checkout", ar: "دفع آمن" },
  "trust.payment.desc": { en: "Stripe, Mamo & PayPal protected.", ar: "محمي بـ Stripe وMamo وPayPal." },
  "trust.care.title": { en: "Concierge Care", ar: "خدمة شخصية" },
  "trust.care.desc": { en: "Real humans, ready to help 7 days.", ar: "فريق حقيقي لخدمتك ٧ أيام." },

  "editorial.eyebrow": { en: "The Atelier", ar: "الأتيليه" },
  "editorial.title": { en: "Designed with Love, Delivered with Care", ar: "مصمَّم بحب، يُسلَّم بعناية" },
  "editorial.body": {
    en: "Every Presentail arrangement begins in our Gemmayzeh studio — where seasonal blooms, hand-tied ribbons, and considered details come together. We believe a gift should feel like an event, not an errand.",
    ar: "تبدأ كل تنسيقات بريزانتيل في استوديو الجميزة لدينا — حيث تجتمع الأزهار الموسمية والأشرطة المنسوجة يدوياً والتفاصيل المدروسة. نؤمن بأن الهدية يجب أن تكون حدثاً، لا مهمّة.",
  },
  "editorial.cta": { en: "Our Story", ar: "قصّتنا" },
  "editorial.feature1.title": { en: "Seasonal Sourcing", ar: "مصادر موسمية" },
  "editorial.feature1.desc": { en: "Direct from the finest growers worldwide.", ar: "مباشرة من أفضل المزارعين حول العالم." },
  "editorial.feature2.title": { en: "Signature Wrapping", ar: "تغليف مميّز" },
  "editorial.feature2.desc": { en: "Our envelope-style boxes are made to keep.", ar: "علب على شكل مغلّف مصمّمة لتُحتفظ." },
  "editorial.badgeYears": { en: "12+", ar: "+12" },
  "editorial.badgeLabel": { en: "years of artistry", ar: "عاماً من الإبداع" },
  "editorial.imageAlt": { en: "Presentail atelier", ar: "أتيليه بريزانتيل" },

  "newsletter.eyebrow": { en: "Stay in Bloom", ar: "ابقَ مع الورد" },
  "newsletter.title": { en: "Join the Presentail List", ar: "انضم إلى قائمة بريزانتيل" },
  "newsletter.subtitle": {
    en: "Early access to seasonal collections, private events, and a 10% welcome offer.",
    ar: "وصول مبكّر للمجموعات الموسمية والفعاليات الخاصة، وعرض ترحيبي 10٪.",
  },
  "newsletter.placeholder": { en: "Your email address", ar: "بريدك الإلكتروني" },
  "newsletter.button": { en: "Subscribe", ar: "اشترك" },
  "newsletter.thanks": { en: "Welcome — check your inbox shortly.", ar: "أهلاً بك — تحقّق من بريدك قريباً." },

  // Location picker
  "locationPicker.sendGiftTo": { en: "Send your gift to:", ar: "أرسل هديتك إلى:" },
  "locationPicker.selectCountry": { en: "Select the recipient's country", ar: "اختر بلد المستلم" },
  "locationPicker.selectCity": { en: "Select the recipient's city", ar: "اختر مدينة المستلم" },
  "locationPicker.changeCountry": { en: "Change country", ar: "تغيير البلد" },
  "locationPicker.selectCountryLabel": { en: "Select Country", ar: "اختر البلد" },
  "locationPicker.selectCityLabel": { en: "Select City", ar: "اختر المدينة" },
  "locationPicker.close": { en: "Close", ar: "إغلاق" },
  "locationPicker.back": { en: "Back", ar: "رجوع" },
  "locationPicker.langLink": { en: "العربية", ar: "English" },
  "locationPickerGate.dialogTitle": { en: "Choose delivery location", ar: "اختر موقع التوصيل" },
  "locationPickerGate.dialogDesc": { en: "Select the country and city you want your gift delivered to.", ar: "اختر البلد والمدينة التي تريد توصيل هديتك إليها." },

  // Shop page
  "shop.subtitle": { en: "Browse our curated selection of luxury floral designs and premium gifts, thoughtfully crafted for delivery in {country}.", ar: "تصفّح مجموعتنا المنتقاة من تصاميم الزهور الفاخرة والهدايا المميزة، المُعدّة بعناية للتوصيل في {country}." },
  "shop.sortPlaceholder": { en: "Sort by", ar: "ترتيب حسب" },
  "shop.sort.featured": { en: "Featured", ar: "المميزة" },
  "shop.sort.priceAsc": { en: "Price: Low to High", ar: "السعر: من الأقل إلى الأعلى" },
  "shop.sort.priceDesc": { en: "Price: High to Low", ar: "السعر: من الأعلى إلى الأقل" },
  "shop.filters": { en: "Filters", ar: "تصفية" },
  "shop.categoriesTitle": { en: "Categories", ar: "الفئات" },
  "shop.occasionsTitle": { en: "Occasions", ar: "المناسبات" },
  "shop.clearAll": { en: "Clear all filters", ar: "مسح جميع التصفية" },
  "shop.clearFiltersBtn": { en: "Clear filters", ar: "مسح التصفية" },
  "shop.clearFiltersBtnCap": { en: "Clear Filters", ar: "مسح التصفية" },
  "shop.allCollection": { en: "All Collection", ar: "كل المجموعة" },
  "shop.empty.titleCountry": { en: "No products available in {country}", ar: "لا توجد منتجات متاحة في {country}" },
  "shop.empty.descCountry": { en: "We couldn't find any products that can be delivered to {country} for your current filters. Try a different category or change your delivery country.", ar: "لم نتمكن من العثور على منتجات يمكن توصيلها إلى {country} وفق تصفيتك الحالية. جرّب فئة مختلفة أو غيّر بلد التوصيل." },
  "shop.empty.changeCountry": { en: "Change delivery country", ar: "تغيير بلد التوصيل" },
  "shop.empty.titleNoCountry": { en: "No products found", ar: "لم يتم العثور على منتجات" },
  "shop.empty.descNoCountry": { en: "We couldn't find any products matching your current filters.", ar: "لم نتمكن من العثور على منتجات تطابق تصفيتك الحالية." },
  "shop.empty.titleSoldOut": { en: "Everything here is currently sold out", ar: "نفدت كل المنتجات هنا حالياً" },
  "shop.empty.descSoldOut": { en: "New pieces are on the way. In the meantime, here are a few popular picks our customers love.", ar: "قطع جديدة في الطريق. في هذه الأثناء، إليك بعض الاختيارات الشهيرة التي يحبها زبائننا." },
  "shop.popularPicks": { en: "Popular picks", ar: "اختيارات شائعة" },
  "shop.browseAll": { en: "Browse all collections", ar: "تصفح كل المجموعات" },

  "shop.cat.handBouquets": { en: "Hand Bouquets", ar: "باقات يدوية" },
  "shop.cat.flowerBoxes": { en: "Flower Boxes", ar: "صناديق الزهور" },
  "shop.cat.plants": { en: "Plants", ar: "النباتات" },
  "shop.cat.cakes": { en: "Cakes", ar: "الكعك" },
  "shop.cat.chocolate": { en: "Chocolate", ar: "الشوكولاتة" },
  "shop.cat.bundles": { en: "Bundles", ar: "الباقات المجمعة" },

  "shop.occ.birthday": { en: "Birthday", ar: "عيد ميلاد" },
  "shop.occ.loveRomance": { en: "Love & Romance", ar: "الحب والرومانسية" },
  "shop.occ.congratulations": { en: "Congratulations", ar: "تهانينا" },
  "shop.occ.thankYou": { en: "Thank You", ar: "شكراً لك" },
  "shop.occ.condolences": { en: "Condolences", ar: "تعازي" },
  "shop.occ.romance": { en: "Romance", ar: "رومانسية" },

  // Product card / detail
  "product.toast.addedTitle": { en: "Added to cart", ar: "تمت الإضافة إلى الحقيبة" },
  "product.toast.addedDesc": { en: "{name} added to your bag.", ar: "تمت إضافة {name} إلى حقيبتك." },
  "product.toast.addedDescQty": { en: "{qty}x {name} added to your bag.", ar: "تمت إضافة {qty}× {name} إلى حقيبتك." },
  "product.notFound": { en: "Product Not Found", ar: "المنتج غير موجود" },
  "product.returnShop": { en: "Return to Shop", ar: "العودة إلى المتجر" },
  "product.backToShop": { en: "Back to Shop", ar: "العودة إلى المتجر" },
  "product.quantity": { en: "Quantity", ar: "الكمية" },
  "product.addToCart": { en: "Add to Cart", ar: "أضف إلى الحقيبة" },
  "product.outOfStock": { en: "Out of Stock", ar: "غير متوفر" },
  "product.sameDay": { en: "Same-day delivery in {country}", ar: "توصيل في نفس اليوم في {country}" },
  "product.secureCheckout": { en: "100% Secure Checkout", ar: "دفع آمن 100%" },
  "product.youMayLike": { en: "You May Also Like", ar: "قد يعجبك أيضاً" },
  "product.share.aria": { en: "Share product", ar: "مشاركة المنتج" },
  "product.share.copied.title": { en: "Link copied", ar: "تم نسخ الرابط" },
  "product.share.copied.desc": { en: "Product link copied to clipboard.", ar: "تم نسخ رابط المنتج إلى الحافظة." },
  "product.share.unavailable.title": { en: "Sharing unavailable", ar: "المشاركة غير متاحة" },
  "product.share.unavailable.desc": { en: "Couldn't share or copy the product link.", ar: "تعذرت مشاركة رابط المنتج أو نسخه." },

  // Cart
  "cart.empty.title": { en: "Your bag is empty", ar: "حقيبتك فارغة" },
  "cart.empty.desc": { en: "Find the perfect floral arrangement or luxury gift for your next special occasion.", ar: "اعثر على باقة الزهور أو الهدية الفاخرة المثالية لمناسبتك القادمة." },
  "cart.empty.cta": { en: "Start Shopping", ar: "ابدأ التسوّق" },
  "cart.title": { en: "Your Bag", ar: "حقيبتك" },
  "cart.summary": { en: "Order Summary", ar: "ملخص الطلب" },
  "cart.subtotal": { en: "Subtotal", ar: "المجموع الفرعي" },
  "cart.delivery": { en: "Delivery", ar: "التوصيل" },
  "cart.calculatedAtCheckout": { en: "Calculated at checkout", ar: "يُحسب عند الدفع" },
  "cart.total": { en: "Total", ar: "الإجمالي" },
  "cart.proceed": { en: "Proceed to Checkout", ar: "المتابعة إلى الدفع" },
  "cart.removeAria": { en: "Remove item", ar: "إزالة العنصر" },
  "cart.decreaseAria": { en: "Decrease quantity", ar: "تقليل الكمية" },
  "cart.increaseAria": { en: "Increase quantity", ar: "زيادة الكمية" },
  "cart.upsells.title": { en: "Make it perfect", ar: "اجعلها مثالية" },
  "cart.upsells.add": { en: "Add", ar: "إضافة" },
  "cart.upsells.express": { en: "Express", ar: "سريع" },
  "cart.upsells.tab.recommended": { en: "Recommended", ar: "موصى به" },
  "cart.upsells.tab.singleBalloons": { en: "Single Balloons", ar: "بالونات فردية" },
  "cart.upsells.tab.balloonBundles": { en: "Balloon Bundles", ar: "حزم بالونات" },
  "cart.upsells.tab.chocolate": { en: "Chocolate", ar: "شوكولاتة" },
  "cart.upsells.tab.plants": { en: "Plants", ar: "نباتات" },
  "cart.upsells.tab.bears": { en: "Bears", ar: "دببة" },
  "cart.upsells.tab.candles": { en: "Candles", ar: "شموع" },
  "auth.heroAlt": { en: "Presentail Atelier", ar: "أتيليه Presentail" },
  "checkout.payment.orderTitle": { en: "Presentail Order", ar: "طلب Presentail" },
  "checkout.payment.orderDesc": { en: "Order from {name}", ar: "طلب من {name}" },

  // Checkout
  "checkout.backToCart": { en: "Back to Cart", ar: "العودة إلى الحقيبة" },
  "checkout.empty.title": { en: "Your bag is empty", ar: "حقيبتك فارغة" },
  "checkout.empty.cta": { en: "Back to Shop", ar: "العودة إلى المتجر" },
  "checkout.step1.title": { en: "Who is receiving this?", ar: "من سيستلم هذه الهدية؟" },
  "checkout.step1.desc": { en: "Enter the recipient's details for delivery.", ar: "أدخل بيانات المستلم لتأكيد التوصيل." },
  "checkout.firstName": { en: "First Name", ar: "الاسم الأول" },
  "checkout.lastName": { en: "Last Name", ar: "اسم العائلة" },
  "checkout.firstNamePh": { en: "Jane", ar: "جين" },
  "checkout.lastNamePh": { en: "Doe", ar: "دو" },
  "checkout.phoneLB": { en: "Phone Number ({country})", ar: "رقم الهاتف ({country})" },
  "checkout.phonePh": { en: "+961 70 123 456", ar: "+961 70 123 456" },
  "checkout.district": { en: "Delivery District", ar: "منطقة التوصيل" },
  "checkout.selectDistrict": { en: "Select a district", ar: "اختر منطقة" },
  "checkout.address": { en: "Full Address Details", ar: "تفاصيل العنوان الكامل" },
  "checkout.addressPh": { en: "Street, Building, Floor...", ar: "الشارع، المبنى، الطابق..." },
  "checkout.dontKnowAddress": { en: "I don't know the address, please contact the recipient.", ar: "لا أعرف العنوان، يرجى التواصل مع المستقبِل." },
  "checkout.dontKnowAddressNote": { en: "Our team will contact the recipient to confirm the delivery address.", ar: "سيتواصل فريقنا مع المستقبِل لتأكيد عنوان التوصيل." },
  "checkout.deliveryDate": { en: "Delivery Date", ar: "تاريخ التوصيل" },
  "checkout.deliveryTime": { en: "Delivery Time", ar: "وقت التوصيل" },
  "checkout.deliveryWhen": { en: "When should we deliver?", ar: "متى ترغب بالتوصيل؟" },
  "checkout.expressDelivery": { en: "Express Delivery", ar: "توصيل سريع" },
  "checkout.expressDeliveryLabel": { en: "Express Delivery (1–3 hrs)", ar: "توصيل سريع (1-3 ساعات)" },
  "checkout.expressUnavailable": { en: "Available 8 AM – 10 PM", ar: "متوفر من 8 صباحاً حتى 10 مساءً" },
  "checkout.scheduleDelivery": { en: "Schedule", ar: "جدولة" },
  "checkout.scheduleDeliveryDesc": { en: "Pick a date & time", ar: "اختر التاريخ والوقت" },
  "checkout.cardMessage": { en: "Card Message (Optional)", ar: "رسالة البطاقة (اختياري)" },
  "checkout.cardMessagePh": { en: "Write a note to go with your gift", ar: "اكتب ملاحظة ترفق مع هديتك" },
  "checkout.continueSender": { en: "Continue to Sender Details", ar: "المتابعة إلى بيانات المُرسِل" },
  "checkout.step2.title": { en: "Sender Details", ar: "بيانات المُرسِل" },
  "checkout.step2.desc": { en: "We need this to send your receipt and updates.", ar: "نحتاج إلى هذه البيانات لإرسال الإيصال والتحديثات." },
  "checkout.keepIdentitySecret": { en: "Keep my identity secret.", ar: "إبقاء هويتي سرية." },
  "checkout.emailAddress": { en: "Email Address", ar: "البريد الإلكتروني" },
  "checkout.phoneNumber": { en: "Phone Number", ar: "رقم الهاتف" },
  "checkout.back": { en: "Back", ar: "رجوع" },
  "checkout.continuePayment": { en: "Continue to Payment", ar: "المتابعة إلى الدفع" },
  "checkout.step3.title": { en: "Payment", ar: "الدفع" },
  "checkout.step3.desc": { en: "Choose how you'd like to pay securely. You'll be redirected to your provider to complete payment.", ar: "اختر طريقة الدفع الآمنة. ستتم إعادة توجيهك إلى مزوّد الدفع لإكمال العملية." },
  "checkout.pay.card": { en: "Credit / Debit Card (Stripe)", ar: "بطاقة ائتمان / خصم (Stripe)" },
  "checkout.pay.paypal": { en: "PayPal", ar: "PayPal" },
  "checkout.pay.mamo": { en: "Mamo (UAE Wallets)", ar: "مامو (محافظ الإمارات)" },
  "checkout.pay.whish": { en: "Whish Money (pay on confirmation)", ar: "Whish Money (الدفع عند التأكيد)" },
  "checkout.processing": { en: "Processing...", ar: "جارٍ المعالجة..." },
  "checkout.payAmount": { en: "Pay ${amount}", ar: "ادفع ${amount}" },
  "checkout.summary": { en: "Order Summary", ar: "ملخص الطلب" },
  "checkout.qty": { en: "Qty", ar: "الكمية" },
  "checkout.deliveryEstimated": { en: "Delivery (Estimated)", ar: "التوصيل (تقديري)" },
  "checkout.toast.failTitle": { en: "Checkout Failed", ar: "فشلت عملية الدفع" },
  "checkout.toast.failGeneric": { en: "An error occurred", ar: "حدث خطأ ما" },
  "checkout.toast.cardUnavailable": { en: "Payment unavailable", ar: "الدفع غير متوفر" },
  "checkout.toast.cardUnavailableDesc": { en: "Card payments aren't available right now.", ar: "الدفع بالبطاقة غير متوفر حالياً." },
  "checkout.toast.paypalUnavailable": { en: "PayPal unavailable", ar: "PayPal غير متوفر" },
  "checkout.toast.paypalUnavailableDesc": { en: "PayPal isn't available right now.", ar: "PayPal غير متوفر حالياً." },
  "checkout.toast.mamoUnavailable": { en: "Mamo unavailable", ar: "مامو غير متوفر" },
  "checkout.toast.mamoUnavailableDesc": { en: "Mamo isn't available right now.", ar: "مامو غير متوفر حالياً." },
  "checkout.toast.errorTitle": { en: "Checkout Error", ar: "خطأ في الدفع" },

  // Account
  "account.loading": { en: "Loading...", ar: "جارٍ التحميل..." },
  "account.title": { en: "My Account", ar: "حسابي" },
  "account.profile": { en: "Profile Details", ar: "بيانات الحساب" },
  "account.orders": { en: "Order History", ar: "سجل الطلبات" },
  "account.addresses": { en: "Saved Addresses", ar: "العناوين المحفوظة" },
  "account.signOut": { en: "Sign Out", ar: "تسجيل الخروج" },
  "account.firstName": { en: "First Name", ar: "الاسم الأول" },
  "account.lastName": { en: "Last Name", ar: "اسم العائلة" },
  "account.email": { en: "Email Address", ar: "البريد الإلكتروني" },
  "account.phone": { en: "Phone Number", ar: "رقم الهاتف" },
  "account.notProvided": { en: "Not provided", ar: "غير مُحدّد" },
  "account.soon": { en: "Soon", ar: "قريباً" },
  "account.orders.empty": { en: "You haven't placed any orders yet.", ar: "لم تقم بأي طلبات بعد." },
  "account.orders.loading": { en: "Loading your orders...", ar: "جارٍ تحميل طلباتك..." },
  "account.orders.error": { en: "We couldn't load your orders right now.", ar: "تعذّر تحميل طلباتك الآن." },
  "account.orders.orderNumber": { en: "Order", ar: "طلب" },
  "account.orders.placedOn": { en: "Placed on", ar: "تم الطلب في" },
  "account.orders.deliveryFor": { en: "Delivery for", ar: "تسليم إلى" },
  "account.orders.itemsCount": { en: "items", ar: "عناصر" },
  "account.orders.itemCount": { en: "item", ar: "عنصر" },

  // Auth
  "auth.welcome": { en: "Welcome Back", ar: "مرحباً بعودتك" },
  "auth.create": { en: "Create Account", ar: "إنشاء حساب" },
  "auth.signinDesc": { en: "Sign in to manage your orders and addresses.", ar: "سجّل الدخول لإدارة طلباتك وعناوينك." },
  "auth.signupDesc": { en: "Join Presentail for a faster checkout experience.", ar: "انضم إلى Presentail لتجربة دفع أسرع." },
  "auth.firstName": { en: "First Name", ar: "الاسم الأول" },
  "auth.lastName": { en: "Last Name", ar: "اسم العائلة" },
  "auth.email": { en: "Email", ar: "البريد الإلكتروني" },
  "auth.password": { en: "Password", ar: "كلمة المرور" },
  "auth.signin": { en: "Sign In", ar: "تسجيل الدخول" },
  "auth.signup": { en: "Sign Up", ar: "إنشاء حساب" },
  "auth.noAccount": { en: "Don't have an account? ", ar: "ليس لديك حساب؟ " },
  "auth.haveAccount": { en: "Already have an account? ", ar: "لديك حساب بالفعل؟ " },
  "auth.quote": { en: "\"Every arrangement tells a story of affection, crafted with intention and delivered with care.\"", ar: "\"كل باقة تروي قصة محبة، تُصنع بنيّة طيبة وتُسلَّم بعناية.\"" },
  "auth.atelier": { en: "The Presentail Atelier", ar: "أتيليه Presentail" },
  "auth.toast.loginFailed": { en: "Login Failed", ar: "فشل تسجيل الدخول" },
  "auth.toast.invalidCreds": { en: "Invalid credentials", ar: "بيانات الاعتماد غير صحيحة" },
  "auth.toast.created": { en: "Account created", ar: "تم إنشاء الحساب" },
  "auth.toast.createdDesc": { en: "Please sign in with your new credentials.", ar: "يرجى تسجيل الدخول ببياناتك الجديدة." },
  "auth.toast.regFailed": { en: "Registration Failed", ar: "فشل التسجيل" },
  "auth.toast.regFailedDesc": { en: "Could not create account", ar: "تعذّر إنشاء الحساب" },
  "auth.toast.error": { en: "Error", ar: "خطأ" },
  "auth.continue": { en: "Continue", ar: "متابعة" },
  "auth.emailStepDesc": { en: "Enter your email to sign in or create an account.", ar: "أدخل بريدك الإلكتروني لتسجيل الدخول أو إنشاء حساب." },
  "auth.changeEmail": { en: "Use a different email", ar: "استخدم بريدًا إلكترونيًا آخر" },
  "auth.accountFound": { en: "Account found. Please log in.", ar: "تم العثور على الحساب. الرجاء تسجيل الدخول." },
  "auth.checkFailed": { en: "Something went wrong, please try again.", ar: "حدث خطأ ما، يرجى المحاولة مرة أخرى." },
  "auth.invalidEmail": { en: "Please enter a valid email.", ar: "يرجى إدخال بريد إلكتروني صالح." },
  "auth.forgotPassword": { en: "Forgot password?", ar: "نسيت كلمة المرور؟" },
  "auth.forgotTitle": { en: "Reset your password", ar: "إعادة تعيين كلمة المرور" },
  "auth.forgotDesc": { en: "We'll email you a link to set a new password.", ar: "سنرسل إليك رابطًا عبر البريد الإلكتروني لتعيين كلمة مرور جديدة." },
  "auth.forgotSend": { en: "Send reset link", ar: "إرسال رابط إعادة التعيين" },
  "auth.forgotSentTitle": { en: "Check your email", ar: "تحقق من بريدك الإلكتروني" },
  "auth.forgotSentDesc": { en: "If an account exists for {email}, you'll receive a reset link shortly.", ar: "إذا كان هناك حساب مرتبط بـ {email}, فستتلقى رابط إعادة التعيين قريبًا." },
  "auth.forgotResend": { en: "Resend email", ar: "إعادة إرسال البريد" },
  "auth.showPassword": { en: "Show password", ar: "إظهار كلمة المرور" },
  "auth.hidePassword": { en: "Hide password", ar: "إخفاء كلمة المرور" },
  "auth.forgotBackToSignIn": { en: "Back to sign in", ar: "العودة إلى تسجيل الدخول" },
  "auth.forgotFailed": { en: "Couldn't send reset email. Please try again.", ar: "تعذّر إرسال بريد إعادة التعيين. يرجى المحاولة مرة أخرى." },
  "auth.cardHeading": { en: "Login or Create Account", ar: "تسجيل الدخول أو إنشاء حساب" },
  "auth.cardSubheading": { en: "Sign in with your email address", ar: "سجّل الدخول باستخدام بريدك الإلكتروني" },
  "auth.emailLabel": { en: "Email Address", ar: "البريد الإلكتروني" },
  "auth.emailPlaceholder": { en: "Enter your email address", ar: "أدخل بريدك الإلكتروني" },
  "auth.or": { en: "Or", ar: "أو" },
  "auth.continueApple": { en: "Continue with Apple", ar: "المتابعة باستخدام Apple" },
  "auth.continueGoogle": { en: "Continue with Google", ar: "المتابعة باستخدام Google" },
  "auth.toast.oauthFailed": { en: "{provider} sign-in failed", ar: "فشل تسجيل الدخول عبر {provider}" },

  // Checkout login prompt (shown when a logged-out shopper taps Checkout)
  "checkoutLogin.title": { en: "Sign in for a faster checkout", ar: "سجّل الدخول لإتمام الدفع بسرعة" },
  "checkoutLogin.desc": { en: "Save your details for next time, or continue as a guest.", ar: "احفظ بياناتك للمرة القادمة، أو تابع كضيف." },
  "checkoutLogin.guest": { en: "Checkout as Guest", ar: "إتمام الدفع كضيف" },

  // Brands
  "brandsPage.title": { en: "Our Partner Brands", ar: "علاماتنا الشريكة" },
  "brands.desc": { en: "Discover our curated selection of luxury gifting brands, from artisan chocolatiers to premium florists.", ar: "اكتشف مجموعتنا المنتقاة من علامات الهدايا الفاخرة، من صنّاع الشوكولاتة الحرفيين إلى أرقى محلات الزهور." },
  "brands.products": { en: "products", ar: "منتجات" },
  "brand.backToBrands": { en: "Back to Brands", ar: "العودة إلى العلامات" },
  "brand.descPrefix": { en: "Explore the complete collection from {name}.", ar: "استكشف المجموعة الكاملة من {name}." },
  "brand.empty.titleCountry": { en: "No products available in {country}", ar: "لا توجد منتجات متاحة في {country}" },
  "brand.empty.descCountry": { en: "{name} doesn't currently deliver any products to {country}. Try changing your delivery country to see more options.", ar: "{name} لا توصّل حالياً أي منتجات إلى {country}. جرّب تغيير بلد التوصيل لرؤية المزيد من الخيارات." },
  "brand.empty.changeCountry": { en: "Change delivery country", ar: "تغيير بلد التوصيل" },
  "brand.empty.titleNoCountry": { en: "No products available", ar: "لا توجد منتجات متاحة" },
  "brand.empty.descNoCountry": { en: "This brand currently has no products available for delivery.", ar: "هذه العلامة لا تملك حالياً أي منتجات متاحة للتوصيل." },

  // Order confirmed
  "order.finalizing": { en: "Finalizing your order…", ar: "جارٍ إتمام طلبك…" },
  "order.dontClose": { en: "Please don't close this window.", ar: "يرجى عدم إغلاق هذه النافذة." },
  "order.confirmed": { en: "Order Confirmed!", ar: "تم تأكيد الطلب!" },
  "order.failed": { en: "Order Failed", ar: "فشل الطلب" },
  "order.thanks": { en: "Thank you for choosing Presentail. Your beautiful arrangement is being prepared with care.", ar: "شكراً لاختيارك Presentail. يتم تحضير باقتك الجميلة بعناية." },
  "order.failGeneric": { en: "Something went wrong while processing your payment. Please try again.", ar: "حدث خطأ أثناء معالجة دفعتك. يرجى المحاولة مرة أخرى." },
  "order.reference": { en: "Order Reference", ar: "رقم الطلب" },
  "order.continueShopping": { en: "Continue Shopping", ar: "متابعة التسوّق" },
  "order.returnCheckout": { en: "Return to Checkout", ar: "العودة إلى الدفع" },
  "order.backHome": { en: "Back to home", ar: "العودة إلى الرئيسية" },
  "order.fail.cantFind": { en: "We couldn't find your pending order to finalize. If you were charged, contact us with your payment reference.", ar: "لم نتمكن من العثور على طلبك المعلّق لإتمامه. إذا تم خصم المبلغ، يرجى التواصل معنا مع رقم مرجع الدفع." },
  "order.fail.missing": { en: "Pending order missing.", ar: "الطلب المعلّق مفقود." },
  "order.fail.couldntRead": { en: "Could not read pending order.", ar: "تعذّرت قراءة الطلب المعلّق." },
  "order.fail.couldntCreate": { en: "Order could not be created.", ar: "تعذّر إنشاء الطلب." },
  "order.fail.failed": { en: "Order finalization failed.", ar: "فشل إتمام الطلب." },

  "payments.waysToPay": { en: "Ways to Pay", ar: "طرق الدفع" },

  // 404
  "notFound.title": { en: "404 Page Not Found", ar: "404 الصفحة غير موجودة" },
  "notFound.desc": { en: "Did you forget to add the page to the router?", ar: "هل نسيت إضافة الصفحة إلى الموجّه؟" },

  // SEO — page titles & meta descriptions. {city} / {country} are localized.
  "seo.siteName": { en: "Presentail", ar: "Presentail" },
  "seo.home.title": {
    en: "Flower & Gift Delivery in {city} | Presentail",
    ar: "توصيل الأزهار والهدايا في {city} | Presentail",
  },
  "seo.home.description": {
    en: "Send luxury flowers, cakes and gifts in {city}, {country} with same-day delivery from Presentail.",
    ar: "أرسل الأزهار الفاخرة والكعك والهدايا في {city}، {country} مع توصيل في نفس اليوم من Presentail.",
  },
  "seo.shop.title": {
    en: "Shop Flowers & Gifts in {city} | Presentail",
    ar: "تسوّق الأزهار والهدايا في {city} | Presentail",
  },
  "seo.shop.description": {
    en: "Browse Presentail's curated bouquets, cakes and luxury gifts for delivery in {city}, {country}.",
    ar: "تصفّح باقات Presentail المنتقاة والكعك والهدايا الفاخرة للتوصيل في {city}، {country}.",
  },
  "seo.product.title": {
    en: "Gift Delivery in {city} | Presentail",
    ar: "توصيل الهدايا في {city} | Presentail",
  },
  "seo.product.description": {
    en: "Order this gift for delivery in {city}, {country} with Presentail.",
    ar: "اطلب هذه الهدية للتوصيل في {city}، {country} مع Presentail.",
  },
  "seo.brands.title": {
    en: "Partner Brands in {city} | Presentail",
    ar: "العلامات الشريكة في {city} | Presentail",
  },
  "seo.brands.description": {
    en: "Discover Presentail's hand-picked partner brands available for delivery in {city}, {country}.",
    ar: "اكتشف العلامات الشريكة المنتقاة من Presentail والمتاحة للتوصيل في {city}، {country}.",
  },
  "seo.brand.title": {
    en: "Brand Collection in {city} | Presentail",
    ar: "مجموعة العلامة في {city} | Presentail",
  },
  "seo.brand.description": {
    en: "Shop this brand's full collection for delivery in {city}, {country} on Presentail.",
    ar: "تسوّق المجموعة الكاملة لهذه العلامة للتوصيل في {city}، {country} عبر Presentail.",
  },
  "seo.cart.title": {
    en: "Your Bag | Presentail",
    ar: "حقيبتك | Presentail",
  },
  "seo.cart.description": {
    en: "Review your Presentail bag and proceed to a secure checkout.",
    ar: "راجع حقيبة Presentail وتابع إلى الدفع الآمن.",
  },
  "seo.checkout.title": {
    en: "Checkout | Presentail",
    ar: "الدفع | Presentail",
  },
  "seo.checkout.description": {
    en: "Complete your Presentail order with secure card, PayPal or Mamo payment.",
    ar: "أكمل طلب Presentail عبر الدفع الآمن بالبطاقة أو PayPal أو Mamo.",
  },
  "seo.orderConfirmed.title": {
    en: "Order Confirmed | Presentail",
    ar: "تم تأكيد الطلب | Presentail",
  },
  "seo.orderConfirmed.description": {
    en: "Thank you — your Presentail order has been confirmed.",
    ar: "شكراً لك — تم تأكيد طلب Presentail الخاص بك.",
  },
  "seo.auth.title": {
    en: "Sign In | Presentail",
    ar: "تسجيل الدخول | Presentail",
  },
  "seo.auth.description": {
    en: "Sign in or create a Presentail account to manage orders and addresses.",
    ar: "سجّل الدخول أو أنشئ حساب Presentail لإدارة الطلبات والعناوين.",
  },
  "seo.account.title": {
    en: "My Account | Presentail",
    ar: "حسابي | Presentail",
  },
  "seo.account.description": {
    en: "Manage your Presentail profile, orders and saved addresses.",
    ar: "أدر بيانات حساب Presentail والطلبات والعناوين المحفوظة.",
  },
  "seo.landing.title": {
    en: "Presentail | Luxury Flower & Gift Delivery Across the GCC",
    ar: "Presentail | توصيل الأزهار والهدايا الفاخرة في الخليج",
  },
  "seo.landing.description": {
    en: "Presentail delivers signature bouquets, cakes and luxury gifts across Lebanon, the UAE and Cyprus.",
    ar: "تقدّم Presentail باقات وكعك وهدايا فاخرة في لبنان والإمارات وقبرص.",
  },
};

// French overlay. Keys not present here fall back to the English string from
// STRINGS, so partial coverage is safe.
const STRINGS_FR: Record<string, string> = {
  "utility.deliverTo": "Livraison à",
  "utility.help": "Besoin d'aide ? Nous livrons dans tout le Golfe.",
  "nav.shop": "Boutique",
  "nav.occasions": "Occasions",
  "nav.flowersPlants": "Fleurs et plantes",
  "nav.gifts": "Cadeaux",
  "nav.brands": "Marques",
  "nav.about": "À propos",
  "nav.searchAria": "Rechercher",
  "nav.accountAria": "Compte",
  "nav.bagAria": "Panier",
  "navbar.selectCity": "Choisir une ville",

  "carousel.prev": "Diapositive précédente",
  "carousel.next": "Diapositive suivante",
  "bestSellers.title": "Meilleures ventes",
  "bestSellers.viewAll": "Tout voir",
  "lang.toggle": "English",

  "categories.eyebrow": "Collections sélectionnées",
  "categories.title": "Acheter par catégorie",
  "categories.subtitle":
    "Des bouquets signature aux gâteaux artisanaux — chaque cadeau, joliment présenté.",
  "categories.bouquets": "Bouquets à la main",
  "categories.boxes": "Boîtes de fleurs",
  "categories.plants": "Plantes",
  "categories.cakes": "Gâteaux",
  "categories.chocolate": "Chocolat",
  "categories.gifts": "Coffrets cadeaux",

  "occasions.eyebrow": "Pour chaque moment",
  "occasions.title": "Acheter par occasion",
  "occasions.subtitle":
    "Trouvez le geste parfait pour les jours les plus précieux de la vie.",
  "occasions.birthday": "Anniversaire",
  "occasions.romance": "Amour et romance",
  "occasions.anniversary": "Anniversaire de mariage",
  "occasions.congrats": "Félicitations",
  "occasions.newBaby": "Nouveau bébé",
  "occasions.thankYou": "Merci",
  "occasions.sympathy": "Condoléances",
  "occasions.justBecause": "Sans raison",

  "brands.eyebrow": "Maisons partenaires",
  "brands.title": "Marques que nous aimons",
  "brands.subtitle":
    "Ateliers et chocolatiers triés sur le volet, associés à nos compositions florales.",
  "brands.viewAll": "Découvrir toutes les marques",

  "trust.delivery.title": "Livraison le jour même",
  "trust.delivery.desc": "Commandez avant 16h dans tout le Golfe.",
  "trust.fresh.title": "Garantie fleuriste",
  "trust.fresh.desc": "Composé chaque jour, fraîcheur garantie.",
  "trust.payment.title": "Paiement sécurisé",
  "trust.payment.desc": "Protégé par Stripe, Mamo et PayPal.",
  "trust.care.title": "Service conciergerie",
  "trust.care.desc": "Une équipe humaine, prête à aider 7j/7.",

  "editorial.eyebrow": "L'Atelier",
  "editorial.title": "Conçu avec amour, livré avec soin",
  "editorial.body":
    "Chaque composition Presentail commence dans notre atelier de Gemmayzeh — où fleurs de saison, rubans noués à la main et détails soignés se réunissent. Nous croyons qu'un cadeau doit être un événement, pas une corvée.",
  "editorial.cta": "Notre histoire",
  "editorial.feature1.title": "Approvisionnement saisonnier",
  "editorial.feature1.desc": "Directement des meilleurs producteurs du monde.",
  "editorial.feature2.title": "Emballage signature",
  "editorial.feature2.desc": "Nos boîtes en forme d'enveloppe sont faites pour durer.",
  "editorial.badgeYears": "12+",
  "editorial.badgeLabel": "années de savoir-faire",
  "editorial.imageAlt": "Atelier Presentail",

  "newsletter.eyebrow": "Restez en fleur",
  "newsletter.title": "Rejoignez la liste Presentail",
  "newsletter.subtitle":
    "Accès anticipé aux collections saisonnières, événements privés et offre de bienvenue de 10%.",
  "newsletter.placeholder": "Votre adresse email",
  "newsletter.button": "S'abonner",
  "newsletter.thanks": "Bienvenue — vérifiez votre boîte de réception sous peu.",

  "locationPicker.sendGiftTo": "Envoyez votre cadeau à :",
  "locationPicker.selectCountry": "Sélectionnez le pays du destinataire",
  "locationPicker.selectCity": "Sélectionnez la ville du destinataire",
  "locationPicker.changeCountry": "Changer de pays",
  "locationPicker.selectCountryLabel": "Choisir le pays",
  "locationPicker.selectCityLabel": "Choisir la ville",
  "locationPicker.close": "Fermer",
  "locationPicker.back": "Retour",
  "locationPicker.langLink": "English",
  "locationPickerGate.dialogTitle": "Choisir le lieu de livraison",
  "locationPickerGate.dialogDesc":
    "Sélectionnez le pays et la ville où vous souhaitez livrer votre cadeau.",

  "shop.subtitle":
    "Parcourez notre sélection de compositions florales de luxe et de cadeaux premium, conçus avec soin pour la livraison en {country}.",
  "shop.sortPlaceholder": "Trier par",
  "shop.sort.featured": "À la une",
  "shop.sort.priceAsc": "Prix : croissant",
  "shop.sort.priceDesc": "Prix : décroissant",
  "shop.filters": "Filtres",
  "shop.categoriesTitle": "Catégories",
  "shop.occasionsTitle": "Occasions",
  "shop.clearAll": "Effacer tous les filtres",
  "shop.clearFiltersBtn": "Effacer les filtres",
  "shop.clearFiltersBtnCap": "Effacer les filtres",
  "shop.allCollection": "Toute la collection",
  "shop.empty.titleCountry": "Aucun produit disponible en {country}",
  "shop.empty.descCountry":
    "Aucun produit livrable en {country} ne correspond à vos filtres actuels. Essayez une autre catégorie ou changez de pays de livraison.",
  "shop.empty.changeCountry": "Changer le pays de livraison",
  "shop.empty.titleNoCountry": "Aucun produit trouvé",
  "shop.empty.descNoCountry":
    "Aucun produit ne correspond à vos filtres actuels.",
  "shop.empty.titleSoldOut": "Tout est en rupture ici",
  "shop.empty.descSoldOut":
    "De nouvelles pièces arrivent bientôt. En attendant, voici quelques coups de cœur de nos clients.",
  "shop.popularPicks": "Coups de cœur",
  "shop.browseAll": "Parcourir toutes les collections",

  "shop.cat.handBouquets": "Bouquets à la main",
  "shop.cat.flowerBoxes": "Boîtes de fleurs",
  "shop.cat.plants": "Plantes",
  "shop.cat.cakes": "Gâteaux",
  "shop.cat.chocolate": "Chocolat",
  "shop.cat.bundles": "Coffrets",

  "shop.occ.birthday": "Anniversaire",
  "shop.occ.loveRomance": "Amour et romance",
  "shop.occ.congratulations": "Félicitations",
  "shop.occ.thankYou": "Merci",
  "shop.occ.condolences": "Condoléances",
  "shop.occ.romance": "Romance",

  "product.toast.addedTitle": "Ajouté au panier",
  "product.toast.addedDesc": "{name} ajouté à votre panier.",
  "product.toast.addedDescQty": "{qty}× {name} ajouté à votre panier.",
  "product.notFound": "Produit introuvable",
  "product.returnShop": "Retour à la boutique",
  "product.backToShop": "Retour à la boutique",
  "product.quantity": "Quantité",
  "product.addToCart": "Ajouter au panier",
  "product.outOfStock": "Rupture de stock",
  "product.sameDay": "Livraison le jour même en {country}",
  "product.secureCheckout": "Paiement 100% sécurisé",
  "product.youMayLike": "Vous aimerez aussi",
  "product.share.aria": "Partager le produit",
  "product.share.copied.title": "Lien copié",
  "product.share.copied.desc": "Lien du produit copié dans le presse-papiers.",
  "product.share.unavailable.title": "Partage indisponible",
  "product.share.unavailable.desc": "Impossible de partager ou de copier le lien du produit.",

  "cart.empty.title": "Votre panier est vide",
  "cart.empty.desc":
    "Trouvez la composition florale ou le cadeau de luxe parfait pour votre prochaine occasion.",
  "cart.empty.cta": "Commencer mes achats",
  "cart.title": "Votre panier",
  "cart.summary": "Récapitulatif de la commande",
  "cart.subtotal": "Sous-total",
  "cart.delivery": "Livraison",
  "cart.calculatedAtCheckout": "Calculé au paiement",
  "cart.total": "Total",
  "cart.proceed": "Passer au paiement",
  "cart.removeAria": "Retirer l'article",
  "cart.decreaseAria": "Diminuer la quantité",
  "cart.increaseAria": "Augmenter la quantité",
  "cart.upsells.title": "Rendez-le parfait",
  "cart.upsells.add": "Ajouter",
  "cart.upsells.express": "Express",
  "cart.upsells.tab.recommended": "Recommandés",
  "cart.upsells.tab.singleBalloons": "Ballons à l'unité",
  "cart.upsells.tab.balloonBundles": "Bouquets de ballons",
  "cart.upsells.tab.chocolate": "Chocolat",
  "cart.upsells.tab.plants": "Plantes",
  "cart.upsells.tab.bears": "Ours",
  "cart.upsells.tab.candles": "Bougies",
  "auth.heroAlt": "Atelier Presentail",
  "checkout.payment.orderTitle": "Commande Presentail",
  "checkout.payment.orderDesc": "Commande de {name}",

  "checkout.backToCart": "Retour au panier",
  "checkout.empty.title": "Votre panier est vide",
  "checkout.empty.cta": "Retour à la boutique",
  "checkout.step1.title": "Qui reçoit ce cadeau ?",
  "checkout.step1.desc": "Saisissez les coordonnées du destinataire pour la livraison.",
  "checkout.firstName": "Prénom",
  "checkout.lastName": "Nom",
  "checkout.firstNamePh": "Jeanne",
  "checkout.lastNamePh": "Dupont",
  "checkout.phoneLB": "Numéro de téléphone ({country})",
  "checkout.phonePh": "+961 70 123 456",
  "checkout.district": "District de livraison",
  "checkout.selectDistrict": "Sélectionner un district",
  "checkout.address": "Adresse complète",
  "checkout.addressPh": "Rue, immeuble, étage…",
  "checkout.deliveryDate": "Date de livraison",
  "checkout.deliveryTime": "Heure de livraison",
  "checkout.deliveryWhen": "Quand souhaitez-vous être livré ?",
  "checkout.expressDelivery": "Livraison express",
  "checkout.expressDeliveryLabel": "Livraison express (1 à 3 h)",
  "checkout.expressUnavailable": "Disponible de 8 h à 22 h",
  "checkout.scheduleDelivery": "Planifier",
  "checkout.scheduleDeliveryDesc": "Choisir une date et une heure",
  "checkout.cardMessage": "Message de la carte (facultatif)",
  "checkout.cardMessagePh": "Écrivez un mot à joindre à votre cadeau",
  "checkout.continueSender": "Continuer vers les coordonnées de l'expéditeur",
  "checkout.step2.title": "Coordonnées de l'expéditeur",
  "checkout.keepIdentitySecret": "Garder mon identité secrète.",
  "checkout.step2.desc":
    "Nécessaires pour vous envoyer le reçu et les mises à jour.",
  "checkout.emailAddress": "Adresse email",
  "checkout.phoneNumber": "Numéro de téléphone",
  "checkout.back": "Retour",
  "checkout.continuePayment": "Continuer vers le paiement",
  "checkout.step3.title": "Paiement",
  "checkout.step3.desc":
    "Choisissez votre mode de paiement sécurisé. Vous serez redirigé vers votre fournisseur pour finaliser le paiement.",
  "checkout.pay.card": "Carte bancaire (Stripe)",
  "checkout.pay.paypal": "PayPal",
  "checkout.pay.mamo": "Mamo (portefeuilles UAE)",
  "checkout.pay.whish": "Whish Money (paiement à la confirmation)",
  "checkout.processing": "Traitement…",
  "checkout.payAmount": "Payer ${amount}",
  "checkout.dontKnowAddress": "Je ne connais pas l'adresse, veuillez contacter le destinataire.",
  "checkout.dontKnowAddressNote": "Notre équipe contactera le destinataire pour confirmer l'adresse de livraison.",
  "checkout.summary": "Récapitulatif de la commande",
  "checkout.qty": "Qté",
  "checkout.deliveryEstimated": "Livraison (estimée)",
  "checkout.toast.failTitle": "Échec du paiement",
  "checkout.toast.failGeneric": "Une erreur est survenue",
  "checkout.toast.cardUnavailable": "Paiement indisponible",
  "checkout.toast.cardUnavailableDesc":
    "Le paiement par carte n'est pas disponible pour le moment.",
  "checkout.toast.paypalUnavailable": "PayPal indisponible",
  "checkout.toast.paypalUnavailableDesc":
    "PayPal n'est pas disponible pour le moment.",
  "checkout.toast.mamoUnavailable": "Mamo indisponible",
  "checkout.toast.mamoUnavailableDesc":
    "Mamo n'est pas disponible pour le moment.",
  "checkout.toast.errorTitle": "Erreur de paiement",

  "account.loading": "Chargement…",
  "account.title": "Mon compte",
  "account.profile": "Détails du profil",
  "account.orders": "Historique des commandes",
  "account.addresses": "Adresses enregistrées",
  "account.signOut": "Se déconnecter",
  "account.firstName": "Prénom",
  "account.lastName": "Nom",
  "account.email": "Adresse email",
  "account.phone": "Numéro de téléphone",
  "account.notProvided": "Non renseigné",
  "account.soon": "Bientôt",
  "account.orders.empty": "Vous n'avez pas encore passé de commande.",
  "account.orders.loading": "Chargement de vos commandes…",
  "account.orders.error": "Impossible de charger vos commandes pour le moment.",
  "account.orders.orderNumber": "Commande",
  "account.orders.placedOn": "Passée le",
  "account.orders.deliveryFor": "Livraison à",
  "account.orders.itemsCount": "articles",
  "account.orders.itemCount": "article",

  "auth.welcome": "Bon retour",
  "auth.create": "Créer un compte",
  "auth.signinDesc": "Connectez-vous pour gérer vos commandes et adresses.",
  "auth.signupDesc": "Rejoignez Presentail pour un paiement plus rapide.",
  "auth.firstName": "Prénom",
  "auth.lastName": "Nom",
  "auth.email": "Email",
  "auth.password": "Mot de passe",
  "auth.signin": "Se connecter",
  "auth.signup": "S'inscrire",
  "auth.noAccount": "Vous n'avez pas de compte ? ",
  "auth.haveAccount": "Vous avez déjà un compte ? ",
  "auth.quote":
    "« Chaque composition raconte une histoire d'affection, créée avec intention et livrée avec soin. »",
  "auth.atelier": "L'Atelier Presentail",
  "auth.toast.loginFailed": "Échec de la connexion",
  "auth.toast.invalidCreds": "Identifiants invalides",
  "auth.toast.created": "Compte créé",
  "auth.toast.createdDesc": "Veuillez vous connecter avec vos nouveaux identifiants.",
  "auth.toast.regFailed": "Échec de l'inscription",
  "auth.toast.regFailedDesc": "Impossible de créer le compte",
  "auth.toast.error": "Erreur",
  "auth.continue": "Continuer",
  "auth.emailStepDesc":
    "Saisissez votre email pour vous connecter ou créer un compte.",
  "auth.changeEmail": "Utiliser un autre email",
  "auth.accountFound": "Compte trouvé. Veuillez vous connecter.",
  "auth.checkFailed": "Une erreur est survenue, veuillez réessayer.",
  "auth.invalidEmail": "Veuillez saisir un email valide.",
  "auth.or": "Ou",
  "auth.continueApple": "Continuer avec Apple",
  "auth.continueGoogle": "Continuer avec Google",
  "auth.toast.oauthFailed": "Échec de la connexion {provider}",
  "auth.emailLabel": "Adresse email",
  "auth.emailPlaceholder": "Saisissez votre adresse email",

  "checkoutLogin.title": "Connectez-vous pour un paiement plus rapide",
  "checkoutLogin.desc": "Enregistrez vos informations pour la prochaine fois, ou continuez en tant qu'invité.",
  "checkoutLogin.guest": "Payer en tant qu'invité",

  "brandsPage.title": "Nos marques partenaires",
  "brands.desc":
    "Découvrez notre sélection de marques cadeaux de luxe, des chocolatiers artisanaux à l'électronique haut de gamme.",
  "brands.products": "produits",
  "brand.backToBrands": "Retour aux marques",
  "brand.descPrefix": "Explorez la collection complète de {name}.",
  "brand.empty.titleCountry": "Aucun produit disponible en {country}",
  "brand.empty.descCountry":
    "{name} ne livre actuellement aucun produit en {country}. Essayez de changer de pays de livraison pour voir plus d'options.",
  "brand.empty.changeCountry": "Changer le pays de livraison",
  "brand.empty.titleNoCountry": "Aucun produit disponible",
  "brand.empty.descNoCountry":
    "Cette marque n'a actuellement aucun produit disponible à la livraison.",

  "order.finalizing": "Finalisation de votre commande…",
  "order.dontClose": "Veuillez ne pas fermer cette fenêtre.",
  "order.confirmed": "Commande confirmée !",
  "order.failed": "Échec de la commande",
  "order.thanks":
    "Merci d'avoir choisi Presentail. Votre composition est préparée avec soin.",
  "order.failGeneric":
    "Une erreur est survenue lors du traitement de votre paiement. Veuillez réessayer.",
  "order.reference": "Référence de la commande",
  "order.continueShopping": "Continuer mes achats",
  "order.returnCheckout": "Retour au paiement",
  "order.backHome": "Retour à l'accueil",
  "order.fail.cantFind":
    "Nous n'avons pas trouvé votre commande en attente. Si vous avez été débité, contactez-nous avec votre référence de paiement.",
  "order.fail.missing": "Commande en attente introuvable.",
  "order.fail.couldntRead": "Impossible de lire la commande en attente.",
  "order.fail.couldntCreate": "La commande n'a pas pu être créée.",
  "order.fail.failed": "Échec de la finalisation de la commande.",

  "payments.waysToPay": "Moyens de paiement",

  "notFound.title": "404 Page introuvable",
  "notFound.desc": "Avez-vous oublié d'ajouter la page au routeur ?",

  "seo.siteName": "Presentail",
  "seo.home.title": "Livraison de fleurs et cadeaux à {city} | Presentail",
  "seo.home.description":
    "Envoyez des fleurs de luxe, des gâteaux et des cadeaux à {city}, {country} avec la livraison le jour même par Presentail.",
  "seo.shop.title": "Boutique fleurs et cadeaux à {city} | Presentail",
  "seo.shop.description":
    "Parcourez les bouquets, gâteaux et cadeaux de luxe Presentail pour livraison à {city}, {country}.",
  "seo.product.title": "Livraison de cadeaux à {city} | Presentail",
  "seo.product.description":
    "Commandez ce cadeau pour livraison à {city}, {country} avec Presentail.",
  "seo.brands.title": "Marques partenaires à {city} | Presentail",
  "seo.brands.description":
    "Découvrez les marques partenaires sélectionnées par Presentail, disponibles à la livraison à {city}, {country}.",
  "seo.brand.title": "Collection de la marque à {city} | Presentail",
  "seo.brand.description":
    "Achetez la collection complète de cette marque pour livraison à {city}, {country} sur Presentail.",
  "seo.cart.title": "Votre sac | Presentail",
  "seo.cart.description":
    "Revoyez votre sac Presentail et passez au paiement sécurisé.",
  "seo.checkout.title": "Paiement | Presentail",
  "seo.checkout.description":
    "Finalisez votre commande Presentail par carte, PayPal ou Mamo en toute sécurité.",
  "seo.orderConfirmed.title": "Commande confirmée | Presentail",
  "seo.orderConfirmed.description":
    "Merci — votre commande Presentail a été confirmée.",
  "seo.auth.title": "Connexion | Presentail",
  "seo.auth.description":
    "Connectez-vous ou créez un compte Presentail pour gérer vos commandes et adresses.",
  "seo.account.title": "Mon compte | Presentail",
  "seo.account.description":
    "Gérez votre profil Presentail, vos commandes et vos adresses enregistrées.",
  "seo.landing.title":
    "Presentail | Livraison de fleurs et cadeaux de luxe dans le Golfe",
  "seo.landing.description":
    "Presentail livre des bouquets, gâteaux et cadeaux de luxe au Liban, aux Émirats arabes unis et à Chypre.",
};

type LocaleContextType = {
  language: Language;
  setLanguage: (l: Language) => void;
  dir: "ltr" | "rtl";
  t: (key: keyof typeof STRINGS | string, params?: Record<string, string | number>) => string;
  countryName: (code: string, fallback: string) => string;
  cityName: (id: string, fallback: string) => string;
};

const LocaleContext = createContext<LocaleContextType | null>(null);

const STORAGE_KEY = "presentail_lang_v1";
const LEGACY_STORAGE_KEY = "presentail_language_v1";

const COUNTRY_NAMES_AR: Record<string, string> = {
  LB: "لبنان",
  AE: "الإمارات العربية المتحدة",
  CY: "قبرص",
};

const COUNTRY_NAMES_FR: Record<string, string> = {
  LB: "Liban",
  AE: "Émirats arabes unis",
  CY: "Chypre",
};

const CITY_NAMES_AR: Record<string, string> = {
  "lb-beirut": "بيروت",
  "lb-jounieh": "جونيه",
  "lb-tripoli": "طرابلس",
  "lb-saida": "صيدا",
  "lb-tyre": "صور",
  "lb-zahle": "زحلة",
  "lb-byblos": "جبيل",
  "lb-baalbek": "بعلبك",
  "ae-dubai": "دبي",
  "ae-abu-dhabi": "أبو ظبي",
  "ae-sharjah": "الشارقة",
  "ae-ajman": "عجمان",
  "ae-ras-al-khaimah": "رأس الخيمة",
  "ae-fujairah": "الفجيرة",
  "ae-umm-al-quwain": "أم القيوين",
  "ae-al-ain": "العين",
  "cy-nicosia": "نيقوسيا",
  "cy-limassol": "ليماسول",
  "cy-larnaca": "لارنكا",
  "cy-paphos": "بافوس",
};

const CITY_NAMES_FR: Record<string, string> = {
  "lb-beirut": "Beyrouth",
  "lb-jounieh": "Jounieh",
  "lb-tripoli": "Tripoli",
  "lb-saida": "Saïda",
  "lb-tyre": "Tyr",
  "lb-zahle": "Zahlé",
  "lb-byblos": "Byblos",
  "lb-baalbek": "Baalbek",
  "ae-dubai": "Dubaï",
  "ae-abu-dhabi": "Abou Dhabi",
  "ae-sharjah": "Charjah",
  "ae-ajman": "Ajman",
  "ae-ras-al-khaimah": "Ras el Khaïmah",
  "ae-fujairah": "Foujaïrah",
  "ae-umm-al-quwain": "Oumm al Qaïwaïn",
  "ae-al-ain": "Al-Aïn",
  "cy-nicosia": "Nicosie",
  "cy-limassol": "Limassol",
  "cy-larnaca": "Larnaca",
  "cy-paphos": "Paphos",
};

function format(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, k) => (k in params ? String(params[k]) : `{${k}}`));
}

function readStoredLang(): Language {
  if (typeof window === "undefined") return "en";
  try {
    let saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved || !isSupportedLang(saved)) {
      const legacy = window.localStorage.getItem(LEGACY_STORAGE_KEY);
      if (legacy && isSupportedLang(legacy)) {
        saved = legacy;
        try {
          window.localStorage.setItem(STORAGE_KEY, legacy);
          window.localStorage.removeItem(LEGACY_STORAGE_KEY);
        } catch {
          // ignore
        }
      }
    }
    return saved && isSupportedLang(saved) ? saved : "en";
  } catch {
    return "en";
  }
}

const BASE_PREFIX = (import.meta as any).env?.BASE_URL?.replace(/\/$/, "") ?? "";

function currentRelativeUrl(routerPath: string): string {
  if (typeof window === "undefined") return routerPath;
  return routerPath + window.location.search + window.location.hash;
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [path, navigate] = useLocation();
  const parsed = parseLocalePath(path);

  const [stored, setStored] = useState<Language>(() => readStoredLang());

  const language: Language = parsed.lang ?? stored;
  const dir: "ltr" | "rtl" = language === "ar" ? "rtl" : "ltr";

  // Persist URL-derived language to localStorage so reloads from `/` keep it.
  useEffect(() => {
    if (parsed.lang && parsed.lang !== stored) {
      setStored(parsed.lang);
      try {
        window.localStorage.setItem(STORAGE_KEY, parsed.lang);
      } catch {
        // ignore
      }
    }
  }, [parsed.lang, stored]);

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = dir;
  }, [language, dir]);

  // Sync across tabs.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue && isSupportedLang(e.newValue)) {
        setStored(e.newValue);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setLanguage = useCallback(
    (lang: Language) => {
      setStored(lang);
      try {
        window.localStorage.setItem(STORAGE_KEY, lang);
      } catch {
        // ignore
      }
      // If the URL has a locale prefix, replace just the language segment so
      // the country, city, remaining path, query and hash all survive.
      if (parsed.hasLocalePrefix) {
        const next = switchLanguage(currentRelativeUrl(path), lang);
        navigate(next);
      }
    },
    [parsed.hasLocalePrefix, path, navigate],
  );

  const value = useMemo<LocaleContextType>(
    () => ({
      language,
      setLanguage,
      dir,
      t: (key, params) => {
        const k = key as string;
        if (language === "fr") {
          const fr = STRINGS_FR[k];
          if (fr) return format(fr, params);
          const en = STRINGS[k]?.en;
          return format(en ?? k, params);
        }
        const entry = STRINGS[k];
        if (!entry) return format(k, params);
        return format(entry[language as "en" | "ar"], params);
      },
      countryName: (code, fallback) => {
        if (language === "ar") return COUNTRY_NAMES_AR[code] ?? fallback;
        if (language === "fr") return COUNTRY_NAMES_FR[code] ?? fallback;
        return fallback;
      },
      cityName: (id, fallback) => {
        if (language === "ar") return CITY_NAMES_AR[id] ?? fallback;
        if (language === "fr") return CITY_NAMES_FR[id] ?? fallback;
        return fallback;
      },
    }),
    [language, dir, setLanguage],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale must be used within LocaleProvider");
  return ctx;
}

// Re-export for callers that still import from this module.
export { BASE_PREFIX };

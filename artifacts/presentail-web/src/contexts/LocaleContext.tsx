import { createContext, useContext, useEffect, useState, ReactNode, useMemo } from "react";

export type Language = "en" | "ar";

type Dict = Record<string, { en: string; ar: string }>;

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
  "editorial.title": { en: "Designed in Beirut, Delivered Across the Gulf", ar: "مصمَّم في بيروت، يُسلَّم في الخليج" },
  "editorial.body": {
    en: "Every Presentail arrangement begins in our Gemmayzeh studio — where seasonal blooms, hand-tied ribbons, and considered details come together. We believe a gift should feel like an event, not an errand.",
    ar: "تبدأ كل تنسيقات بريزانتيل في استوديو الجميزة لدينا — حيث تجتمع الأزهار الموسمية والأشرطة المنسوجة يدوياً والتفاصيل المدروسة. نؤمن بأن الهدية يجب أن تكون حدثاً، لا مهمّة.",
  },
  "editorial.cta": { en: "Our Story", ar: "قصّتنا" },
  "editorial.feature1.title": { en: "Seasonal Sourcing", ar: "مصادر موسمية" },
  "editorial.feature1.desc": { en: "Direct from Dutch & Lebanese growers.", ar: "مباشرة من المزارعين الهولنديين واللبنانيين." },
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
  "locationPicker.langLink": { en: "العربية", ar: "English" },
  "locationPickerGate.dialogTitle": { en: "Choose delivery location", ar: "اختر موقع التوصيل" },
  "locationPickerGate.dialogDesc": { en: "Select the country and city you want your gift delivered to.", ar: "اختر البلد والمدينة التي تريد توصيل هديتك إليها." },

  // Shop page
  "shop.subtitle": { en: "Browse our curated selection of luxury floral designs and premium gifts, thoughtfully crafted for delivery in Lebanon.", ar: "تصفّح مجموعتنا المنتقاة من تصاميم الزهور الفاخرة والهدايا المميزة، المُعدّة بعناية للتوصيل في لبنان." },
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
  "product.sameDay": { en: "Same-day delivery in Lebanon", ar: "توصيل في نفس اليوم في لبنان" },
  "product.secureCheckout": { en: "100% Secure Checkout", ar: "دفع آمن 100%" },
  "product.youMayLike": { en: "You May Also Like", ar: "قد يعجبك أيضاً" },

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
  "checkout.phoneLB": { en: "Phone Number (Lebanon)", ar: "رقم الهاتف (لبنان)" },
  "checkout.phonePh": { en: "+961 70 123 456", ar: "+961 70 123 456" },
  "checkout.district": { en: "Delivery District", ar: "منطقة التوصيل" },
  "checkout.selectDistrict": { en: "Select a district", ar: "اختر منطقة" },
  "checkout.address": { en: "Full Address Details", ar: "تفاصيل العنوان الكامل" },
  "checkout.addressPh": { en: "Street, Building, Floor...", ar: "الشارع، المبنى، الطابق..." },
  "checkout.deliveryDate": { en: "Delivery Date", ar: "تاريخ التوصيل" },
  "checkout.cardMessage": { en: "Card Message (Optional)", ar: "رسالة البطاقة (اختياري)" },
  "checkout.cardMessagePh": { en: "Write a note to go with your gift", ar: "اكتب ملاحظة ترفق مع هديتك" },
  "checkout.continueSender": { en: "Continue to Sender Details", ar: "المتابعة إلى بيانات المُرسِل" },
  "checkout.step2.title": { en: "Sender Details", ar: "بيانات المُرسِل" },
  "checkout.step2.desc": { en: "We need this to send your receipt and updates.", ar: "نحتاج إلى هذه البيانات لإرسال الإيصال والتحديثات." },
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

  // Brands
  "brandsPage.title": { en: "Our Partner Brands", ar: "علاماتنا الشريكة" },
  "brands.desc": { en: "Discover our curated selection of luxury gifting brands, from artisan chocolatiers to premium electronics.", ar: "اكتشف مجموعتنا المنتقاة من علامات الهدايا الفاخرة، من صنّاع الشوكولاتة الحرفيين إلى الإلكترونيات المميزة." },
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

  // Footer
  "footer.tagline": { en: "Beirut's premium florist and gifting house. Confident, generous, unhurried.", ar: "بيت الزهور والهدايا الفاخرة في بيروت. ثقة وكرم وأناقة هادئة." },
  "footer.address1": { en: "Rue Gouraud, Gemmayzeh", ar: "شارع غورو، الجميزة" },
  "footer.address2": { en: "Beirut, Lebanon", ar: "بيروت، لبنان" },
  "footer.shop": { en: "Shop", ar: "المتجر" },
  "footer.help": { en: "Help", ar: "المساعدة" },
  "footer.contact": { en: "Contact Us", ar: "تواصل معنا" },
  "footer.deliveryInfo": { en: "Delivery Info", ar: "معلومات التوصيل" },
  "footer.faq": { en: "FAQ", ar: "الأسئلة الشائعة" },
  "footer.terms": { en: "Terms & Conditions", ar: "الشروط والأحكام" },
  "footer.comingSoon": { en: "coming soon", ar: "قريباً" },
  "footer.copyright": { en: "© {year} Presentail Lebanon. All rights reserved.", ar: "© {year} Presentail لبنان. جميع الحقوق محفوظة." },
  "footer.payments": { en: "Secure payments by Stripe & Mamo", ar: "دفع آمن عبر Stripe وMamo" },

  // 404
  "notFound.title": { en: "404 Page Not Found", ar: "404 الصفحة غير موجودة" },
  "notFound.desc": { en: "Did you forget to add the page to the router?", ar: "هل نسيت إضافة الصفحة إلى الموجّه؟" },
};

type LocaleContextType = {
  language: Language;
  setLanguage: (l: Language) => void;
  dir: "ltr" | "rtl";
  t: (key: keyof typeof STRINGS | string, params?: Record<string, string | number>) => string;
};

const LocaleContext = createContext<LocaleContextType | null>(null);

const STORAGE_KEY = "presentail_lang_v1";

function format(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, k) => (k in params ? String(params[k]) : `{${k}}`));
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    if (typeof window === "undefined") return "en";
    const saved = localStorage.getItem(STORAGE_KEY) as Language | null;
    return saved === "ar" ? "ar" : "en";
  });

  const dir: "ltr" | "rtl" = language === "ar" ? "rtl" : "ltr";

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = dir;
    localStorage.setItem(STORAGE_KEY, language);
  }, [language, dir]);

  const value = useMemo<LocaleContextType>(
    () => ({
      language,
      setLanguage: setLanguageState,
      dir,
      t: (key, params) => {
        const entry = STRINGS[key as string];
        const template = entry ? entry[language] : (key as string);
        return format(template, params);
      },
    }),
    [language, dir],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale must be used within LocaleProvider");
  return ctx;
}

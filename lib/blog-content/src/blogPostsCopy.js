/**
 * Shared blog article copy — the single source of truth for blog post content
 * AND its SEO metadata (slug, title, description, datePublished). Lives in the
 * `@workspace/blog-content` lib so it can be imported by BOTH the web app
 * (the BlogPost page, the Blog index, and the server-side SEO injector
 * `seo-inject.mjs`) AND the mobile app, keeping the two from drifting apart.
 *
 * Keep this file as plain ES module JS (no TypeScript) so the Node.js SEO
 * injector can import it at runtime without a compilation step. Types for TS
 * consumers live in the sibling `blogPostsCopy.d.ts`.
 *
 * Structure: { [slug]: { [lang]: { slug, eyebrow, title, description, datePublished, sections: [{ heading?, body }] } } }
 *
 * Adding a new article? Add it here once — every web page, the index card, the
 * shared-link preview / Google Article rich result, and any mobile journal
 * screen all read from this single object.
 */

export const BLOG_POSTS = {
  "inside-spring-sourcing-trip": {
    en: {
      slug: "inside-spring-sourcing-trip",
      eyebrow: "Seasonal sourcing",
      title: "Inside our spring sourcing trip",
      description:
        "How our florists pick the season's best peonies, ranunculi, and garden roses — and what to look for when a bloom is at its peak.",
      datePublished: "2025-03-15",
      ogImage: { url: "/blog/inside-spring-sourcing-trip.webp", width: 1408, height: 768 },
      sections: [
        {
          body: "Every spring, our lead florists travel to wholesale markets and grower farms across Lebanon, the Netherlands, and Turkey to select the stems that will fill our arrangements through April and May. It is not simply a buying trip — it is a long negotiation with the season itself.",
        },
        {
          heading: "What we look for first",
          body: "The first thing we check is the bud stage. A peony should arrive tightly closed, almost cabbage-like, so it has room to open in the studio or in the recipient's home. Buy a fully open peony at market, and it will be spent within two days of delivery. We want petals still cupped around the centre, sepals still green and protective.",
        },
        {
          heading: "Ranunculi and their many layers",
          body: "Ranunculi are our second benchmark flower of the season. They are deceptively fragile — the stems bruise easily and the blooms sulk if their water is changed carelessly — but when they are right, there is nothing more layered or painterly in an arrangement. We look for tight, multi-petalled buds in soft cream, coral, and dusty rose, avoiding anything with translucent petals that signals over-development.",
        },
        {
          heading: "Garden roses, and why they are worth the premium",
          body: "Garden roses differ from standard hybrid tea roses in their petal count and fragrance. A good David Austin variety might have sixty or eighty petals where a standard rose has thirty. That density holds longer under Lebanon's spring heat, and the scent carries into a room in a way that spray roses never do. We source primarily from Dutch growers whose stems are flown in on the same day they are cut — freshness over local proximity, always.",
        },
        {
          heading: "Getting the stems home",
          body: "The cold chain from grower to studio is where most flower quality is lost. We work with a temperature-controlled logistics partner and condition stems immediately on arrival — removing foliage below the water line, making a fresh diagonal cut, and hydrating for a minimum of four hours before any arrangement begins. By the time a bouquet leaves our studio, the flowers have been rested, not rushed.",
        },
      ],
    },
    ar: {
      slug: "inside-spring-sourcing-trip",
      eyebrow: "مصادر موسمية",
      title: "داخل رحلة مصادر الربيع",
      description:
        "كيف يختار منسّقو الأزهار لدينا أفضل أزهار الفاوانيا والحوذان وورود الحدائق — وما الذي يدلّ على ذروة جمال الزهرة.",
      datePublished: "2025-03-15",
      ogImage: { url: "/blog/inside-spring-sourcing-trip.webp", width: 1408, height: 768 },
      sections: [
        {
          body: "كلّ ربيع، يتنقّل منسّقو الأزهار الرئيسيون لدينا بين أسواق الجملة ومزارع المنتجين في لبنان وهولندا وتركيا، لاختيار الأزهار التي ستملأ تشكيلاتنا طوال أبريل ومايو. إنها ليست رحلة شراء بالمعنى المعتاد، بل هي تفاوض طويل مع الموسم نفسه.",
        },
        {
          heading: "ما الذي نبحث عنه أوّلاً",
          body: "أوّل ما نتحقّق منه هو مرحلة البرعم. يجب أن تصلنا الفاوانيا مغلقةً بشكل محكم، تقريباً كرأس الملفوف، حتى يكون لها متّسع للتفتّح في الاستوديو أو في منزل المستلم. إن اشتريتَ فاوانيا مفتوحة تماماً من السوق، فستنتهي في غضون يومين من التوصيل.",
        },
        {
          heading: "الحوذان وطبقاته المتعدّدة",
          body: "الحوذان هو زهرتنا المعيارية الثانية لهذا الموسم. إنه هشّ بشكل مخادع — تتكدّم سيقانه بسهولة وتمتنع عن التفتّح إذا غُيّر ماؤه باستهتار — لكن حين يكون في أحسن حالاته، لا شيء يضاهيه من حيث التطبيق والجمال التشكيلي في الباقة. نبحث عن براعم مكتنزة متعدّدة البتلات بألوان كريم ناعمة ومرجانية ووردي مترّب.",
        },
        {
          heading: "ورود الحدائق، ولماذا تستحق السعر المرتفع",
          body: "تختلف ورود الحدائق عن الورود الهجينة الاعتيادية في عدد بتلاتها وعبيرها. قد يحتوي صنف David Austin الجيّد على ستين أو ثمانين بتلة، حيث لا تتجاوز الوردة الاعتيادية ثلاثين. هذه الكثافة تتحمّل حرارة لبنان الربيعية لفترة أطول، والعطر يملأ الغرفة بطريقة لا تستطيعها الورود البخاخة أبداً.",
        },
        {
          heading: "إيصال الأزهار بأمان",
          body: "سلسلة التبريد من المزرعة إلى الاستوديو هي المكان الذي تضيع فيه معظم جودة الأزهار. نعمل مع شريك لوجستي مع تحكّم في درجة الحرارة، ونعالج الأزهار فور وصولها — نزع الأوراق تحت خطّ الماء، وإجراء قطع قطري طازج، ثم الترطيب لمدّة أربع ساعات على الأقل قبل الشروع في أي تنسيق.",
        },
      ],
    },
    fr: {
      slug: "inside-spring-sourcing-trip",
      eyebrow: "Sourcing de saison",
      title: "Dans les coulisses de notre sourcing de printemps",
      description:
        "Comment nos fleuristes choisissent les plus belles pivoines, renoncules et roses de jardin — et comment reconnaître une fleur à son apogée.",
      datePublished: "2025-03-15",
      ogImage: { url: "/blog/inside-spring-sourcing-trip.webp", width: 1408, height: 768 },
      sections: [
        {
          body: "Chaque printemps, nos fleuristes principaux se rendent dans des marchés de gros et des fermes de producteurs au Liban, aux Pays-Bas et en Turquie pour sélectionner les tiges qui garniront nos compositions d'avril à mai. Ce n'est pas simplement un voyage d'achat — c'est une longue négociation avec la saison elle-même.",
        },
        {
          heading: "Ce que nous cherchons en premier",
          body: "La première chose que nous vérifions, c'est le stade du bouton. Une pivoine doit arriver bien fermée, presque comme un chou, pour pouvoir s'ouvrir en atelier ou chez le destinataire. Une pivoine achetée déjà épanouie sera fanée en deux jours. Nous cherchons des pétales encore enroulés autour du cœur, des sépales encore verts et protecteurs.",
        },
        {
          heading: "Les renoncules et leurs multiples couches",
          body: "Les renoncules sont notre deuxième fleur de référence de la saison. Elles sont trompeusement fragiles — leurs tiges se froissent facilement et les fleurs boudent si on change leur eau sans précaution — mais quand elles sont à leur meilleur, rien n'est plus feuilleté ni pictural dans une composition. Nous privilégions des boutons serrés, aux pétales multiples, en crème douce, corail et rose poudré.",
        },
        {
          heading: "Les roses de jardin, et pourquoi elles valent le prix",
          body: "Les roses de jardin diffèrent des roses hybrides standard par leur nombre de pétales et leur parfum. Une bonne variété David Austin peut avoir soixante ou quatre-vingts pétales là où une rose standard en compte trente. Cette densité résiste mieux à la chaleur printanière du Liban, et le parfum emplit une pièce d'une façon que les roses spray ne feront jamais.",
        },
        {
          heading: "Acheminer les tiges jusqu'au studio",
          body: "La chaîne du froid du producteur au studio est l'endroit où la plupart de la qualité des fleurs est perdue. Nous travaillons avec un partenaire logistique à température contrôlée et conditionnons les tiges dès leur arrivée — retrait du feuillage sous la ligne d'eau, coupe diagonale fraîche, et hydratation pendant au moins quatre heures avant tout arrangement.",
        },
      ],
    },
  },

  "chocolatiers-behind-our-gift-boxes": {
    en: {
      slug: "chocolatiers-behind-our-gift-boxes",
      eyebrow: "Maker spotlight",
      title: "The chocolatiers behind our gift boxes",
      description:
        "We sit down with the family-run ateliers we partner with across Beirut, Dubai, and Limassol to talk craft, cocoa, and patience.",
      datePublished: "2025-04-02",
      ogImage: { url: "/blog/chocolatiers-behind-our-gift-boxes.webp", width: 1408, height: 768 },
      sections: [
        {
          body: "Every Presentail gift box that includes chocolate has a story behind the chocolate itself. We don't buy from wholesale confectionery distributors. We source from small-batch ateliers — most of them family businesses in their second or third generation — who still temper by hand and source their cocoa with care.",
        },
        {
          heading: "Why small-batch matters",
          body: "Industrial chocolate is calibrated for shelf life and cost, not flavour. A family atelier working in small batches can afford to use single-origin beans, to roast lightly and preserve floral and fruity top notes that mass production burns away. The texture is also different — properly tempered chocolate has a clean snap and a gloss that doesn't come from machinery alone.",
        },
        {
          heading: "Our Beirut partner",
          body: "Our Beirut partner has been making pralines and enrobed chocolates on the same street in Gemmayzeh since the early 1980s. The current owner, the founder's daughter, still uses her mother's ganache ratios and sources her hazelnuts from the same Bekaa Valley farmers her family has worked with for two decades. We asked her once what the hardest part of the work was. She said: waiting. 'Chocolate teaches patience,' she told us. 'You can't rush the crystallisation.'",
        },
        {
          heading: "Dubai and Abu Dhabi",
          body: "In the UAE, we work with an atelier founded by a Lebanese expat couple who moved to Dubai in the early 2000s and found there was no local equivalent of the chocolate they grew up eating. Their speciality is orange blossom and cardamom ganaches — distinctly Levantine flavours in an extremely precise French confectionery form. Their boxes are among the most requested additions to our UAE gift sets.",
        },
        {
          heading: "Limassol, and what Cyprus adds",
          body: "Our Cyprus partner is the youngest of the three, founded less than a decade ago by a pastry chef who trained in Lyon and returned home to Limassol. She focuses on seasonal fillings — carob in winter, pistachios in spring, local citrus through the summer — and her packaging has a spare, architectural quality that works beautifully alongside our floral arrangements. She is also our most experimental partner, willing to create bespoke flavours for large wedding or corporate orders.",
        },
        {
          heading: "How we select",
          body: "Every new partner goes through a tasting panel with our operations team before we commit to an order. We look at flavour first, then consistency across a full box, then packaging robustness (a chocolate that crumbles in transit is useless regardless of how it tastes), and finally lead times. All three of our current partners can fulfil same-day for most of our standard box sizes.",
        },
      ],
    },
    ar: {
      slug: "chocolatiers-behind-our-gift-boxes",
      eyebrow: "تعريف بصانع",
      title: "صنّاع الشوكولاتة وراء علب هدايانا",
      description:
        "نجلس مع الأتيليهات العائلية التي نتعاون معها في بيروت ودبي وليماسول للحديث عن الحرفة والكاكاو والصبر.",
      datePublished: "2025-04-02",
      ogImage: { url: "/blog/chocolatiers-behind-our-gift-boxes.webp", width: 1408, height: 768 },
      sections: [
        {
          body: "كلّ علبة هدايا من Presentail تحتوي على شوكولاتة، تحمل قصةً خلف تلك الشوكولاتة بالذات. نحن لا نشتري من موزّعي الحلويات بالجملة. نحن نصادر من أتيليهات الإنتاج الصغير — معظمها مشاريع عائلية في الجيل الثاني أو الثالث — لا تزال تُعدّل الشوكولاتة يدويًا وتختار حبوب الكاكاو بعناية.",
        },
        {
          heading: "لماذا يهمّ الإنتاج الصغير",
          body: "الشوكولاتة الصناعية مُعايَرة لصالح مدة الصلاحية والتكلفة، لا للنكهة. يستطيع الأتيليه العائلي العامل بكميات صغيرة تحمّل استخدام حبوب أحادية المصدر، وتحميص خفيف يحافظ على النغمات الزهرية والفواكه التي يحترقها الإنتاج الضخم. الملمس أيضًا مختلف — الشوكولاتة المعدَّلة بشكل صحيح لها طقطقة نظيفة ولمعان لا تمنحه الآلات وحدها.",
        },
        {
          heading: "شريكنا في بيروت",
          body: "يصنع شريكنا في بيروت البراليين والشوكولاتة المغطّاة في الشارع ذاته في الجميزة منذ مطلع الثمانينيات. المالكة الحالية، ابنة المؤسّس، لا تزال تستخدم نسب غاناش والدتها وتستورد البندق من مزارعي سهل البقاع أنفسهم الذين تعاملت معهم عائلتها لعقدين. سألناها ذات مرّة: ما أصعب جانب في العمل؟ قالت: الانتظار. 'الشوكولاتة تعلّمك الصبر'، قالت لنا. 'لا يمكنك التعجّل في عملية التبلور.'",
        },
        {
          heading: "دبي وأبوظبي",
          body: "في الإمارات، نعمل مع أتيليه أسّسه زوجان لبنانيان من المغتربين انتقلا إلى دبي في مطلع الألفين ووجدا أنه لا يوجد مكافئ محلي للشوكولاتة التي نشآ على تناولها. تخصّصهما هو غاناش زهر البرتقال والهيل — نكهات شامية بامتياز في شكل حلويات فرنسية دقيق للغاية.",
        },
        {
          heading: "ليماسول، وما تضيفه قبرص",
          body: "شريكنا القبرصي هو الأصغر بين الثلاثة، تأسّس منذ أقل من عقد على يد طاهية معجنات تدرّبت في ليون وعادت إلى بلدها ليماسول. تركّز على حشوات موسمية — الخروب في الشتاء، والفستق في الربيع، والحمضيات المحلية طوال الصيف.",
        },
        {
          heading: "كيف نختار شركاءنا",
          body: "يمرّ كل شريك جديد بلجنة تذوّق مع فريق العمليات لدينا قبل الالتزام بأي طلب. ننظر أوّلاً إلى النكهة، ثم الاتساق عبر علبة كاملة، ثم متانة التغليف، وأخيراً مهل التسليم. يستطيع الشركاء الثلاثة الحاليون تلبية طلبات في نفس اليوم لمعظم أحجام العلب القياسية.",
        },
      ],
    },
    fr: {
      slug: "chocolatiers-behind-our-gift-boxes",
      eyebrow: "Portrait d'artisan",
      title: "Les chocolatiers derrière nos coffrets cadeaux",
      description:
        "Nous rencontrons les ateliers familiaux de Beyrouth, Dubaï et Limassol avec qui nous travaillons pour parler savoir-faire, cacao et patience.",
      datePublished: "2025-04-02",
      ogImage: { url: "/blog/chocolatiers-behind-our-gift-boxes.webp", width: 1408, height: 768 },
      sections: [
        {
          body: "Chaque coffret cadeau Presentail qui contient du chocolat a une histoire derrière ce chocolat. Nous n'achetons pas auprès de distributeurs de confiserie en gros. Nous nous approvisionnons auprès d'ateliers artisanaux — la plupart des entreprises familiales à leur deuxième ou troisième génération — qui tempèrent encore à la main et sourcent leur cacao avec soin.",
        },
        {
          heading: "Pourquoi la petite production compte",
          body: "Le chocolat industriel est calibré pour la durée de conservation et le coût, pas pour la saveur. Un atelier familial travaillant en petites quantités peut se permettre d'utiliser des fèves d'origine unique, de torréfier légèrement pour préserver les notes florales et fruitées que la production de masse brûle. La texture est aussi différente — un chocolat correctement tempéré a un craquant net et un brillant qui ne viennent pas uniquement des machines.",
        },
        {
          heading: "Notre partenaire à Beyrouth",
          body: "Notre partenaire beyrouthin fabrique des pralines et des chocolats enrobés dans la même rue de Gemmayzeh depuis le début des années 1980. La propriétaire actuelle, la fille du fondateur, utilise toujours les ratios de ganache de sa mère et s'approvisionne en noisettes auprès des mêmes agriculteurs de la Bekaa avec lesquels sa famille travaille depuis deux décennies. Nous lui avons demandé une fois quelle était la partie la plus difficile du travail. Elle a dit : attendre. « Le chocolat enseigne la patience », nous a-t-elle confié.",
        },
        {
          heading: "Dubaï et Abu Dhabi",
          body: "Aux Émirats, nous travaillons avec un atelier fondé par un couple d'expatriés libanais qui se sont installés à Dubaï au début des années 2000 et ont constaté l'absence d'équivalent local du chocolat avec lequel ils avaient grandi. Leur spécialité est le ganache à la fleur d'oranger et à la cardamome — des saveurs résolument levantines dans une forme de confiserie française extrêmement précise.",
        },
        {
          heading: "Limassol, et ce que Chypre apporte",
          body: "Notre partenaire chypriote est le plus jeune des trois, fondé il y a moins d'une décennie par une pâtissière formée à Lyon et rentrée chez elle à Limassol. Elle se concentre sur des garnitures saisonnières — caroube en hiver, pistaches au printemps, agrumes locaux tout l'été — et son emballage a une qualité architecturale épurée.",
        },
        {
          heading: "Comment nous sélectionnons",
          body: "Chaque nouveau partenaire passe par un panel de dégustation avec notre équipe opérationnelle avant que nous nous engagions dans une commande. Nous examinons d'abord la saveur, puis la cohérence sur une boîte entière, puis la robustesse de l'emballage, et enfin les délais. Nos trois partenaires actuels peuvent livrer le jour même pour la plupart de nos tailles de boîtes standard.",
        },
      ],
    },
  },

  "what-to-send-when-there-are-no-words": {
    en: {
      slug: "what-to-send-when-there-are-no-words",
      eyebrow: "Gifting guide",
      title: "What to send when there are no words",
      description:
        "A short guide to thoughtful sympathy gifts — and how to write a card that actually helps.",
      datePublished: "2025-04-18",
      ogImage: { url: "/blog/what-to-send-when-there-are-no-words.webp", width: 1408, height: 768 },
      sections: [
        {
          body: "Grief is one of the few occasions where most gifting rules dissolve. The instinct to send something — flowers, food, a small gesture of presence — is right, but the execution can feel impossible. What follows is a short, practical guide we have assembled from conversations with our florists and many years of watching what people choose to send, and why.",
        },
        {
          heading: "Flowers are almost always right",
          body: "Across most cultures we serve — Lebanon, the UAE, and Cyprus — flowers at a time of loss are understood without explanation. They signal presence without demand. They do not require a response. They arrive, they are beautiful for a few days, and they leave. That temporal quality is part of their power: a sympathy flower arrangement is not meant to be a permanent installation. Choose stems that are graceful rather than exuberant — whites and creams, soft lilacs, garden roses rather than tropical specimens. Avoid anything too festive in colour.",
        },
        {
          heading: "What to include alongside flowers",
          body: "A candle, a simple preserved fruit or sweet, or a box of high-quality chocolate works well beside flowers. The logic is the same: something that offers a small sensory comfort without requiring effort or decision from the recipient. Avoid anything that requires immediate attention — cut flowers in a foam arrangement that needs water every day, for example, or food that must be refrigerated promptly. Grief is already cognitively demanding.",
        },
        {
          heading: "How to write the card",
          body: "The card is where most people lose confidence, and where a few principles help. First: write in the first person, not the third. 'I am thinking of you' lands differently than 'Everyone is thinking of you.' Second: name the person who was lost, if you knew them. 'I will always remember how warmly Mariam welcomed us at your table' is more comforting than a general acknowledgement of loss. Third: resist the impulse to explain or find meaning. 'Everything happens for a reason' is rarely comforting; 'I love you and I am here' almost always is.",
        },
        {
          heading: "Timing",
          body: "In the acute days immediately after a death, people are often surrounded by family and focused on logistics. A delivery in the first day or two is appropriate and will be noticed, but a second delivery a week or two later — when the immediate crowd has dispersed and grief has settled into its quieter, lonelier second phase — can be more meaningful than the first. We offer the option to schedule deliveries in advance for exactly this reason.",
        },
        {
          heading: "When you are far away",
          body: "One of the most common reasons people contact us is distance. You have heard difficult news about someone you love who is in Beirut, Dubai, or Limassol, and you are in London or Paris or Lagos. Sending flowers across that distance is not a lesser gesture than being there in person — it is the version of being there that geography allows. We handle the local sourcing, arrangement, and delivery; you provide the intention behind it.",
        },
      ],
    },
    ar: {
      slug: "what-to-send-when-there-are-no-words",
      eyebrow: "دليل الإهداء",
      title: "ماذا ترسل حين تعجز الكلمات",
      description:
        "دليل قصير لهدايا التعازي المدروسة — وكيف تكتب بطاقة تُواسي فعلاً.",
      datePublished: "2025-04-18",
      ogImage: { url: "/blog/what-to-send-when-there-are-no-words.webp", width: 1408, height: 768 },
      sections: [
        {
          body: "الحزن هو من المناسبات القليلة التي تتلاشى فيها معظم قواعد الإهداء. الدافع لإرسال شيء ما — أزهار، طعام، لفتة بسيطة تدلّ على الحضور — هو دافع صحيح، لكن التنفيذ قد يبدو مستحيلاً. ما يلي هو دليل موجز وعملي جمعناه من محادثات مع منسّقي الأزهار لدينا وسنوات طويلة من مراقبة ما يختار الناس إرساله، ولماذا.",
        },
        {
          heading: "الأزهار صحيحة دائماً تقريباً",
          body: "في معظم الثقافات التي نخدمها — لبنان والإمارات وقبرص — الأزهار في وقت الحزن مفهومة دون شرح. تُشير إلى الحضور دون أن تفرض شيئاً. لا تستوجب ردّاً. تصل، تبقى جميلة بضعة أيام، ثم تمضي. تلك الصفة الزمنية جزء من قوّتها. اختر أزهاراً رشيقة لا مبهجة — ألوان بيضاء وكريمية، وليلك ناعم، وورود حدائق بدلاً من النباتات الاستوائية.",
        },
        {
          heading: "ما تضيفه إلى جانب الأزهار",
          body: "شمعة، أو فاكهة محفوظة بسيطة، أو علبة شوكولاتة عالية الجودة تعمل جيداً إلى جانب الأزهار. المنطق واحد: شيء يقدّم راحةً حسّية صغيرة دون أن يتطلّب جهداً أو قراراً من المستلم. تجنّب أي شيء يستوجب اهتماماً فورياً — طعام يجب تبريده فوراً، على سبيل المثال. الحزن مُرهق ذهنياً بما يكفي.",
        },
        {
          heading: "كيف تكتب البطاقة",
          body: "البطاقة هي المكان الذي يفقد فيه معظم الناس ثقتهم. أوّلاً: اكتب بضمير المتكلّم. 'أنا أفكّر فيك' تصل بشكل مختلف عن 'الجميع يفكّر فيك'. ثانياً: سمّ الشخص الذي فُقد إذا كنت تعرفه. 'لن أنسى أبداً كيف استقبلتنا مريم بدفء على مائدتكم' أكثر إيناساً من اعتراف عام بالخسارة. ثالثاً: قاوِم الرغبة في التفسير أو إيجاد المعنى. 'أنا أحبّك وأنا هنا' مُواسٍ دائماً تقريباً.",
        },
        {
          heading: "التوقيت",
          body: "في الأيام الحادة التي تعقب الوفاة مباشرةً، يكون الناس محاطين في الغالب بالعائلة ومنشغلين بالإجراءات. التوصيل في اليوم الأوّل أو الثاني مناسب وسيُلاحَظ، لكن إرسالاً ثانياً بعد أسبوع أو أسبوعين — حين يتفرّق الحشد ويستقرّ الحزن في مرحلته الأكثر هدوءاً ووحدةً — قد يكون أعمق أثراً من الأوّل.",
        },
        {
          heading: "حين تكون بعيداً",
          body: "أحد أكثر الأسباب شيوعاً التي يتواصل بها الناس معنا هو المسافة. سمعتَ أخباراً صعبة عن شخص تحبّه في بيروت أو دبي أو ليماسول، وأنت في لندن أو باريس أو لاغوس. إرسال الأزهار عبر تلك المسافة ليس إيماءة أقل من الحضور الجسدي — إنها نسخة الحضور التي تسمح بها الجغرافيا. نحن نتولّى المصادر المحلية والترتيب والتوصيل؛ أنتَ توفّر النية الكامنة وراءها.",
        },
      ],
    },
    fr: {
      slug: "what-to-send-when-there-are-no-words",
      eyebrow: "Guide cadeau",
      title: "Quoi envoyer quand les mots manquent",
      description:
        "Un court guide des cadeaux de condoléances réfléchis — et comment écrire une carte qui réconforte vraiment.",
      datePublished: "2025-04-18",
      ogImage: { url: "/blog/what-to-send-when-there-are-no-words.webp", width: 1408, height: 768 },
      sections: [
        {
          body: "Le deuil est l'une des rares occasions où la plupart des règles d'offrir des cadeaux s'effacent. L'instinct d'envoyer quelque chose — des fleurs, de la nourriture, un petit geste de présence — est juste, mais l'exécution peut sembler impossible. Ce qui suit est un guide court et pratique que nous avons rassemblé à partir de conversations avec nos fleuristes et de nombreuses années à observer ce que les gens choisissent d'envoyer, et pourquoi.",
        },
        {
          heading: "Les fleurs sont presque toujours appropriées",
          body: "Dans la plupart des cultures que nous servons — Liban, Émirats et Chypre — les fleurs lors d'un deuil sont comprises sans explication. Elles signalent une présence sans exiger quoi que ce soit. Elles n'appellent pas de réponse. Elles arrivent, sont belles quelques jours, puis s'en vont. Choisissez des tiges gracieuses plutôt qu'exubérantes — blanc et crème, lilas doux, roses de jardin plutôt que spécimens tropicaux.",
        },
        {
          heading: "Ce qu'on peut ajouter à côté des fleurs",
          body: "Une bougie, un simple fruit confit ou une confiserie, ou une boîte de chocolat de qualité fonctionne bien aux côtés de fleurs. La logique est la même : quelque chose qui offre un petit réconfort sensoriel sans demander d'effort ou de décision au destinataire. Évitez tout ce qui nécessite une attention immédiate — de la nourriture à réfrigérer rapidement, par exemple. Le deuil est déjà suffisamment exigeant sur le plan cognitif.",
        },
        {
          heading: "Comment écrire la carte",
          body: "La carte est l'endroit où la plupart des gens perdent confiance. Premièrement : écrivez à la première personne. « Je pense à toi » a un impact différent de « Tout le monde pense à toi ». Deuxièmement : nommez la personne disparue si vous la connaissiez. « Je n'oublierai jamais la chaleur avec laquelle Mariam nous accueillait à votre table » est plus réconfortant qu'une reconnaissance générale du deuil. Troisièmement : résistez à l'envie d'expliquer. « Je t'aime et je suis là » est presque toujours réconfortant.",
        },
        {
          heading: "Le moment opportun",
          body: "Dans les jours aigus qui suivent immédiatement un décès, les gens sont souvent entourés de leur famille et focalisés sur la logistique. Une livraison le premier ou le deuxième jour est appropriée et sera remarquée, mais un second envoi une semaine ou deux plus tard — quand la foule immédiate s'est dispersée et que le deuil s'est installé dans sa phase plus calme et plus solitaire — peut être plus significatif que le premier.",
        },
        {
          heading: "Quand vous êtes loin",
          body: "L'une des raisons les plus courantes pour lesquelles les gens nous contactent est la distance. Vous avez appris de mauvaises nouvelles sur quelqu'un que vous aimez qui se trouve à Beyrouth, Dubaï ou Limassol, et vous êtes à Londres, Paris ou Lagos. Envoyer des fleurs à travers cette distance n'est pas un geste moindre qu'être présent en personne — c'est la version de la présence que la géographie permet. Nous gérons l'approvisionnement local, la composition et la livraison ; vous fournissez l'intention derrière tout cela.",
        },
      ],
    },
  },

  "flower-shop-in-achrafieh": {
    en: {
      slug: "flower-shop-in-achrafieh",
      eyebrow: "Beirut",
      title: "Flower Shop in Achrafieh | Presentail's Beirut Boutique",
      description:
        "Presentail's flower shop in Achrafieh sits steps from Hotel-Dieu de France on Abdel Wahab El Inglizi Street, with same-day and 90-minute delivery across Beirut.",
      datePublished: "2026-08-09",
      ogImage: { url: "/blog/flower-shop-in-achrafieh.webp", width: 1408, height: 768 },
      ctaHref: "https://presentail.com/en-lb/beirut/category/flowers",
      ctaLabel: "Shop flowers now →",
      h1: "The Best Flower Shop in Achrafieh, Beirut",
      ogImageAlt: "flower shop in Achrafieh Beirut — Presentail boutique",
      sections: [
        {
          body: "If you're searching for a flower shop in Achrafieh, Presentail's boutique on Abdel Wahab El Inglizi Street — just steps from Hotel-Dieu de France — is where Beirut comes to pick up fresh flowers in person or order them online for same-day delivery anywhere in the city.\n\nAchrafieh has always been one of Beirut's most flower-loving neighborhoods, from the gift shops around Sassine Square to the boutiques lining Monot and the streets near Saint Nicolas Stairs. Presentail has been part of that tradition, serving the district with fresh, professionally arranged bouquets for birthdays, anniversaries, weddings, condolences, and everyday \"just because\" moments.",
        },
        {
          heading: "Our Achrafieh Flower Boutique",
          body: "Our physical flower shop is located on Abdel Wahab El Inglizi Street, Achrafieh, Beirut, near Hotel-Dieu de France hospital — an easy stop whether you're coming from Sassine, Sodeco, or Mar Mitr. Walk in to browse our fresh stock in person, get help building a bouquet on the spot, or pick up an online order.\n\nOpen daily from 7 AM to 1 AM — early enough for a morning pickup, late enough for a last-minute night delivery. Call ahead at 03 136 532 to check stock or place a phone order.",
        },
        {
          heading: "Why Achrafieh Residents Choose Presentail",
          items: [
            "Same-day delivery on orders placed before midday",
            "Express 90-minute delivery in select Beirut zones, including Achrafieh",
            "Scheduled delivery up to 30 days ahead — perfect for planning birthdays or anniversaries early",
            "A wide range beyond flowers: plants, cakes, chocolates, balloons, candles, and curated gift bundles",
            "A free personalized card with every order, so the message lands exactly as intended",
            "Years of experience helping Lebanese expats send flowers home, alongside walk-in customers from the neighborhood",
          ],
        },
        {
          heading: "Flowers for Every Occasion in Achrafieh",
          body: "Whatever the reason, our Achrafieh flower shop has an arrangement for it:",
          items: [
            "Birthdays and anniversaries — hand-tied bouquets and flower boxes",
            "Mother's Day, Father's Day, Valentine's Day, Christmas — seasonal collections, updated year-round",
            "Weddings and engagements — larger arrangements and centerpieces, made to order",
            "Sympathy and condolences — tasteful, respectful arrangements delivered with care",
            "Corporate gifting — flowers and gift bundles for clients, partners, or teams based in or around Achrafieh",
          ],
        },
        {
          heading: "Same-Day Flower Delivery in Achrafieh and Beyond",
          body: "Order from our Achrafieh boutique and we'll deliver the same day across Beirut, including Achrafieh, Gemmayzeh, Mar Mikhael, Badaro, Verdun, Hamra, and Ras Beirut. Need it faster? Express delivery gets flowers to your recipient in as little as 90 minutes in select zones — ideal for last-minute Achrafieh deliveries.",
        },
        {
          heading: "Visit Us or Order Online",
          body: "Stop by the boutique on Abdel Wahab El Inglizi Street to pick out your bouquet in person, call 03 136 532 to order by phone, or browse and order online for same-day delivery anywhere in Beirut.",
        },
        {
          heading: "Frequently Asked Questions",
          faqItems: [
            {
              q: "Where is Presentail's flower shop in Achrafieh located?",
              a: "Our boutique is on Abdel Wahab El Inglizi Street in Achrafieh, Beirut, near Hotel-Dieu de France hospital.",
            },
            {
              q: "Do you offer same-day flower delivery in Achrafieh?",
              a: "Yes. Orders placed before midday are delivered the same day, and express 90-minute delivery is available in select zones including Achrafieh.",
            },
            {
              q: "Can I walk into the Achrafieh shop to buy flowers in person?",
              a: "Yes, the boutique is open for walk-in customers who want to browse fresh stock or pick up an online order in person.",
            },
            {
              q: "Do you deliver outside Achrafieh?",
              a: "Yes — from our Achrafieh boutique we deliver same-day across Beirut, including Gemmayzeh, Mar Mikhael, Badaro, Verdun, Hamra, and Ras Beirut, as well as further afield in Lebanon.",
            },
            {
              q: "Can I schedule a flower delivery in advance?",
              a: "Yes, you can schedule delivery up to 30 days ahead, which is useful for planning birthdays, anniversaries, or holidays.",
            },
          ],
        },
      ],
      extraJsonLd: [
        {
          "@context": "https://schema.org",
          "@type": "LocalBusiness",
          "name": "Presentail",
          "url": "https://presentail.com/en-lb/beirut",
          "address": {
            "@type": "PostalAddress",
            "streetAddress": "Abdel Wahab El Inglizi Street",
            "addressLocality": "Achrafieh",
            "addressRegion": "Beirut",
            "addressCountry": "LB",
            "postalCode": "1100",
          },
          "telephone": "+9613136532",
          // The shop opens at 07:00 and closes at 01:00 the next morning (crosses
          // midnight). Google's Rich Results validator requires midnight-crossing
          // hours to be split into two separate OpeningHoursSpecification entries:
          // one that closes at midnight ("00:00") and one that covers the early
          // morning slot from "00:00" to the actual closing time.
          "openingHoursSpecification": [
            {
              "@type": "OpeningHoursSpecification",
              "dayOfWeek": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
              "opens": "07:00",
              "closes": "00:00",
            },
            {
              "@type": "OpeningHoursSpecification",
              "dayOfWeek": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
              "opens": "00:00",
              "closes": "01:00",
            },
          ],
        },
        {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          "mainEntity": [
            {
              "@type": "Question",
              "name": "Where is Presentail's flower shop in Achrafieh located?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "Our boutique is on Abdel Wahab El Inglizi Street in Achrafieh, Beirut, near Hotel-Dieu de France hospital.",
              },
            },
            {
              "@type": "Question",
              "name": "Do you offer same-day flower delivery in Achrafieh?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "Yes. Orders placed before midday are delivered the same day, and express 90-minute delivery is available in select zones including Achrafieh.",
              },
            },
            {
              "@type": "Question",
              "name": "Can I walk into the Achrafieh shop to buy flowers in person?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "Yes, the boutique is open for walk-in customers who want to browse fresh stock or pick up an online order in person.",
              },
            },
            {
              "@type": "Question",
              "name": "Do you deliver outside Achrafieh?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "Yes — from our Achrafieh boutique we deliver same-day across Beirut, including Gemmayzeh, Mar Mikhael, Badaro, Verdun, Hamra, and Ras Beirut, as well as further afield in Lebanon.",
              },
            },
            {
              "@type": "Question",
              "name": "Can I schedule a flower delivery in advance?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "Yes, you can schedule delivery up to 30 days ahead, which is useful for planning birthdays, anniversaries, or holidays.",
              },
            },
          ],
        },
      ],
    },
    ar: {
      slug: "flower-shop-in-achrafieh",
      eyebrow: "بيروت",
      title: "محل زهور في الأشرفية | بوتيك Presentail في بيروت",
      description:
        "محل زهور Presentail في الأشرفية يقع على بُعد خطوات من مستشفى أوتيل ديو في شارع عبد الوهاب الإنكليزي، مع توصيل في نفس اليوم وتوصيل سريع خلال 90 دقيقة إلى جميع أنحاء بيروت.",
      datePublished: "2026-08-09",
      ogImage: { url: "/blog/flower-shop-in-achrafieh.webp", width: 1408, height: 768 },
      ctaHref: "https://presentail.com/ar-lb/beirut/category/flowers",
      ctaLabel: "تسوّق الزهور الآن ←",
      h1: "أفضل محل زهور في الأشرفية، بيروت",
      ogImageAlt: "محل زهور في الأشرفية بيروت — بوتيك Presentail",
      sections: [
        {
          body: "إذا كنت تبحث عن محل زهور في الأشرفية، فإن بوتيك Presentail في شارع عبد الوهاب الإنكليزي — على بُعد خطوات من مستشفى أوتيل ديو — هو الوجهة التي يقصدها أهل بيروت لاقتناء الزهور الطازجة شخصياً أو طلبها أونلاين مع توصيل في نفس اليوم إلى أي مكان في المدينة.\n\nالأشرفية دائماً كانت من أكثر أحياء بيروت المحبّة للزهور، من محلات الهدايا حول ساحة سعسين إلى البوتيكات المصطفّة على مونو والشوارع المحيطة بدرج سان نيكولاس. Presentail جزء من هذا التقليد، يخدم الحي بباقات طازجة ومنسّقة باحترافية للأعياد والذكرى السنوية والأفراح والتعازي ولحظات \"ببساطة لأنك تستحق\".",
        },
        {
          heading: "بوتيك الزهور في الأشرفية",
          body: "يقع محلّنا المادي في شارع عبد الوهاب الإنكليزي، الأشرفية، بيروت، بالقرب من مستشفى أوتيل ديو — محطة سهلة سواء قادماً من سعسين أو صيدكو أو مار مترا. ادخل لتتصفّح مخزوننا الطازج شخصياً، أو احصل على مساعدة في تصميم باقة على الفور، أو التقط طلبك الأونلاين.\n\nمفتوح يومياً من 7 صباحاً حتى 1 ليلاً — مبكّر بما يكفي لاستلام صباحي، ومتأخّر بما يكفي لتوصيل ليلي في اللحظة الأخيرة. اتصل مسبقاً على 03 136 532 للتحقق من المخزون أو تقديم طلب هاتفي.",
        },
        {
          heading: "لماذا يختار سكان الأشرفية Presentail",
          items: [
            "توصيل في نفس اليوم للطلبات المقدَّمة قبل الظهر",
            "توصيل سريع خلال 90 دقيقة في مناطق محددة من بيروت، بما فيها الأشرفية",
            "توصيل مجدوَل حتى 30 يوماً مسبقاً — مثالي للتخطيط المبكر للأعياد والذكريات السنوية",
            "تشكيلة واسعة تتجاوز الزهور: نباتات وكعكات وشوكولاتة وبالونات وشموع وهدايا متكاملة",
            "بطاقة شخصية مجانية مع كل طلب، لتصل الرسالة كما أردتَ تماماً",
            "سنوات من الخبرة في مساعدة اللبنانيين المغتربين على إرسال الزهور إلى الوطن، إلى جانب الزبائن من الحي",
          ],
        },
        {
          heading: "زهور لكل مناسبة في الأشرفية",
          body: "مهما كانت المناسبة، لدى محل زهورنا في الأشرفية تنسيق يناسبها:",
          items: [
            "أعياد الميلاد والذكريات السنوية — باقات مربوطة يدوياً وصناديق ورود",
            "عيد الأم، عيد الأب، عيد الحبّ، الكريسماس — كولكشنات موسمية، تتجدد على مدار السنة",
            "الأعراس والخطوبات — تنسيقات كبيرة وقطع وسط الطاولات، تُصنع بالطلب",
            "التعازي — تنسيقات راقية ومحترمة تُوصَّل بكل اهتمام",
            "الهدايا المؤسسية — زهور وهدايا متكاملة للعملاء والشركاء أو الفرق في الأشرفية وحولها",
          ],
        },
        {
          heading: "توصيل زهور في نفس اليوم في الأشرفية وما بعدها",
          body: "اطلب من بوتيكنا في الأشرفية وسنوصّل في نفس اليوم إلى جميع أنحاء بيروت، بما فيها الأشرفية والجميزة ومار مخايل وبدارو وفردان وحمرا ورأس بيروت. تحتاج أسرع؟ التوصيل السريع يوصل الزهور إلى مستلمك في أقل من 90 دقيقة في مناطق محددة — مثالي للتوصيل العاجل في الأشرفية.",
        },
        {
          heading: "زورونا أو اطلب أونلاين",
          body: "تفضّل بزيارة البوتيك في شارع عبد الوهاب الإنكليزي لاختيار باقتك شخصياً، أو اتصل بنا على 03 136 532 للطلب هاتفياً، أو تصفّح واطلب أونلاين مع توصيل في نفس اليوم إلى أي مكان في بيروت.",
        },
        {
          heading: "أسئلة شائعة",
          faqItems: [
            {
              q: "أين يقع محل زهور Presentail في الأشرفية؟",
              a: "يقع بوتيكنا في شارع عبد الوهاب الإنكليزي في الأشرفية، بيروت، بالقرب من مستشفى أوتيل ديو.",
            },
            {
              q: "هل تقدّمون توصيل زهور في نفس اليوم في الأشرفية؟",
              a: "نعم. الطلبات المقدَّمة قبل الظهر تُوصَّل في نفس اليوم، والتوصيل السريع خلال 90 دقيقة متاح في مناطق محددة بما فيها الأشرفية.",
            },
            {
              q: "هل يمكنني الدخول إلى محل الأشرفية لشراء الزهور شخصياً؟",
              a: "نعم، البوتيك مفتوح للزبائن الذين يرغبون في تصفّح المخزون الطازج أو استلام طلبهم الأونلاين شخصياً.",
            },
            {
              q: "هل تقومون بالتوصيل خارج الأشرفية؟",
              a: "نعم — من بوتيكنا في الأشرفية نوصّل في نفس اليوم إلى جميع أنحاء بيروت، بما فيها الجميزة ومار مخايل وبدارو وفردان وحمرا ورأس بيروت، وأيضاً إلى مناطق أبعد في لبنان.",
            },
            {
              q: "هل يمكنني جدولة توصيل الزهور مسبقاً؟",
              a: "نعم، يمكنك جدولة التوصيل حتى 30 يوماً مسبقاً، وهو أمر مفيد للتخطيط للأعياد والذكريات السنوية والمناسبات.",
            },
          ],
        },
      ],
      extraJsonLd: [
        {
          "@context": "https://schema.org",
          "@type": "LocalBusiness",
          "name": "Presentail",
          "address": {
            "@type": "PostalAddress",
            "streetAddress": "شارع عبد الوهاب الإنكليزي",
            "addressLocality": "الأشرفية",
            "addressRegion": "بيروت",
            "addressCountry": "LB",
            "postalCode": "1100",
          },
          "telephone": "+9613136532",
          "openingHoursSpecification": [
            {
              "@type": "OpeningHoursSpecification",
              "dayOfWeek": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
              "opens": "07:00",
              "closes": "01:00",
            },
          ],
        },
        {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          "mainEntity": [
            {
              "@type": "Question",
              "name": "أين يقع محل زهور Presentail في الأشرفية؟",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "يقع بوتيكنا في شارع عبد الوهاب الإنكليزي في الأشرفية، بيروت، بالقرب من مستشفى أوتيل ديو.",
              },
            },
            {
              "@type": "Question",
              "name": "هل تقدّمون توصيل زهور في نفس اليوم في الأشرفية؟",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "نعم. الطلبات المقدَّمة قبل الظهر تُوصَّل في نفس اليوم، والتوصيل السريع خلال 90 دقيقة متاح في مناطق محددة بما فيها الأشرفية.",
              },
            },
            {
              "@type": "Question",
              "name": "هل يمكنني الدخول إلى محل الأشرفية لشراء الزهور شخصياً؟",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "نعم، البوتيك مفتوح للزبائن الذين يرغبون في تصفّح المخزون الطازج أو استلام طلبهم الأونلاين شخصياً.",
              },
            },
            {
              "@type": "Question",
              "name": "هل تقومون بالتوصيل خارج الأشرفية؟",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "من بوتيكنا في الأشرفية نوصّل في نفس اليوم إلى جميع أنحاء بيروت، بما فيها الجميزة ومار مخايل وبدارو وفردان وحمرا ورأس بيروت، وأيضاً إلى مناطق أبعد في لبنان.",
              },
            },
            {
              "@type": "Question",
              "name": "هل يمكنني جدولة توصيل الزهور مسبقاً؟",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "نعم، يمكنك جدولة التوصيل حتى 30 يوماً مسبقاً، وهو أمر مفيد للتخطيط للأعياد والذكريات السنوية والمناسبات.",
              },
            },
          ],
        },
      ],
    },
    fr: {
      slug: "flower-shop-in-achrafieh",
      eyebrow: "Beyrouth",
      title: "Fleuriste à Achrafieh | Boutique Presentail à Beyrouth",
      description:
        "La boutique de fleurs Presentail à Achrafieh se trouve à deux pas de l'Hôtel-Dieu de France, rue Abdel Wahab El Inglizi, avec livraison le jour même et livraison express en 90 minutes dans tout Beyrouth.",
      datePublished: "2026-08-09",
      ogImage: { url: "/blog/flower-shop-in-achrafieh.webp", width: 1408, height: 768 },
      ctaHref: "https://presentail.com/fr-lb/beirut/category/flowers",
      ctaLabel: "Commander des fleurs →",
      h1: "Le meilleur fleuriste à Achrafieh, Beyrouth",
      ogImageAlt: "fleuriste à Achrafieh Beyrouth — boutique Presentail",
      sections: [
        {
          body: "Vous cherchez un fleuriste à Achrafieh ? La boutique Presentail, rue Abdel Wahab El Inglizi — à deux pas de l'Hôtel-Dieu de France — est l'endroit où Beyrouth vient acheter des fleurs fraîches en personne ou les commander en ligne pour une livraison le jour même partout dans la ville.\n\nAchrafieh a toujours été l'un des quartiers de Beyrouth les plus attachés aux fleurs, des boutiques de cadeaux autour de la place Sassine aux boutiques le long de Monot et des rues proches de l'escalier Saint-Nicolas. Presentail fait partie de cette tradition, servant le quartier avec des bouquets frais et arrangés professionnellement pour les anniversaires, les mariages, les condoléances et les occasions du quotidien.",
        },
        {
          heading: "Notre boutique de fleurs à Achrafieh",
          body: "Notre boutique est située rue Abdel Wahab El Inglizi, Achrafieh, Beyrouth, près de l'hôpital Hôtel-Dieu de France — un arrêt pratique que vous veniez de Sassine, Sodeco ou Mar Mitr. Entrez pour parcourir notre stock frais en personne, obtenir de l'aide pour composer un bouquet sur place, ou récupérer une commande en ligne.\n\nOuverte tous les jours de 7h à 1h du matin — assez tôt pour un retrait matinal, assez tard pour une livraison de dernière minute en soirée. Appelez au préalable le 03 136 532 pour vérifier les disponibilités ou passer une commande par téléphone.",
        },
        {
          heading: "Pourquoi les habitants d'Achrafieh choisissent Presentail",
          items: [
            "Livraison le jour même pour les commandes passées avant midi",
            "Livraison express en 90 minutes dans certaines zones de Beyrouth, dont Achrafieh",
            "Livraison programmée jusqu'à 30 jours à l'avance — idéale pour planifier anniversaires et fêtes",
            "Un large choix au-delà des fleurs : plantes, gâteaux, chocolats, ballons, bougies et coffrets cadeaux",
            "Une carte personnalisée offerte avec chaque commande, pour que le message arrive exactement comme vous le souhaitez",
            "Des années d'expérience à aider les Libanais expatriés à envoyer des fleurs au pays, aux côtés des clients du quartier",
          ],
        },
        {
          heading: "Des fleurs pour chaque occasion à Achrafieh",
          body: "Quelle que soit la raison, notre fleuriste à Achrafieh a une composition pour chaque occasion :",
          items: [
            "Anniversaires — bouquets noués à la main et boîtes à fleurs",
            "Fête des mères, fête des pères, Saint-Valentin, Noël — collections saisonnières, renouvelées tout au long de l'année",
            "Mariages et fiançailles — grandes compositions et centres de table, faits sur commande",
            "Condoléances — compositions sobres et respectueuses, livrées avec soin",
            "Cadeaux d'entreprise — fleurs et coffrets pour clients, partenaires ou équipes à Achrafieh et alentours",
          ],
        },
        {
          heading: "Livraison de fleurs le jour même à Achrafieh et au-delà",
          body: "Commandez depuis notre boutique d'Achrafieh et nous livrons le jour même dans tout Beyrouth, dont Achrafieh, Gemmayzeh, Mar Mikhael, Badaro, Verdun, Hamra et Ras Beyrouth. Besoin d'aller plus vite ? La livraison express achemine vos fleurs chez le destinataire en moins de 90 minutes dans certaines zones — idéale pour les livraisons urgentes à Achrafieh.",
        },
        {
          heading: "Rendez-nous visite ou commandez en ligne",
          body: "Passez à la boutique rue Abdel Wahab El Inglizi pour choisir votre bouquet en personne, appelez le 03 136 532 pour commander par téléphone, ou parcourez notre catalogue en ligne pour une livraison le jour même partout à Beyrouth.",
        },
        {
          heading: "Questions fréquentes",
          faqItems: [
            {
              q: "Où se trouve la boutique de fleurs Presentail à Achrafieh ?",
              a: "Notre boutique est rue Abdel Wahab El Inglizi à Achrafieh, Beyrouth, près de l'hôpital Hôtel-Dieu de France.",
            },
            {
              q: "Proposez-vous la livraison de fleurs le jour même à Achrafieh ?",
              a: "Oui. Les commandes passées avant midi sont livrées le jour même, et la livraison express en 90 minutes est disponible dans certaines zones dont Achrafieh.",
            },
            {
              q: "Puis-je entrer dans la boutique d'Achrafieh pour acheter des fleurs en personne ?",
              a: "Oui, la boutique est ouverte aux clients qui souhaitent parcourir le stock frais ou récupérer une commande en ligne en personne.",
            },
            {
              q: "Livrez-vous en dehors d'Achrafieh ?",
              a: "Oui — depuis notre boutique d'Achrafieh, nous livrons le jour même dans tout Beyrouth, dont Gemmayzeh, Mar Mikhael, Badaro, Verdun, Hamra et Ras Beyrouth, ainsi que plus loin au Liban.",
            },
            {
              q: "Puis-je programmer une livraison de fleurs à l'avance ?",
              a: "Oui, vous pouvez programmer une livraison jusqu'à 30 jours à l'avance, ce qui est pratique pour planifier des anniversaires, des fêtes ou des événements.",
            },
          ],
        },
      ],
      extraJsonLd: [
        {
          "@context": "https://schema.org",
          "@type": "LocalBusiness",
          "name": "Presentail",
          "address": {
            "@type": "PostalAddress",
            "streetAddress": "Rue Abdel Wahab El Inglizi",
            "addressLocality": "Achrafieh",
            "addressRegion": "Beyrouth",
            "addressCountry": "LB",
            "postalCode": "1100",
          },
          "telephone": "+9613136532",
          "openingHoursSpecification": [
            {
              "@type": "OpeningHoursSpecification",
              "dayOfWeek": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
              "opens": "07:00",
              "closes": "01:00",
            },
          ],
        },
        {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          "mainEntity": [
            {
              "@type": "Question",
              "name": "Où se trouve la boutique de fleurs Presentail à Achrafieh ?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "Notre boutique est rue Abdel Wahab El Inglizi à Achrafieh, Beyrouth, près de l'hôpital Hôtel-Dieu de France.",
              },
            },
            {
              "@type": "Question",
              "name": "Proposez-vous la livraison de fleurs le jour même à Achrafieh ?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "Oui. Les commandes passées avant midi sont livrées le jour même, et la livraison express en 90 minutes est disponible dans certaines zones dont Achrafieh.",
              },
            },
            {
              "@type": "Question",
              "name": "Puis-je entrer dans la boutique d'Achrafieh pour acheter des fleurs en personne ?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "Oui, la boutique est ouverte aux clients qui souhaitent parcourir le stock frais ou récupérer une commande en ligne en personne.",
              },
            },
            {
              "@type": "Question",
              "name": "Livrez-vous en dehors d'Achrafieh ?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "Depuis notre boutique d'Achrafieh, nous livrons le jour même dans tout Beyrouth, dont Gemmayzeh, Mar Mikhael, Badaro, Verdun, Hamra et Ras Beyrouth, ainsi que plus loin au Liban.",
              },
            },
            {
              "@type": "Question",
              "name": "Puis-je programmer une livraison de fleurs à l'avance ?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "Oui, vous pouvez programmer une livraison jusqu'à 30 jours à l'avance, ce qui est pratique pour planifier des anniversaires, des fêtes ou des événements.",
              },
            },
          ],
        },
      ],
    },
  },

  "send-roses-to-lebanon": {
    en: {
      slug: "send-roses-to-lebanon",
      eyebrow: "Lebanon",
      title: "How to Send Roses to Lebanon | Same-Day, Nationwide Delivery",
      h1: "Send Roses to Lebanon: Same-Day Delivery, Nationwide",
      description:
        "Sending roses to Lebanon? Presentail delivers fresh red, pastel, and preserved roses same-day to any city or district in Lebanon, with free delivery over $75.",
      datePublished: "2026-08-09",
      ogImage: { url: "/blog/send-roses-to-lebanon.webp", width: 1408, height: 768 },
      ctaHref: "https://presentail.com/en-lb/beirut/category/flowers",
      ctaLabel: "Shop roses now →",
      extraJsonLd: [
        {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: [
            {
              "@type": "Question",
              name: "What's the best way to send roses to Lebanon from abroad?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Order online through Presentail — choose the arrangement, add a personalized card message, and Presentail's local fleet handles delivery in Lebanon, so you don't need a local contact to receive or forward the order.",
              },
            },
            {
              "@type": "Question",
              name: "Do you deliver roses same-day anywhere in Lebanon?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Yes. Orders placed before 10 PM are delivered the same day nationwide, with 90-minute express delivery available in select Beirut zones.",
              },
            },
            {
              "@type": "Question",
              name: "Can I customize the rose box color?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Yes — the Colossal Rose Box and other boxed arrangements let you match the box color to the roses inside.",
              },
            },
            {
              "@type": "Question",
              name: "Do preserved roses really last forever?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Eternal roses are real roses treated through a preservation process, so with basic care (avoiding direct light and humidity) they hold their appearance indefinitely, unlike fresh-cut roses.",
              },
            },
            {
              "@type": "Question",
              name: "Is delivery free?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Delivery is free on orders above $75; smaller orders carry a standard delivery fee shown at checkout.",
              },
            },
          ],
        },
      ],
      sections: [
        {
          body: "Roses remain the most requested flower for roses Lebanon deliveries, and for good reason — they say more in one bouquet than almost any other gift. Whether you're a Lebanese expat sending roses home for the first time or ordering locally for tonight, here's what to know before you order.",
        },
        {
          heading: "Our Rose Collection",
          items: [
            "Classic red roses — the traditional choice for romance and anniversaries, sold as bouquets or boxed arrangements",
            "Pastel and mixed roses — softer tones for birthdays, congratulations, or \"thinking of you\" moments",
            "Colossal Rose Box — a statement-sized arrangement of 170–180 roses, with the box color customizable to match",
            "Eternal (preserved) roses — real roses treated to last indefinitely, a popular pick for milestones like anniversaries or \"forever\" messages",
          ],
        },
        {
          heading: "Why Send Roses Through Presentail",
          items: [
            "Nationwide coverage — Presentail runs its own fleet of drivers and delivers to every city and district in Lebanon, not just Beirut",
            "Same-day delivery on orders placed before 10 PM, plus express 90-minute delivery in select Beirut zones",
            "Free delivery on orders above $75",
            "Satisfaction guarantee — if an order arrives damaged or doesn't arrive, Presentail refunds or replaces it",
            "Built specifically for the expat use case: order from abroad in a few clicks, and the recipient in Lebanon gets fresh, freshly arranged roses at their door",
          ],
        },
        {
          heading: "Roses for Every Occasion",
          items: [
            "Red roses — romantic love, anniversaries, Valentine's Day",
            "White roses — purity, sympathy, and condolence arrangements",
            "Pink roses — admiration, gratitude, and friendship",
            "Pastel and mixed roses — birthdays, get-well wishes, and everyday \"just because\" gestures",
            "Preserved/eternal roses — weddings, milestone anniversaries, or any moment meant to last",
          ],
        },
        {
          heading: "How to Keep Your Roses Fresh Longer",
          body: "A few simple habits stretch a fresh rose arrangement out to about a week:",
          items: [
            "Change the vase water completely every 2–3 days",
            "Trim about half an inch off each stem whenever you change the water",
            "Keep roses away from direct sunlight and heat",
            "Don't place roses near ripening fruit, especially bananas and apples — the ethylene gas speeds up wilting",
          ],
        },
        {
          body: "With this care, a fresh rose bouquet from Presentail typically lasts up to 7 days.",
        },
        {
          heading: "Delivering Roses Across Lebanon",
          body: "Because Presentail delivers with its own fleet rather than relying on regional florist partners, roses ordered for Beirut, Mount Lebanon, the South, the North, or the Bekaa all go through the same same-day process. Order before 10 PM for same-day delivery anywhere in the country, or use express delivery for a 90-minute window in select Beirut zones.",
        },
        {
          heading: "Frequently Asked Questions",
          faqItems: [
            {
              q: "What's the best way to send roses to Lebanon from abroad?",
              a: "Order online through Presentail — choose the arrangement, add a personalized card message, and Presentail's local fleet handles delivery in Lebanon, so you don't need a local contact to receive or forward the order.",
            },
            {
              q: "Do you deliver roses same-day anywhere in Lebanon?",
              a: "Yes. Orders placed before 10 PM are delivered the same day nationwide, with 90-minute express delivery available in select Beirut zones.",
            },
            {
              q: "Can I customize the rose box color?",
              a: "Yes — the Colossal Rose Box and other boxed arrangements let you match the box color to the roses inside.",
            },
            {
              q: "Do preserved roses really last forever?",
              a: "Eternal roses are real roses treated through a preservation process, so with basic care (avoiding direct light and humidity) they hold their appearance indefinitely, unlike fresh-cut roses.",
            },
            {
              q: "Is delivery free?",
              a: "Delivery is free on orders above $75; smaller orders carry a standard delivery fee shown at checkout.",
            },
          ],
        },
      ],
    },
    ar: {
      slug: "send-roses-to-lebanon",
      eyebrow: "لبنان",
      title: "أرسل الورود إلى لبنان | توصيل في نفس اليوم لجميع المناطق",
      h1: "أرسل الورود إلى لبنان: توصيل في نفس اليوم لجميع المناطق",
      description:
        "تريد إرسال ورود إلى لبنان؟ Presentail يوصّل ورود طازجة حمراء وبألوان باستيل ومحفوظة في نفس اليوم إلى أي مدينة أو منطقة في لبنان، مع توصيل مجاني للطلبات التي تتجاوز 75 دولاراً.",
      datePublished: "2026-08-09",
      ogImage: { url: "/blog/send-roses-to-lebanon.webp", width: 1408, height: 768 },
      ctaHref: "https://presentail.com/en-lb/beirut/category/flowers",
      ctaLabel: "تسوّق الورود الآن ←",
      sections: [
        {
          body: "تبقى الورود الزهرة الأكثر طلباً في توصيلات لبنان، وذلك لسبب وجيه — فلا شيء يعبّر أكثر في باقة واحدة تقريباً من أي هدية أخرى. سواء كنت مغترباً لبنانياً ترسل ورود إلى وطنك للمرة الأولى، أو تطلب محلياً لهذه الليلة، إليك ما يجدر معرفته قبل أن تطلب.",
        },
        {
          heading: "مجموعة الورود لدينا",
          items: [
            "الورود الحمراء الكلاسيكية — الخيار التقليدي للرومانسية وأعياد الزواج، تُباع باقاتٍ أو تشكيلاتٍ في صناديق",
            "الورود الباستيل والمتنوّعة — ألوان ناعمة لأعياد الميلاد والتهاني أو لحظات «أنا أفكّر فيك»",
            "صندوق الورود العملاق (Colossal Rose Box) — تشكيلة استثنائية تضمّ 170–180 وردة، مع إمكانية تخصيص لون الصندوق ليناسب الورود",
            "الورود الأبدية (المحفوظة) — ورود حقيقية خضعت لمعالجة تجعلها تدوم إلى الأبد، خيار شائع للمناسبات الكبرى كأعياد الزواج أو رسائل «إلى الأبد»",
          ],
        },
        {
          heading: "لماذا ترسل الورود عبر Presentail",
          items: [
            "تغطية على مستوى البلاد — تمتلك Presentail أسطولها الخاص من السائقين وتوصّل إلى كل مدينة ومنطقة في لبنان، ليس إلى بيروت فحسب",
            "توصيل في نفس اليوم للطلبات المقدَّمة قبل الساعة 10 مساءً، مع خيار التوصيل السريع خلال 90 دقيقة في مناطق محددة من بيروت",
            "توصيل مجاني للطلبات التي تتجاوز 75 دولاراً",
            "ضمان الرضا — إذا وصل الطلب تالفاً أو لم يصل، تقوم Presentail بالاسترداد أو الاستبدال",
            "مُصمَّم خصيصاً لحالة المغتربين: اطلب من الخارج بضغطات بسيطة، وسيصل المستلم في لبنان ورود طازجة ومرتّبة حديثاً إلى بابه",
          ],
        },
        {
          heading: "ورود لكل مناسبة",
          items: [
            "الورود الحمراء — الحب الرومانسي، أعياد الزواج، عيد الحبّ",
            "الورود البيضاء — النقاء، وباقات التعزية والمواساة",
            "الورود الوردية — الإعجاب، الامتنان، والصداقة",
            "الورود الباستيل والمتنوّعة — أعياد الميلاد، تمنيات الشفاء، ولفتات «بلا مناسبة» اليومية",
            "الورود المحفوظة/الأبدية — حفلات الزفاف، الذكريات السنوية الكبرى، أو أي لحظة تستحق أن تدوم",
          ],
        },
        {
          heading: "كيف تحافظ على ورودك طازجة لفترة أطول",
          body: "بضع عادات بسيطة تمدّ عمر باقة الورود الطازجة إلى قرابة أسبوع:",
          items: [
            "غيّر ماء المزهرية كاملاً كل يومين إلى ثلاثة أيام",
            "قصّ نحو سنتيمتر من كل ساق في كل مرة تغيّر فيها الماء",
            "أبعد الورود عن أشعة الشمس المباشرة والحرارة",
            "لا تضع الورود بجانب الفواكه الناضجة، خاصةً الموز والتفاح — فغاز الإيثيلين يُسرّع الذبول",
          ],
        },
        {
          body: "مع هذه العناية، تدوم باقة الورود الطازجة من Presentail عادةً حتى 7 أيام.",
        },
        {
          heading: "توصيل الورود في جميع أنحاء لبنان",
          body: "لأن Presentail تعتمد على أسطولها الخاص بدلاً من الاعتماد على شركاء محليين من محلات الزهور، فإن الورود المطلوبة لبيروت أو جبل لبنان أو الجنوب أو الشمال أو البقاع تمرّ جميعها بنفس عملية التوصيل في اليوم ذاته. اطلب قبل الساعة 10 مساءً للتوصيل في اليوم نفسه في أي مكان في البلاد، أو استخدم خدمة التوصيل السريع للحصول على نافذة 90 دقيقة في مناطق مختارة من بيروت.",
        },
        {
          heading: "أسئلة شائعة",
          faqItems: [
            {
              q: "ما أفضل طريقة لإرسال الورود إلى لبنان من الخارج؟",
              a: "اطلب عبر الإنترنت من خلال Presentail — اختر التشكيلة، أضف رسالة بطاقة شخصية، وسيتولّى أسطول Presentail المحلي التوصيل في لبنان، دون الحاجة إلى جهة تواصل محلية لاستلام الطلب أو تمريره.",
            },
            {
              q: "هل تُوصّلون الورود في نفس اليوم إلى أي مكان في لبنان؟",
              a: "نعم. الطلبات المقدَّمة قبل الساعة 10 مساءً تُوصَّل في اليوم ذاته في جميع أنحاء البلاد، مع خيار التوصيل السريع خلال 90 دقيقة في مناطق محددة من بيروت.",
            },
            {
              q: "هل يمكنني تخصيص لون صندوق الورود؟",
              a: "نعم — صندوق الورود العملاق (Colossal Rose Box) والتشكيلات الأخرى في صناديق تتيح لك مطابقة لون الصندوق مع الورود بداخله.",
            },
            {
              q: "هل تدوم الورود المحفوظة حقاً إلى الأبد؟",
              a: "الورود الأبدية هي ورود حقيقية خضعت لعملية حفظ، لذا مع العناية الأساسية (تجنّب الضوء المباشر والرطوبة) تحتفظ بمظهرها إلى أجل غير مسمى، على خلاف الورود الطازجة المقطوعة.",
            },
            {
              q: "هل التوصيل مجاني؟",
              a: "التوصيل مجاني للطلبات التي تتجاوز 75 دولاراً؛ الطلبات الأصغر تخضع لرسوم توصيل قياسية تظهر عند الدفع.",
            },
          ],
        },
      ],
    },
    fr: {
      slug: "send-roses-to-lebanon",
      eyebrow: "Liban",
      title: "Envoyer des roses au Liban | Livraison le jour même, dans tout le pays",
      h1: "Envoyer des roses au Liban : livraison le jour même, partout au Liban",
      description:
        "Vous souhaitez envoyer des roses au Liban ? Presentail livre des roses fraîches rouges, pastel et éternelles le jour même dans toutes les villes et régions du Liban, avec livraison gratuite dès 75 $.",
      datePublished: "2026-08-09",
      ogImage: { url: "/blog/send-roses-to-lebanon.webp", width: 1408, height: 768 },
      ctaHref: "https://presentail.com/en-lb/beirut/category/flowers",
      ctaLabel: "Commander des roses →",
      sections: [
        {
          body: "Les roses restent la fleur la plus demandée pour les livraisons au Liban, et pour une bonne raison — elles en disent plus en un seul bouquet que presque n'importe quel autre cadeau. Que vous soyez un expatrié libanais qui envoie des roses chez lui pour la première fois, ou que vous commandiez localement pour ce soir, voici ce qu'il faut savoir avant de passer commande.",
        },
        {
          heading: "Notre collection de roses",
          items: [
            "Roses rouges classiques — le choix traditionnel pour la romance et les anniversaires, vendues en bouquets ou en compositions en boîte",
            "Roses pastel et mixtes — des teintes douces pour les anniversaires, les félicitations ou les gestes « je pense à toi »",
            "Colossal Rose Box — une composition spectaculaire de 170 à 180 roses, avec la couleur de la boîte personnalisable à volonté",
            "Roses éternelles (préservées) — de vraies roses traitées pour durer indéfiniment, un choix prisé pour les grandes étapes comme les anniversaires de mariage ou les messages « pour toujours »",
          ],
        },
        {
          heading: "Pourquoi envoyer des roses via Presentail",
          items: [
            "Couverture nationale — Presentail dispose de sa propre flotte de livreurs et livre dans toutes les villes et régions du Liban, pas seulement à Beyrouth",
            "Livraison le jour même pour les commandes passées avant 22 h, plus une livraison express en 90 minutes dans certaines zones de Beyrouth",
            "Livraison gratuite pour les commandes supérieures à 75 $",
            "Garantie de satisfaction — si une commande arrive endommagée ou n'arrive pas, Presentail rembourse ou remplace",
            "Conçu spécifiquement pour le cas des expatriés : commandez depuis l'étranger en quelques clics, et le destinataire au Liban reçoit des roses fraîches et fraîchement arrangées à sa porte",
          ],
        },
        {
          heading: "Des roses pour chaque occasion",
          items: [
            "Roses rouges — amour romantique, anniversaires, Saint-Valentin",
            "Roses blanches — pureté, sympathie et compositions de condoléances",
            "Roses roses — admiration, gratitude et amitié",
            "Roses pastel et mixtes — anniversaires, souhaits de prompt rétablissement et gestes du quotidien « juste parce que »",
            "Roses préservées/éternelles — mariages, grands anniversaires ou tout moment destiné à durer",
          ],
        },
        {
          heading: "Comment garder vos roses fraîches plus longtemps",
          body: "Quelques habitudes simples permettent de prolonger la durée de vie d'un bouquet de roses fraîches d'environ une semaine :",
          items: [
            "Changez complètement l'eau du vase tous les 2 à 3 jours",
            "Coupez environ un centimètre sur chaque tige à chaque changement d'eau",
            "Éloignez les roses de la lumière directe du soleil et de la chaleur",
            "Ne placez pas les roses près de fruits qui mûrissent, surtout des bananes et des pommes — le gaz éthylène accélère le flétrissement",
          ],
        },
        {
          body: "Avec ces soins, un bouquet de roses fraîches de Presentail dure généralement jusqu'à 7 jours.",
        },
        {
          heading: "Livraison de roses dans tout le Liban",
          body: "Parce que Presentail livre avec sa propre flotte plutôt que de s'appuyer sur des partenaires fleuristes régionaux, les roses commandées pour Beyrouth, le Mont-Liban, le Sud, le Nord ou la Bekaa passent toutes par le même processus de livraison le jour même. Commandez avant 22 h pour une livraison le jour même partout dans le pays, ou optez pour la livraison express pour une fenêtre de 90 minutes dans certaines zones de Beyrouth.",
        },
        {
          heading: "Questions fréquentes",
          faqItems: [
            {
              q: "Quel est le meilleur moyen d'envoyer des roses au Liban depuis l'étranger ?",
              a: "Commandez en ligne via Presentail — choisissez la composition, ajoutez un message de carte personnalisé, et la flotte locale de Presentail se charge de la livraison au Liban, sans que vous ayez besoin d'un contact local pour réceptionner ou transmettre la commande.",
            },
            {
              q: "Livrez-vous des roses le jour même partout au Liban ?",
              a: "Oui. Les commandes passées avant 22 h sont livrées le jour même dans tout le pays, avec une livraison express en 90 minutes disponible dans certaines zones de Beyrouth.",
            },
            {
              q: "Puis-je personnaliser la couleur de la boîte à roses ?",
              a: "Oui — la Colossal Rose Box et les autres compositions en boîte vous permettent d'assortir la couleur de la boîte aux roses qu'elle contient.",
            },
            {
              q: "Les roses éternelles durent-elles vraiment indéfiniment ?",
              a: "Les roses éternelles sont de vraies roses qui ont subi un processus de conservation ; avec des soins de base (éviter la lumière directe et l'humidité), elles conservent leur apparence indéfiniment, contrairement aux roses fraîches coupées.",
            },
            {
              q: "La livraison est-elle gratuite ?",
              a: "La livraison est gratuite pour les commandes supérieures à 75 $ ; les commandes moins importantes sont soumises à des frais de livraison standard affichés lors du paiement.",
            },
          ],
        },
      ],
    },
  },

  "balloon-delivery-beirut-lebanon": {
    en: {
      slug: "balloon-delivery-beirut-lebanon",
      eyebrow: "Delivery guide",
      title: "Balloon delivery in Beirut, Lebanon",
      description:
        "Everything you need to know about same-day balloon delivery in Beirut — from helium and foil balloons to bouquets for birthdays, graduations, new arrivals and get-well celebrations.",
      datePublished: "2026-08-09",
      ogImage: { url: "/blog/balloon-delivery-beirut-lebanon.webp", width: 1408, height: 768 },
      ctaHref: "/en-lb/beirut/category/balloons",
      ctaLabel: "Shop balloon delivery in Beirut",
      sections: [
        {
          body: "Balloons carry a particular kind of energy that flowers and chocolates alone cannot replicate — they are colour, motion, and celebration all at once. Whether you are sending a single oversized foil star or a full balloon bouquet, Presentail delivers balloons across Beirut and throughout Lebanon, usually the same day you order.",
        },
        {
          heading: "Same-day balloon delivery in Beirut",
          body: "Order before midday and your balloons can arrive the same afternoon — in Hamra, Achrafieh, Gemmayzeh, Verdun, Badaro, Mar Mikhael, and every other neighbourhood in Beirut. Our delivery partners handle balloons with care so they arrive inflated and intact, ready to make the moment. Orders placed after midday are confirmed for the next available delivery window.",
        },
        {
          heading: "What kinds of balloons can you send?",
          body: "Presentail's balloon range includes helium balloons that float freely, foil and mylar balloons in shapes and characters that hold their inflation longer, and curated balloon bouquets designed to arrive as a complete, tied arrangement. We also carry number and letter balloons for milestone birthdays, anniversaries, and graduation celebrations. Every type is available for same-day delivery across Beirut.",
        },
        {
          heading: "Occasions that call for balloons",
          body: "Balloons are among the most versatile gifts we carry. A birthday without them feels like a missed beat. They brighten a hospital room for a get-well visit, mark a new baby's arrival with a soft palette of pinks or blues, and signal a graduation across a crowded garden. They also work quietly: a single foil balloon on a colleague's desk says 'happy birthday' without a speech. Whatever the moment, we can usually get them there by the afternoon.",
        },
        {
          heading: "Sending balloons anywhere in Lebanon",
          body: "Beirut is our primary hub, but Presentail delivers balloons everywhere in Lebanon — Tripoli, Saida, Zahle, Jbeil, and the dozens of cities and towns in between. If you are overseas and want to send balloons to someone in Lebanon for a birthday or celebration, the process is the same: choose your products, enter the recipient's address, and we handle the rest. International cards and wallets are accepted at checkout.",
        },
        {
          heading: "Pairing balloons with other gifts",
          body: "Balloons pair naturally with almost everything in our catalogue. A birthday balloon bouquet alongside a fresh flower arrangement is a statement. Add a box of chocolates and you have a full gift without needing to visit a shop. For a new baby, a pastel balloon and a plant is a combination that survives the first chaotic week without wilting. We let you add products from different categories to a single order at checkout, with one delivery.",
        },
      ],
    },
    ar: {
      slug: "balloon-delivery-beirut-lebanon",
      eyebrow: "Delivery guide",
      title: "Balloon delivery in Beirut, Lebanon",
      description:
        "Everything you need to know about same-day balloon delivery in Beirut — from helium and foil balloons to bouquets for birthdays, graduations, new arrivals and get-well celebrations.",
      datePublished: "2026-08-09",
      ogImage: { url: "/blog/balloon-delivery-beirut-lebanon.webp", width: 1408, height: 768 },
      ctaHref: "/en-lb/beirut/category/balloons",
      ctaLabel: "Shop balloon delivery in Beirut",
      sections: [
        {
          body: "Balloons carry a particular kind of energy that flowers and chocolates alone cannot replicate — they are colour, motion, and celebration all at once. Whether you are sending a single oversized foil star or a full balloon bouquet, Presentail delivers balloons across Beirut and throughout Lebanon, usually the same day you order.",
        },
        {
          heading: "Same-day balloon delivery in Beirut",
          body: "Order before midday and your balloons can arrive the same afternoon — in Hamra, Achrafieh, Gemmayzeh, Verdun, Badaro, Mar Mikhael, and every other neighbourhood in Beirut. Our delivery partners handle balloons with care so they arrive inflated and intact, ready to make the moment. Orders placed after midday are confirmed for the next available delivery window.",
        },
        {
          heading: "What kinds of balloons can you send?",
          body: "Presentail's balloon range includes helium balloons that float freely, foil and mylar balloons in shapes and characters that hold their inflation longer, and curated balloon bouquets designed to arrive as a complete, tied arrangement. We also carry number and letter balloons for milestone birthdays, anniversaries, and graduation celebrations. Every type is available for same-day delivery across Beirut.",
        },
        {
          heading: "Occasions that call for balloons",
          body: "Balloons are among the most versatile gifts we carry. A birthday without them feels like a missed beat. They brighten a hospital room for a get-well visit, mark a new baby's arrival with a soft palette of pinks or blues, and signal a graduation across a crowded garden. They also work quietly: a single foil balloon on a colleague's desk says 'happy birthday' without a speech. Whatever the moment, we can usually get them there by the afternoon.",
        },
        {
          heading: "Sending balloons anywhere in Lebanon",
          body: "Beirut is our primary hub, but Presentail delivers balloons everywhere in Lebanon — Tripoli, Saida, Zahle, Jbeil, and the dozens of cities and towns in between. If you are overseas and want to send balloons to someone in Lebanon for a birthday or celebration, the process is the same: choose your products, enter the recipient's address, and we handle the rest. International cards and wallets are accepted at checkout.",
        },
        {
          heading: "Pairing balloons with other gifts",
          body: "Balloons pair naturally with almost everything in our catalogue. A birthday balloon bouquet alongside a fresh flower arrangement is a statement. Add a box of chocolates and you have a full gift without needing to visit a shop. For a new baby, a pastel balloon and a plant is a combination that survives the first chaotic week without wilting. We let you add products from different categories to a single order at checkout, with one delivery.",
        },
      ],
    },
    fr: {
      slug: "balloon-delivery-beirut-lebanon",
      eyebrow: "Delivery guide",
      title: "Balloon delivery in Beirut, Lebanon",
      description:
        "Everything you need to know about same-day balloon delivery in Beirut — from helium and foil balloons to bouquets for birthdays, graduations, new arrivals and get-well celebrations.",
      datePublished: "2026-08-09",
      ogImage: { url: "/blog/balloon-delivery-beirut-lebanon.webp", width: 1408, height: 768 },
      ctaHref: "/en-lb/beirut/category/balloons",
      ctaLabel: "Shop balloon delivery in Beirut",
      sections: [
        {
          body: "Balloons carry a particular kind of energy that flowers and chocolates alone cannot replicate — they are colour, motion, and celebration all at once. Whether you are sending a single oversized foil star or a full balloon bouquet, Presentail delivers balloons across Beirut and throughout Lebanon, usually the same day you order.",
        },
        {
          heading: "Same-day balloon delivery in Beirut",
          body: "Order before midday and your balloons can arrive the same afternoon — in Hamra, Achrafieh, Gemmayzeh, Verdun, Badaro, Mar Mikhael, and every other neighbourhood in Beirut. Our delivery partners handle balloons with care so they arrive inflated and intact, ready to make the moment. Orders placed after midday are confirmed for the next available delivery window.",
        },
        {
          heading: "What kinds of balloons can you send?",
          body: "Presentail's balloon range includes helium balloons that float freely, foil and mylar balloons in shapes and characters that hold their inflation longer, and curated balloon bouquets designed to arrive as a complete, tied arrangement. We also carry number and letter balloons for milestone birthdays, anniversaries, and graduation celebrations. Every type is available for same-day delivery across Beirut.",
        },
        {
          heading: "Occasions that call for balloons",
          body: "Balloons are among the most versatile gifts we carry. A birthday without them feels like a missed beat. They brighten a hospital room for a get-well visit, mark a new baby's arrival with a soft palette of pinks or blues, and signal a graduation across a crowded garden. They also work quietly: a single foil balloon on a colleague's desk says 'happy birthday' without a speech. Whatever the moment, we can usually get them there by the afternoon.",
        },
        {
          heading: "Sending balloons anywhere in Lebanon",
          body: "Beirut is our primary hub, but Presentail delivers balloons everywhere in Lebanon — Tripoli, Saida, Zahle, Jbeil, and the dozens of cities and towns in between. If you are overseas and want to send balloons to someone in Lebanon for a birthday or celebration, the process is the same: choose your products, enter the recipient's address, and we handle the rest. International cards and wallets are accepted at checkout.",
        },
        {
          heading: "Pairing balloons with other gifts",
          body: "Balloons pair naturally with almost everything in our catalogue. A birthday balloon bouquet alongside a fresh flower arrangement is a statement. Add a box of chocolates and you have a full gift without needing to visit a shop. For a new baby, a pastel balloon and a plant is a combination that survives the first chaotic week without wilting. We let you add products from different categories to a single order at checkout, with one delivery.",
        },
      ],
    },
  },

  "baby-boy-balloons": {
    en: {
      slug: "baby-boy-balloons",
      eyebrow: "Baby & Newborn",
      // title includes "| Presentail" explicitly because h1 is also set —
      // BlogPost.tsx and buildBlogPostHead() both skip appending the suffix
      // when h1 is present (h1 = visible heading, title = full meta title).
      title: "Baby Boy Balloons: Adorable Ideas to Celebrate His Arrival | Presentail",
      h1: "Baby Boy Balloons: Adorable Ideas to Celebrate His Arrival",
      description:
        "Looking for baby boy balloons? Discover ten ideas — blue helium bouquets, foil stars, letter balloons, and more — plus safety tips and same-day delivery across Lebanon.",
      datePublished: "2026-08-10",
      ogImage: { url: "/blog/baby-boy-balloons.webp", width: 1408, height: 768 },
      ogImageAlt: "Blue baby boy balloons arranged for a newborn celebration",
      ctaHref: "/en-lb/beirut/category/balloons",
      ctaLabel: "Explore Balloons & Gifts",
      extraJsonLd: [
        {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: [
            {
              "@type": "Question",
              name: "What balloons are best for a baby boy celebration?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Classic sky-blue and white helium balloons, foil 'It's a Boy' balloons, star-shaped mylar balloons in silver and blue, and letter balloons spelling the baby's name are all popular choices. Foil and mylar balloons last 3–5 days, making them ideal when family visits stretch across several days.",
              },
            },
            {
              "@type": "Question",
              name: "Are helium balloons safe around a newborn?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Keep balloons out of the baby's direct reach and never leave infants or small children unsupervised with inflated balloons or balloon fragments. Foil and mylar balloons are less likely to burst than latex, reducing the choking-hazard risk. Always dispose of deflated or burst balloons immediately.",
              },
            },
            {
              "@type": "Question",
              name: "Can I combine baby boy balloons with flowers or a gift basket?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Yes. Balloons pair beautifully with a fresh hand bouquet or a newborn gift basket. Presentail lets you add items from multiple categories to a single order with one delivery.",
              },
            },
            {
              "@type": "Question",
              name: "Do you deliver baby boy balloons the same day in Lebanon?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Yes. Orders placed before midday are delivered the same afternoon across Beirut and throughout Lebanon, with express 90-minute delivery available in select Beirut zones.",
              },
            },
            {
              "@type": "Question",
              name: "Can I send baby boy balloons from abroad to Lebanon?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Absolutely. Order online through Presentail from anywhere in the world, enter the recipient's address in Lebanon, and our local delivery team handles the rest. International cards and wallets are accepted at checkout.",
              },
            },
          ],
        },
      ],
      sections: [
        {
          body: `A new baby boy deserves a celebration that feels as joyful as the moment itself. <a href="/en-lb/beirut/category/balloons">Balloons</a> are one of the fastest ways to transform any room — whether it's a hospital ward, a living room, or a garden — into something that unmistakably says: he's here, and we're thrilled. This guide covers ten baby boy balloon ideas, how to choose the right type, what to pair them with, and when to send them.`,
        },
        {
          heading: "10 Baby Boy Balloon Ideas",
          body: "Here are ten baby boy balloon ideas ranging from simple to statement:",
          items: [
            "Classic sky-blue helium bouquet — a cluster of soft-blue and white latex balloons, the simplest and most universally recognised baby boy colour palette",
            "Foil 'It's a Boy' balloon — a large printed foil balloon announcing the news, works as a centrepiece on its own or as the anchor of a larger bouquet",
            "Silver and blue star mylar balloons — star-shaped foil balloons in silver and blue that float for 3–5 days, ideal for multi-day family visits",
            "Letter balloons spelling the baby's name — individually inflated letter balloons that double as a decoration and a personalised keepsake for the first nursery photo",
            "Number 1 balloon for the one-month milestone — a gold or silver '1' balloon marks the one-month celebration, a significant occasion in Lebanese family tradition",
            "Balloon bouquet with a newborn gift set — a curated blue bouquet paired with a newborn occasion set from the Presentail catalogue, combining décor and gift in one order",
            "White and gold balloon arch — a balloon arch in white and gold for a gender-reveal or welcome-home party, creates a full room backdrop for photos",
            "Blue and white confetti balloons — clear latex balloons filled with blue and white paper confetti, adds texture and playfulness to any bouquet",
            "Pastel rainbow bouquet — soft pastels including pale blue, mint, and peach for families who want a gentler, less colour-coded palette",
            "Balloon bouquet with hand bouquet — a blue balloon cluster alongside a white hand bouquet of garden roses or peonies, a combination that balances celebration energy with elegance",
          ],
        },
        {
          heading: "How to Choose the Right Baby Boy Balloon",
          body: "The right balloon depends on two things: how long it needs to last, and where it will be displayed. Latex helium balloons float for 12–24 hours — enough for the day of the birth or a single celebration. Foil and mylar balloons hold helium for 3–5 days, which is a better fit when relatives are arriving over several days or when you want the decoration to stay fresh through the full visiting week. If the celebration is outdoors in summer heat, foil balloons are also more stable in warm air than latex. For a hospital room where space is limited, a single large foil statement balloon is cleaner than a full bouquet. For a home living room, a full bouquet makes a stronger impression.",
        },
        {
          heading: "Balloon Safety Tips for Newborn Celebrations",
          body: "Balloons are safe in a newborn's environment when handled correctly. Keep inflated balloons tied and anchored out of the baby's direct reach at all times. Never leave infants or small children unsupervised near balloons — a burst latex balloon produces fragments that are a serious choking hazard for toddlers and older siblings who may be in the room. Dispose of any deflated or burst balloons immediately. Foil and mylar balloons burst less easily than latex under normal conditions, which makes them a lower-risk choice when the arrangement will be in a shared family space. Avoid placing balloons directly above a cot or a play mat.",
        },
        {
          heading: "Pairing Baby Boy Balloons with Flowers and Gift Baskets",
          body: `Balloons on their own make a room feel alive. Pairing them with a complementary gift creates a full welcome that the parents will remember long after the balloons have deflated. A blue balloon bouquet alongside a <a href="/en-lb/beirut/category/hand-bouquets">hand bouquet</a> of white blooms — garden roses, ranunculi, or peonies in soft tones — is a particularly elegant combination: the balloons bring the colour and energy; the flowers bring the elegance. For something more practical, combine the balloons with a <a href="/en-lb/beirut/category/gift-baskets">gift basket</a> stocked with newborn essentials or luxury treats for the new parents. Presentail lets you add products from multiple categories — balloons, flowers, gift baskets — to a single order with one delivery, so the entire welcome arrives at the door together. Pair with a <a href="/en-lb/beirut/occasion/new-born">newborn occasion set</a> for a complete package.`,
        },
        {
          heading: "When to Send Baby Boy Balloons",
          body: "The timing of a balloon delivery matters more than most people expect. Sending balloons to a hospital room on the birth day is a strong gesture that signals you heard the news immediately — but the room may be busy and the parents exhausted. A delivery on the second or third day, when the initial chaos has settled and the family is beginning to enjoy the moment, is often more appreciated. If the family has a welcome-home gathering or a naming celebration planned, coordinate the delivery to arrive an hour or two before guests, so the balloons are inflated and the room is ready when people walk in. For the one-month milestone — a significant occasion across Lebanese culture — a fresh balloon delivery paired with a cake or gift basket is the standard way to mark it.",
        },
        {
          heading: "Sending Baby Boy Balloons from Abroad to Lebanon",
          body: `One of the most common reasons people contact Presentail is distance. You have heard the news about a baby boy being born to family or friends in Beirut, Tripoli, or Sidon, and you are in Paris, London, Dubai, or Lagos. Ordering <a href="/en-lb/beirut/category/balloons">baby boy balloons</a> through Presentail from abroad works exactly the same as ordering locally: choose your products, enter the recipient's address in Lebanon, select a delivery date, and our team handles the local arrangement and delivery. International credit cards, debit cards, and digital wallets are accepted at checkout. Deliveries are confirmed by notification to the recipient before they arrive, so there are no surprises.`,
        },
        {
          heading: "Same-Day Baby Boy Balloon Delivery Across Lebanon",
          body: "Presentail delivers baby boy balloons across Beirut and throughout Lebanon, usually the same day you order. Place your order before midday for same-day afternoon delivery. Express delivery — a 90-minute window — is available in select Beirut zones for last-minute needs. Whether the new mother is at a hospital in Achrafieh, a home in Tripoli, or a family house in the Bekaa Valley, the process is the same: choose your balloons and gifts, enter the delivery address, and we handle the rest.",
        },
        {
          heading: "Frequently Asked Questions",
          faqItems: [
            {
              q: "What balloons are best for a baby boy celebration?",
              a: "Classic sky-blue and white helium balloons, foil 'It's a Boy' balloons, star-shaped mylar balloons in silver and blue, and letter balloons spelling the baby's name are all popular choices. Foil and mylar balloons last 3–5 days, making them ideal when family visits stretch across several days.",
            },
            {
              q: "Are helium balloons safe around a newborn?",
              a: "Keep balloons out of the baby's direct reach and never leave infants or small children unsupervised with inflated balloons or balloon fragments. Foil and mylar balloons are less likely to burst than latex, reducing the choking-hazard risk. Always dispose of deflated or burst balloons immediately.",
            },
            {
              q: "Can I combine baby boy balloons with flowers or a gift basket?",
              a: "Yes. Balloons pair beautifully with a fresh hand bouquet or a newborn gift basket. Presentail lets you add items from multiple categories to a single order with one delivery.",
            },
            {
              q: "Do you deliver baby boy balloons the same day in Lebanon?",
              a: "Yes. Orders placed before midday are delivered the same afternoon across Beirut and throughout Lebanon, with express 90-minute delivery available in select Beirut zones.",
            },
            {
              q: "Can I send baby boy balloons from abroad to Lebanon?",
              a: "Absolutely. Order online through Presentail from anywhere in the world, enter the recipient's address in Lebanon, and our local delivery team handles the rest. International cards and wallets are accepted at checkout.",
            },
          ],
        },
      ],
    },
    ar: {
      slug: "baby-boy-balloons",
      eyebrow: "أطفال ومواليد",
      // Arabic metadata stub — body sections use English copy pending full translation (separate task).
      title: "بالونات مولود صبي: أفكار جميلة للاحتفال بقدومه | Presentail",
      h1: "بالونات مولود صبي: أفكار جميلة للاحتفال بقدومه",
      description:
        "هل تبحث عن بالونات مولود صبي؟ اكتشف عشر أفكار — باقات هيليوم زرقاء وبالونات فويل ونجوم ومزيداً — مع نصائح السلامة والتوصيل في نفس اليوم في لبنان.",
      datePublished: "2026-08-10",
      ogImage: { url: "/blog/baby-boy-balloons.webp", width: 1408, height: 768 },
      ogImageAlt: "Blue baby boy balloons arranged for a newborn celebration",
      ctaHref: "/ar-lb/beirut/category/balloons",
      ctaLabel: "استعرض البالونات والهدايا",
      sections: [
        {
          body: `A new baby boy deserves a celebration that feels as joyful as the moment itself. <a href="/ar-lb/beirut/category/balloons">Balloons</a> are one of the fastest ways to transform any room — whether it's a hospital ward, a living room, or a garden — into something that unmistakably says: he's here, and we're thrilled. This guide covers ten baby boy balloon ideas, how to choose the right type, what to pair them with, and when to send them.`,
        },
        {
          heading: "10 Baby Boy Balloon Ideas",
          body: "Here are ten baby boy balloon ideas ranging from simple to statement:",
          items: [
            "Classic sky-blue helium bouquet — a cluster of soft-blue and white latex balloons, the simplest and most universally recognised baby boy colour palette",
            "Foil 'It's a Boy' balloon — a large printed foil balloon announcing the news, works as a centrepiece on its own or as the anchor of a larger bouquet",
            "Silver and blue star mylar balloons — star-shaped foil balloons in silver and blue that float for 3–5 days, ideal for multi-day family visits",
            "Letter balloons spelling the baby's name — individually inflated letter balloons that double as a decoration and a personalised keepsake for the first nursery photo",
            "Number 1 balloon for the one-month milestone — a gold or silver '1' balloon marks the one-month celebration, a significant occasion in Lebanese family tradition",
            "Balloon bouquet with a newborn gift set — a curated blue bouquet paired with a newborn occasion set from the Presentail catalogue, combining décor and gift in one order",
            "White and gold balloon arch — a balloon arch in white and gold for a gender-reveal or welcome-home party, creates a full room backdrop for photos",
            "Blue and white confetti balloons — clear latex balloons filled with blue and white paper confetti, adds texture and playfulness to any bouquet",
            "Pastel rainbow bouquet — soft pastels including pale blue, mint, and peach for families who want a gentler, less colour-coded palette",
            "Balloon bouquet with hand bouquet — a blue balloon cluster alongside a white hand bouquet of garden roses or peonies, a combination that balances celebration energy with elegance",
          ],
        },
        {
          heading: "How to Choose the Right Baby Boy Balloon",
          body: "The right balloon depends on two things: how long it needs to last, and where it will be displayed. Latex helium balloons float for 12–24 hours — enough for the day of the birth or a single celebration. Foil and mylar balloons hold helium for 3–5 days, which is a better fit when relatives are arriving over several days or when you want the decoration to stay fresh through the full visiting week. If the celebration is outdoors in summer heat, foil balloons are also more stable in warm air than latex. For a hospital room where space is limited, a single large foil statement balloon is cleaner than a full bouquet. For a home living room, a full bouquet makes a stronger impression.",
        },
        {
          heading: "Balloon Safety Tips for Newborn Celebrations",
          body: "Balloons are safe in a newborn's environment when handled correctly. Keep inflated balloons tied and anchored out of the baby's direct reach at all times. Never leave infants or small children unsupervised near balloons — a burst latex balloon produces fragments that are a serious choking hazard for toddlers and older siblings who may be in the room. Dispose of any deflated or burst balloons immediately. Foil and mylar balloons burst less easily than latex under normal conditions, which makes them a lower-risk choice when the arrangement will be in a shared family space. Avoid placing balloons directly above a cot or a play mat.",
        },
        {
          heading: "Pairing Baby Boy Balloons with Flowers and Gift Baskets",
          body: `Balloons on their own make a room feel alive. Pairing them with a complementary gift creates a full welcome that the parents will remember long after the balloons have deflated. A blue balloon bouquet alongside a <a href="/ar-lb/beirut/category/hand-bouquets">hand bouquet</a> of white blooms — garden roses, ranunculi, or peonies in soft tones — is a particularly elegant combination: the balloons bring the colour and energy; the flowers bring the elegance. For something more practical, combine the balloons with a <a href="/ar-lb/beirut/category/gift-baskets">gift basket</a> stocked with newborn essentials or luxury treats for the new parents. Presentail lets you add products from multiple categories — balloons, flowers, gift baskets — to a single order with one delivery, so the entire welcome arrives at the door together. Pair with a <a href="/ar-lb/beirut/occasion/new-born">newborn occasion set</a> for a complete package.`,
        },
        {
          heading: "When to Send Baby Boy Balloons",
          body: "The timing of a balloon delivery matters more than most people expect. Sending balloons to a hospital room on the birth day is a strong gesture that signals you heard the news immediately — but the room may be busy and the parents exhausted. A delivery on the second or third day, when the initial chaos has settled and the family is beginning to enjoy the moment, is often more appreciated. If the family has a welcome-home gathering or a naming celebration planned, coordinate the delivery to arrive an hour or two before guests, so the balloons are inflated and the room is ready when people walk in. For the one-month milestone — a significant occasion across Lebanese culture — a fresh balloon delivery paired with a cake or gift basket is the standard way to mark it.",
        },
        {
          heading: "Sending Baby Boy Balloons from Abroad to Lebanon",
          body: `One of the most common reasons people contact Presentail is distance. You have heard the news about a baby boy being born to family or friends in Beirut, Tripoli, or Sidon, and you are in Paris, London, Dubai, or Lagos. Ordering <a href="/ar-lb/beirut/category/balloons">baby boy balloons</a> through Presentail from abroad works exactly the same as ordering locally: choose your products, enter the recipient's address in Lebanon, select a delivery date, and our team handles the local arrangement and delivery. International credit cards, debit cards, and digital wallets are accepted at checkout. Deliveries are confirmed by notification to the recipient before they arrive, so there are no surprises.`,
        },
        {
          heading: "Same-Day Baby Boy Balloon Delivery Across Lebanon",
          body: "Presentail delivers baby boy balloons across Beirut and throughout Lebanon, usually the same day you order. Place your order before midday for same-day afternoon delivery. Express delivery — a 90-minute window — is available in select Beirut zones for last-minute needs. Whether the new mother is at a hospital in Achrafieh, a home in Tripoli, or a family house in the Bekaa Valley, the process is the same: choose your balloons and gifts, enter the delivery address, and we handle the rest.",
        },
        {
          heading: "Frequently Asked Questions",
          faqItems: [
            {
              q: "What balloons are best for a baby boy celebration?",
              a: "Classic sky-blue and white helium balloons, foil 'It's a Boy' balloons, star-shaped mylar balloons in silver and blue, and letter balloons spelling the baby's name are all popular choices. Foil and mylar balloons last 3–5 days, making them ideal when family visits stretch across several days.",
            },
            {
              q: "Are helium balloons safe around a newborn?",
              a: "Keep balloons out of the baby's direct reach and never leave infants or small children unsupervised with inflated balloons or balloon fragments. Foil and mylar balloons are less likely to burst than latex, reducing the choking-hazard risk. Always dispose of deflated or burst balloons immediately.",
            },
            {
              q: "Can I combine baby boy balloons with flowers or a gift basket?",
              a: "Yes. Balloons pair beautifully with a fresh hand bouquet or a newborn gift basket. Presentail lets you add items from multiple categories to a single order with one delivery.",
            },
            {
              q: "Do you deliver baby boy balloons the same day in Lebanon?",
              a: "Yes. Orders placed before midday are delivered the same afternoon across Beirut and throughout Lebanon, with express 90-minute delivery available in select Beirut zones.",
            },
            {
              q: "Can I send baby boy balloons from abroad to Lebanon?",
              a: "Absolutely. Order online through Presentail from anywhere in the world, enter the recipient's address in Lebanon, and our local delivery team handles the rest. International cards and wallets are accepted at checkout.",
            },
          ],
        },
      ],
    },
    fr: {
      slug: "baby-boy-balloons",
      eyebrow: "Bébé & Nouveau-né",
      // French metadata stub — body sections use English copy pending full translation (separate task).
      title: "Ballons Garçon : Idées pour Célébrer Son Arrivée | Presentail",
      h1: "Ballons Garçon : Idées pour Célébrer Son Arrivée",
      description:
        "À la recherche de ballons pour garçon ? Découvrez dix idées — bouquets hélium bleus, étoiles aluminium, ballons lettres — avec conseils de sécurité et livraison le jour même au Liban.",
      datePublished: "2026-08-10",
      ogImage: { url: "/blog/baby-boy-balloons.webp", width: 1408, height: 768 },
      ogImageAlt: "Blue baby boy balloons arranged for a newborn celebration",
      ctaHref: "/fr-lb/beirut/category/balloons",
      ctaLabel: "Explorer les ballons et cadeaux",
      sections: [
        {
          body: `A new baby boy deserves a celebration that feels as joyful as the moment itself. <a href="/fr-lb/beirut/category/balloons">Balloons</a> are one of the fastest ways to transform any room — whether it's a hospital ward, a living room, or a garden — into something that unmistakably says: he's here, and we're thrilled. This guide covers ten baby boy balloon ideas, how to choose the right type, what to pair them with, and when to send them.`,
        },
        {
          heading: "10 Baby Boy Balloon Ideas",
          body: "Here are ten baby boy balloon ideas ranging from simple to statement:",
          items: [
            "Classic sky-blue helium bouquet — a cluster of soft-blue and white latex balloons, the simplest and most universally recognised baby boy colour palette",
            "Foil 'It's a Boy' balloon — a large printed foil balloon announcing the news, works as a centrepiece on its own or as the anchor of a larger bouquet",
            "Silver and blue star mylar balloons — star-shaped foil balloons in silver and blue that float for 3–5 days, ideal for multi-day family visits",
            "Letter balloons spelling the baby's name — individually inflated letter balloons that double as a decoration and a personalised keepsake for the first nursery photo",
            "Number 1 balloon for the one-month milestone — a gold or silver '1' balloon marks the one-month celebration, a significant occasion in Lebanese family tradition",
            "Balloon bouquet with a newborn gift set — a curated blue bouquet paired with a newborn occasion set from the Presentail catalogue, combining décor and gift in one order",
            "White and gold balloon arch — a balloon arch in white and gold for a gender-reveal or welcome-home party, creates a full room backdrop for photos",
            "Blue and white confetti balloons — clear latex balloons filled with blue and white paper confetti, adds texture and playfulness to any bouquet",
            "Pastel rainbow bouquet — soft pastels including pale blue, mint, and peach for families who want a gentler, less colour-coded palette",
            "Balloon bouquet with hand bouquet — a blue balloon cluster alongside a white hand bouquet of garden roses or peonies, a combination that balances celebration energy with elegance",
          ],
        },
        {
          heading: "How to Choose the Right Baby Boy Balloon",
          body: "The right balloon depends on two things: how long it needs to last, and where it will be displayed. Latex helium balloons float for 12–24 hours — enough for the day of the birth or a single celebration. Foil and mylar balloons hold helium for 3–5 days, which is a better fit when relatives are arriving over several days or when you want the decoration to stay fresh through the full visiting week. If the celebration is outdoors in summer heat, foil balloons are also more stable in warm air than latex. For a hospital room where space is limited, a single large foil statement balloon is cleaner than a full bouquet. For a home living room, a full bouquet makes a stronger impression.",
        },
        {
          heading: "Balloon Safety Tips for Newborn Celebrations",
          body: "Balloons are safe in a newborn's environment when handled correctly. Keep inflated balloons tied and anchored out of the baby's direct reach at all times. Never leave infants or small children unsupervised near balloons — a burst latex balloon produces fragments that are a serious choking hazard for toddlers and older siblings who may be in the room. Dispose of any deflated or burst balloons immediately. Foil and mylar balloons burst less easily than latex under normal conditions, which makes them a lower-risk choice when the arrangement will be in a shared family space. Avoid placing balloons directly above a cot or a play mat.",
        },
        {
          heading: "Pairing Baby Boy Balloons with Flowers and Gift Baskets",
          body: `Balloons on their own make a room feel alive. Pairing them with a complementary gift creates a full welcome that the parents will remember long after the balloons have deflated. A blue balloon bouquet alongside a <a href="/fr-lb/beirut/category/hand-bouquets">hand bouquet</a> of white blooms — garden roses, ranunculi, or peonies in soft tones — is a particularly elegant combination: the balloons bring the colour and energy; the flowers bring the elegance. For something more practical, combine the balloons with a <a href="/fr-lb/beirut/category/gift-baskets">gift basket</a> stocked with newborn essentials or luxury treats for the new parents. Presentail lets you add products from multiple categories — balloons, flowers, gift baskets — to a single order with one delivery, so the entire welcome arrives at the door together. Pair with a <a href="/fr-lb/beirut/occasion/new-born">newborn occasion set</a> for a complete package.`,
        },
        {
          heading: "When to Send Baby Boy Balloons",
          body: "The timing of a balloon delivery matters more than most people expect. Sending balloons to a hospital room on the birth day is a strong gesture that signals you heard the news immediately — but the room may be busy and the parents exhausted. A delivery on the second or third day, when the initial chaos has settled and the family is beginning to enjoy the moment, is often more appreciated. If the family has a welcome-home gathering or a naming celebration planned, coordinate the delivery to arrive an hour or two before guests, so the balloons are inflated and the room is ready when people walk in. For the one-month milestone — a significant occasion across Lebanese culture — a fresh balloon delivery paired with a cake or gift basket is the standard way to mark it.",
        },
        {
          heading: "Sending Baby Boy Balloons from Abroad to Lebanon",
          body: `One of the most common reasons people contact Presentail is distance. You have heard the news about a baby boy being born to family or friends in Beirut, Tripoli, or Sidon, and you are in Paris, London, Dubai, or Lagos. Ordering <a href="/fr-lb/beirut/category/balloons">baby boy balloons</a> through Presentail from abroad works exactly the same as ordering locally: choose your products, enter the recipient's address in Lebanon, select a delivery date, and our team handles the local arrangement and delivery. International credit cards, debit cards, and digital wallets are accepted at checkout. Deliveries are confirmed by notification to the recipient before they arrive, so there are no surprises.`,
        },
        {
          heading: "Same-Day Baby Boy Balloon Delivery Across Lebanon",
          body: "Presentail delivers baby boy balloons across Beirut and throughout Lebanon, usually the same day you order. Place your order before midday for same-day afternoon delivery. Express delivery — a 90-minute window — is available in select Beirut zones for last-minute needs. Whether the new mother is at a hospital in Achrafieh, a home in Tripoli, or a family house in the Bekaa Valley, the process is the same: choose your balloons and gifts, enter the delivery address, and we handle the rest.",
        },
        {
          heading: "Frequently Asked Questions",
          faqItems: [
            {
              q: "What balloons are best for a baby boy celebration?",
              a: "Classic sky-blue and white helium balloons, foil 'It's a Boy' balloons, star-shaped mylar balloons in silver and blue, and letter balloons spelling the baby's name are all popular choices. Foil and mylar balloons last 3–5 days, making them ideal when family visits stretch across several days.",
            },
            {
              q: "Are helium balloons safe around a newborn?",
              a: "Keep balloons out of the baby's direct reach and never leave infants or small children unsupervised with inflated balloons or balloon fragments. Foil and mylar balloons are less likely to burst than latex, reducing the choking-hazard risk. Always dispose of deflated or burst balloons immediately.",
            },
            {
              q: "Can I combine baby boy balloons with flowers or a gift basket?",
              a: "Yes. Balloons pair beautifully with a fresh hand bouquet or a newborn gift basket. Presentail lets you add items from multiple categories to a single order with one delivery.",
            },
            {
              q: "Do you deliver baby boy balloons the same day in Lebanon?",
              a: "Yes. Orders placed before midday are delivered the same afternoon across Beirut and throughout Lebanon, with express 90-minute delivery available in select Beirut zones.",
            },
            {
              q: "Can I send baby boy balloons from abroad to Lebanon?",
              a: "Absolutely. Order online through Presentail from anywhere in the world, enter the recipient's address in Lebanon, and our local delivery team handles the rest. International cards and wallets are accepted at checkout.",
            },
          ],
        },
      ],
    },
  },

  "gift-shop-in-lebanon": {
    en: {
      slug: "gift-shop-in-lebanon",
      eyebrow: "Gifting Guide",
      title: "Gift Shop in Lebanon: A Complete Gifting Guide | Presentail",
      h1: "Looking for a Gift Shop in Lebanon? Here's How to Choose the Perfect Gift",
      description:
        "Looking for a gift shop in Lebanon? Find thoughtful flowers, cakes, plants and gifts, with convenient delivery options from Presentail.",
      datePublished: "2026-08-11",
      ogImageAlt: "Flowers, cake and a curated gift box from an online gift shop in Lebanon",
      ctaHref: "https://presentail.com/en-lb/beirut/shop",
      ctaLabel: "Shop all gifts",
      extraJsonLd: [
        {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          "mainEntity": [
            {
              "@type": "Question",
              "name": "Where can I buy gifts online in Lebanon?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "You can buy flowers, cakes, plants and curated gifts online through Presentail. Browse the full collection, enter the recipient's Lebanese address, add a personal card message and select an available delivery date at checkout.",
              },
            },
            {
              "@type": "Question",
              "name": "Can I send a gift to Lebanon while living abroad?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "Yes. You can place an order online from abroad for delivery to someone in Lebanon. Use the recipient's full name, accurate Lebanese address and active local phone number, then pay with an available online payment method.",
              },
            },
            {
              "@type": "Question",
              "name": "Does Presentail offer same-day gift delivery in Lebanon?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "Presentail offers same-day delivery in Beirut for eligible orders placed before midday. Availability depends on the product, delivery area, date and capacity, so confirm the final option and time window at checkout.",
              },
            },
            {
              "@type": "Question",
              "name": "Can I add a personalised card to my gift?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "Yes. Presentail lets you add a personalised message to the order. Include your name if the recipient may not immediately know who sent the gift.",
              },
            },
            {
              "@type": "Question",
              "name": "What are popular gifts for delivery in Lebanon?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "Flowers, flower boxes, cakes, chocolates, plants and curated gift sets are versatile choices. The right option depends on the recipient, the occasion and whether you want the gift to be enjoyed immediately, shared with others or kept over time.",
              },
            },
            {
              "@type": "Question",
              "name": "How early should I order a gift?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "For a fixed event or important occasion, ordering ahead gives you more product and delivery-window choices. If you need same-day delivery in Beirut, order as early as possible and before the published midday cut-off for eligible orders.",
              },
            },
          ],
        },
      ],
      sections: [
        {
          body: "Finding the right gift shop in Lebanon should make an important moment easier, not turn it into a long search across dozens of stores. Whether you are celebrating a birthday in Beirut, welcoming a new baby in Jbeil, sending an anniversary surprise to Tripoli, or simply reminding someone in Lebanon that you are thinking of them, the best gift is one that feels personal and arrives when it matters.\n\nThat is why many shoppers now prefer an online gift shop that brings flowers, cakes, chocolates, plants, balloons and curated presents together in one place. Instead of coordinating several suppliers, you can choose a complete gift, add a personal message and arrange delivery from the same checkout.\n\nAt Presentail, you can browse thoughtful gifts for life's biggest celebrations and its smaller, spontaneous moments. Start with the <a href=\"/en-lb/beirut/shop\">full collection of flowers and gifts</a>, then narrow your choice by recipient, occasion and the kind of feeling you want to send.",
        },
        {
          heading: "What should you look for in a gift shop in Lebanon?",
          body: "A gift can be beautiful and still create a disappointing experience if it is difficult to order, poorly presented or delivered at the wrong time. Before choosing a shop, look beyond the product photo and consider the complete journey from selection to delivery.",
        },
        {
          heading: "A varied but curated collection",
          body: "A strong gift shop gives you enough choice without making the experience overwhelming. Look for categories that suit different personalities and occasions: fresh flowers for an expressive gesture, cake for a celebration, a plant for a longer-lasting present, or a curated set when you want the unboxing to feel especially generous.\n\nThe advantage of shopping across categories is flexibility. You may arrive looking for flowers and realise that a cake would suit the recipient better. Or you may decide to pair a bouquet with chocolates, balloons or a candle to make the moment feel complete.",
        },
        {
          heading: "Clear delivery information",
          body: "Timing is part of the gift. A reliable online store should explain which dates and time windows are available before you finalise the order. If you need an urgent gift, check the same-day cut-off and confirm availability for the recipient's address at checkout. If the date is important, scheduling in advance is usually the calmer option.\n\nPresentail currently offers same-day delivery in Beirut for eligible orders placed before midday, with faster delivery available in select zones. You can also schedule a delivery ahead of time and select from the available windows shown at checkout. Availability can vary by product, date and location, so the checkout should always be treated as the final confirmation.",
        },
        {
          heading: "Personal touches",
          body: "The message often matters as much as the item. A personalised card turns a lovely product into a gift that belongs to a particular relationship and moment. Extras such as chocolates, balloons or scented candles can also help you shape the tone—playful, romantic, comforting or celebratory.",
        },
        {
          heading: "A straightforward checkout",
          body: "When ordering from another country, payment friction can ruin an otherwise easy experience. Look for secure digital payment options and a checkout that clearly separates the buyer's details from the recipient's delivery information. Presentail lists credit cards, Apple Pay and Google Pay among its payment options, while local shoppers can also see available payment methods at checkout.",
        },
        {
          heading: "Helpful support when details are uncertain",
          body: "Lebanese addresses can sometimes require extra directions, a landmark or a call to the recipient. Make sure the contact number and delivery information you provide are accurate. If the location is difficult to describe, add useful delivery notes rather than assuming the driver will recognise the building.",
        },
        {
          heading: "What can you buy from an online gift shop in Lebanon?",
          body: "The easiest way to find the right present is to match the gift to the experience you want the recipient to have.",
        },
        {
          heading: "Flowers and flower boxes",
          body: "Flowers are immediate, expressive and suitable for more occasions than almost any other gift. A hand bouquet feels warm and spontaneous, while a flower box creates a more structured, polished presentation. Colour can help communicate the mood: soft tones for gentle congratulations, bright arrangements for joyful celebrations, and classic red or white flowers for a more romantic or elegant gesture.\n\nBrowse <a href=\"/en-lb/beirut/category/hand-bouquets\">hand bouquets available for delivery</a>, or explore the full shop if you would like to compare flowers with other gift types.",
        },
        {
          heading: "Cakes for celebrations",
          body: "A cake does more than mark an occasion—it gives people a reason to gather. It works especially well for birthdays, office celebrations, anniversaries and family milestones. Before ordering, consider the number of people sharing it, the recipient's preferred flavours and whether candles or another small add-on would make the delivery more festive.\n\nExplore <a href=\"/en-lb/beirut/category/cakes\">cakes for delivery in Lebanon</a>. Current availability, flavours and delivery timing are shown on the collection and at checkout.",
        },
        {
          heading: "Plants that last beyond the day",
          body: "A plant is a thoughtful choice for someone who enjoys their home, desk or garden. It can suit a housewarming, a thank-you, a professional congratulations or a \"thinking of you\" moment. Plants also continue to remind the recipient of the sender long after the delivery day.\n\nWhen choosing one, consider the recipient's space and routine. A low-maintenance plant may be better for a busy person, while an orchid or bonsai can feel more decorative. Browse <a href=\"/en-lb/beirut/category/plants\">plants for delivery in Beirut</a> for current options.",
        },
        {
          heading: "Curated gift sets and thoughtful extras",
          body: "Gift sets are useful when one item does not quite say enough. A coordinated combination can create a more substantial reveal while keeping the presentation cohesive. Flowers with cake make a birthday delivery feel complete; flowers and chocolates create a classic romantic pairing; a plant with a personal card can be a warm professional gift.\n\nThe best combinations are not necessarily the biggest. They are the ones in which each item supports the same message.",
        },
        {
          heading: "How to choose a gift by occasion",
          body: "Searching by occasion can be faster than comparing every product individually. It also helps you avoid a gift that is attractive but wrong for the tone of the moment.",
        },
        {
          heading: "Birthday gifts",
          body: "For a birthday, begin with the recipient's personality. Someone expressive may love a colourful bouquet and balloons. A food lover may prefer a cake. A person who enjoys elegant, understated things may appreciate a simple flower arrangement or plant. If you are unsure, pair a versatile gift with a specific card message that shows you chose it for them.\n\nBrowse <a href=\"/en-lb/beirut/occasion/birthday\">birthday flowers and gifts</a> to compare celebratory options in one place.",
        },
        {
          heading: "Anniversary gifts",
          body: "Anniversary gifts should feel connected to the relationship. Flowers remain a classic choice because their colours and varieties can reflect romance, admiration and shared memories. A cake or chocolate pairing can turn the delivery into an experience the couple enjoys together.\n\nExplore <a href=\"/en-lb/beirut/occasion/anniversary\">anniversary flowers and gifts</a>, and use the card to mention a real memory rather than relying only on a familiar phrase.",
        },
        {
          heading: "New baby gifts",
          body: "When welcoming a baby, remember that you are also celebrating and supporting the parents. Soft flowers, balloons, a keepsake-style gift or a warm arrangement can all work well. If you are sending to a hospital, confirm that the recipient can receive deliveries and include the parent's full name and contact number.\n\nSee <a href=\"/en-lb/beirut/occasion/new-born\">new baby gifts</a> for current ideas.",
        },
        {
          heading: "Thank-you and congratulations gifts",
          body: "These occasions benefit from a clear sense of proportion. A plant, bouquet or small curated gift can feel generous without being excessive. For a professional recipient, keep the card warm and specific: say what they did and why it mattered.",
        },
        {
          heading: "Thinking-of-you and get-well gifts",
          body: "A gift does not need a formal event. Flowers, a plant or a comforting treat can make an ordinary day feel less lonely. For get-well wishes, choose something easy to receive and avoid making medical assumptions in the message. A simple \"Thinking of you and sending love\" is often enough.",
        },
        {
          heading: "How to choose a gift by recipient",
          body: "If the occasion does not point to an obvious answer, use three questions:",
          items: [
            "What do they enjoy? Think about their home, hobbies, favourite flavours and personal style.",
            "What do you want them to feel? Celebrated, appreciated, comforted, surprised or remembered?",
            "How will they receive it? At home, at work, in hospital or during a gathering?",
          ],
        },
        {
          body: "For a partner, a romantic arrangement and a personal note may be ideal. For a parent, a favourite cake or an elegant plant may feel more personal. For a colleague, choose a polished gift that is easy to share or display. For a close friend, colour, humour and a message only the two of you understand can matter more than formality.\n\nWhen in doubt, avoid choosing by gender alone. Interests, lifestyle and the relationship you share are much better guides.",
        },
        {
          heading: "Sending gifts to Lebanon from abroad",
          body: "For members of the Lebanese diaspora, distance often makes birthdays, holidays and family milestones feel more complicated. Ordering from a local online gift shop removes the need to package an item overseas, calculate international shipping or worry that a parcel will arrive long after the occasion.\n\nTo send gifts to Lebanon from abroad:",
          items: [
            "Open the store and set the recipient's Lebanese delivery location.",
            "Choose an item based on the products available for that location and date.",
            "Enter the recipient's full name, local phone number and precise address.",
            "Add a personalised message, including your name if the recipient may not recognise the order.",
            "Select an available delivery date and time window.",
            "Pay online and keep the order confirmation for reference.",
          ],
        },
        {
          body: "It is a small process, but accuracy matters. Use the recipient's active Lebanese number, add the floor or building name where relevant, and include a recognisable landmark if the address may be hard to find.",
        },
        {
          heading: "Same-day gift delivery in Beirut: what to know",
          body: "Same-day delivery is helpful when a celebration surprises you or a date has slipped your mind. Presentail offers same-day delivery in Beirut for eligible orders placed before midday, including areas such as Hamra, Achrafieh, Gemmayzeh, Verdun, Badaro, Mar Mikhael and Ras Beirut. Select zones may also have an express option.\n\nFor the smoothest urgent delivery:",
          items: [
            "Order as early as possible; do not wait until the published cut-off.",
            "Choose from products shown as available for the recipient's area.",
            "Double-check the phone number and address before payment.",
            "Make sure someone can receive the delivery.",
            "Use the available checkout slot as the final source of timing information.",
          ],
        },
        {
          body: "If the gift is for a wedding, engagement, hospital visit or another event with a fixed schedule, arranging delivery in advance is safer than relying on a last-minute order.",
        },
        {
          heading: "A simple formula for a more meaningful gift",
          body: "Thoughtful gifting does not require an enormous budget or an elaborate bundle. Use this simple formula: one item they will genuinely enjoy, one detail that reflects the occasion, and one personal sentence.\n\nThat might be a plant for a friend who has moved into a new home, delivered with a card that mentions the first coffee you plan to share there. It could be a birthday cake in a parent's favourite flavour with candles and a message recalling a family tradition. Or it could be a bouquet sent on an ordinary Tuesday simply because someone has had a difficult week.\n\nThe product creates the moment. The detail makes it theirs.",
        },
        {
          heading: "Find the right gift with Presentail",
          body: "If you are comparing options from a gift shop in Lebanon, start with the recipient and the feeling you want to send. Then choose a store that makes the practical details—selection, payment, personalisation and delivery—clear and convenient.\n\nPresentail brings flowers, cakes, plants and curated gifts together so you can plan one thoughtful delivery from one place. Browse the <a href=\"/en-lb/beirut/shop\">full collection of gifts in Lebanon</a>, add your personal message and select the available delivery option that fits your moment.",
        },
        {
          heading: "Frequently asked questions about gift shops in Lebanon",
          faqItems: [
            {
              q: "Where can I buy gifts online in Lebanon?",
              a: "You can buy flowers, cakes, plants and curated gifts online through Presentail. Browse the full collection, enter the recipient's Lebanese address, add a personal card message and select an available delivery date at checkout.",
            },
            {
              q: "Can I send a gift to Lebanon while living abroad?",
              a: "Yes. You can place an order online from abroad for delivery to someone in Lebanon. Use the recipient's full name, accurate Lebanese address and active local phone number, then pay with an available online payment method.",
            },
            {
              q: "Does Presentail offer same-day gift delivery in Lebanon?",
              a: "Presentail offers same-day delivery in Beirut for eligible orders placed before midday. Availability depends on the product, delivery area, date and capacity, so confirm the final option and time window at checkout.",
            },
            {
              q: "Can I add a personalised card to my gift?",
              a: "Yes. Presentail lets you add a personalised message to the order. Include your name if the recipient may not immediately know who sent the gift.",
            },
            {
              q: "What are popular gifts for delivery in Lebanon?",
              a: "Flowers, flower boxes, cakes, chocolates, plants and curated gift sets are versatile choices. The right option depends on the recipient, the occasion and whether you want the gift to be enjoyed immediately, shared with others or kept over time.",
            },
            {
              q: "How early should I order a gift?",
              a: "For a fixed event or important occasion, ordering ahead gives you more product and delivery-window choices. If you need same-day delivery in Beirut, order as early as possible and before the published midday cut-off for eligible orders.",
            },
          ],
        },
      ],
    },
    get ar() { return this.en; },
    get fr() { return this.en; },
  },
  "mothers-day-gifts-lebanon": {
    en: {
      slug: "mothers-day-gifts-lebanon",
      eyebrow: "Gifting Guide",
      title: "Mother's Day Gifts in Lebanon: The Complete Flower & Gift Guide",
      description:
        "Mother's Day in Lebanon falls on March 21. Discover the best Mother's Day flowers, cakes, and gifts with same-day delivery across Lebanon from Presentail.",
      datePublished: "2026-08-13",
      ogImage: { url: "/blog/mothers-day-gifts-lebanon.webp", width: 1408, height: 768 },
      ctaHref: "https://presentail.com/en-lb/metn/occasion/mothers-day",
      ctaLabel: "Shop Mother's Day Gifts",
      sections: [
        {
          body: "There's a detail that catches a lot of people off guard: Mother's Day in Lebanon doesn't fall on the date most of the world uses. While the US, UK, and many other countries celebrate on the second Sunday of May, Lebanon — along with most of the Arab world — marks Mother's Day on March 21, the first day of spring. The timing isn't a coincidence. Pairing the day with the start of spring, when the country's flower markets are at their fullest, has always felt like the right kind of symbolism for a day about mothers.",
        },
        {
          body: "If you're searching for Mother's Day gifts in Lebanon, here's everything you need to get it right — from what to send, to when to order, to a few specific pieces we think are worth a look this year.",
        },
        {
          heading: "When Is Mother's Day in Lebanon?",
          body: "Mark it now: March 21. It's a fixed date each year, not a moving Sunday, so there's no need to double-check a calendar the week before. That also means it's easy to plan ahead — flowers and gift baskets for March 21 can be ordered well in advance and scheduled for exact delivery on the day, no last-minute scrambling required.",
        },
        {
          heading: "What to Get Her: Mother's Day Gift Ideas That Actually Land",
          body: "Not every gift is a Mother's Day gift. The ones that land tend to share a few things in common: they feel personal, they don't require assembly or explanation, and they arrive looking exactly as good as they did in the photo. A few categories that consistently work well:",
        },
        {
          body: 'Fresh flowers. Still the classic for a reason. A vase arrangement in soft pinks or blush tones reads as thoughtful without trying too hard — something like our <a href="/en-lb/beirut/product/blush-rose-vase">Blush Rose Vase</a> ($50), a clean glass vase of blush roses that suits a coffee table or bedside table equally well.',
        },
        {
          body: "Something sweet. Cakes and chocolate boxes cover the moms who'd rather have dessert with the family than unwrap a box. A shared cake after Sunday lunch tends to disappear faster than any bouquet.",
        },
        {
          body: 'A small, cheerful extra. Balloons aren\'t the whole gift, but paired with flowers or a cake, they turn a delivery into a moment — especially with grandkids in the house. Our <a href="/en-lb/beirut/product/best-mom-ever-balloon">Best Mom Ever Balloon</a> ($14) is a simple, affordable way to add that.',
        },
        {
          body: "A full bundle, if you want to cover all three. For anyone who'd rather not choose between flowers, sweets, and a little extra, a combined gift set does the deciding for you.",
        },
        {
          heading: "Browse the Full Mother's Day Collection",
          body: 'Rather than picking through the entire catalogue, the fastest way to find the right gift is our dedicated <a href="/en-lb/metn/occasion/mothers-day">Mother\'s Day Collection</a> — flowers, cakes, chocolate, and balloons, all curated specifically for the day, with prices and delivery windows shown up front so there\'s no guessing.',
        },
        {
          heading: "Same-Day Delivery, Anywhere in Lebanon",
          body: "March 21 tends to be a busy day for florists across the country, which is exactly why we'd suggest ordering a day or two ahead if the timing matters to you (a surprise delivered while everyone's still at the breakfast table, for instance). That said, Presentail offers same-day delivery across Lebanon, including Beirut, Metn, and every city we serve, so a same-day order on the 21st itself is still very much doable.",
        },
        {
          heading: "A Few Tips for Getting It Right",
          items: [
            "Add a note. Every order includes the option to attach a personal message — it's free, and it's the part that gets remembered longer than the gift itself.",
            "Check the delivery address twice. If mom's spending the day at a sibling's house or a family gathering, double-confirm the address before checkout rather than after.",
            "Don't wait until the morning of. Popular arrangements (ours included) tend to sell through by mid-morning on Mother's Day itself. Ordering the evening before, or scheduling ahead for exact delivery on the 21st, is the safer bet.",
          ],
        },
        {
          heading: "Ready to Order?",
          body: 'Whether you\'re set on flowers, leaning toward something sweet, or want the whole bundle, the full range is right here: <a href="/en-lb/metn/occasion/mothers-day">Shop Mother\'s Day Gifts →</a>',
        },
        {
          body: "Presentail delivers across Lebanon, the UAE, and Cyprus, with same-day and scheduled delivery options so your gift arrives exactly when it should.",
        },
      ],
    },
    get ar() { return this.en; },
    get fr() { return this.en; },
  },
  "fathers-day-gifts-lebanon": {
    en: {
      slug: "fathers-day-gifts-lebanon",
      eyebrow: "Gifting Guide",
      title: "Father's Day Gifts in Lebanon: What to Send and When",
      description:
        "Father's Day in Lebanon falls on June 21. Discover the best Father's Day gifts with same-day delivery across Lebanon from Presentail.",
      datePublished: "2026-08-13",
      ogImage: { url: "/blog/fathers-day-gifts-lebanon.webp", width: 1408, height: 768 },
      ctaHref: "https://presentail.com/en-lb/metn/occasion/fathers-day",
      ctaLabel: "Shop Father's Day Gifts",
      sections: [
        {
          body: "Quick fact that trips a lot of people up: Father's Day in Lebanon isn't the third Sunday of June like it is in the US. Lebanon follows the date used across most of the Arab world — a fixed June 21, tied to the summer solstice, the same logic behind Mother's Day landing on the spring equinox back in March. No moving Sunday to track down on a calendar — just one date, every year.",
        },
        {
          body: "If you're planning ahead for Father's Day gifts in Lebanon, here's what's worth sending, and how to make sure it actually arrives on the day.",
        },
        {
          heading: "When Is Father's Day in Lebanon?",
          body: "June 21. Fixed, not a Sunday-dependent date, which makes it easy to schedule delivery in advance rather than scrambling the morning of.",
        },
        {
          heading: "What Actually Makes a Good Father's Day Gift",
          body: 'Dads are, famously, a hard demographic to shop for. The gifts that work tend to skip the "novelty item he\'ll never use" trap and lean into something either genuinely useful, genuinely indulgent, or genuinely personal:',
        },
        {
          body: 'A proper drink or dessert moment. <a href="/en-lb/beirut/product/cheers-to-dad">Cheers to Dad</a> ($165) is built around exactly that — a gift that turns into an actual moment with him rather than something that sits on a shelf.',
        },
        {
          body: 'Something for the balcony or garden. A lot of dads have quietly become plant people without admitting it. <a href="/en-lb/beirut/product/dads-garden">Dad\'s Garden</a> ($120) is designed for that dad specifically.',
        },
        {
          body: 'A small, no-effort add-on. Paired with a bigger gift or sent on its own from the kids, a <a href="/en-lb/beirut/product/happy-fathers-day-balloon">Happy Father\'s Day Balloon</a> ($13) is the easiest way to make the day visibly a celebration rather than just another Sunday.',
        },
        {
          heading: "Browse the Full Father's Day Collection",
          body: 'The full range — florals, balloons, and dad-specific gift bundles — is curated in one place: <a href="/en-lb/metn/occasion/fathers-day">Father\'s Day Collection</a>. It\'s the fastest way to compare options by price and see what\'s available for same-day delivery in your area.',
        },
        {
          heading: "Delivery Across Lebanon",
          body: "Presentail delivers Father's Day gifts same-day across Lebanon — Beirut, Metn, and every city we cover. Given June 21 tends to be a high-order day industry-wide, ordering the day before (or scheduling ahead for exact delivery on the 21st) is the safer move if timing matters. A same-day order on the day itself still works in most cases, just with less buffer.",
        },
        {
          heading: "A Few Tips",
          items: [
            'Add a note. A short, specific message tends to land better than a generic "Happy Father\'s Day" — mention something he\'d actually recognize.',
            "Confirm the delivery address. If he's spending the day somewhere other than home (a family gathering, for instance), double-check the address before checkout.",
            "Order a day early if you can. June 21 sees a predictable spike in orders every year — the earlier you lock in delivery, the more selection you'll have.",
          ],
        },
        {
          heading: "Ready to Order?",
          body: '<a href="/en-lb/metn/occasion/fathers-day">Shop Father\'s Day Gifts →</a>',
        },
        {
          body: "Presentail delivers across Lebanon, the UAE, and Cyprus, with same-day and scheduled delivery so your gift arrives exactly when it should.",
        },
      ],
    },
    get ar() { return this.en; },
    get fr() { return this.en; },
  },
  "valentines-day-gifts-lebanon": {
    en: {
      slug: "valentines-day-gifts-lebanon",
      eyebrow: "Gifting Guide",
      title: "Valentine's Day Gifts in Lebanon: A Guide to Getting It Right",
      description:
        "The best Valentine's Day gifts in Lebanon — roses, preserved flowers, and gift bundles with same-day delivery from Presentail.",
      datePublished: "2026-08-13",
      ogImage: { url: "/blog/valentines-day-gifts-lebanon.webp", width: 1408, height: 768 },
      ctaHref: "https://presentail.com/en-lb/metn/occasion/valentines-day",
      ctaLabel: "Shop Valentine's Day Gifts",
      sections: [
        {
          body: "Valentine's Day doesn't need an explanation of when it falls — February 14, same as everywhere else. What it does need, if you're sending something in Lebanon this year, is a clear sense of what actually works versus what's a safe-but-forgettable default. Here's a practical guide to Valentine's Day gifts in Lebanon, built around what tends to land best.",
        },
        {
          heading: "Roses Are Still the Answer (Mostly)",
          body: 'There\'s a reason red roses dominate February 14 order volume every single year — they work, reliably, for almost every kind of relationship. But "roses" isn\'t one gift, it\'s a range:',
        },
        {
          body: 'Classic and unmistakable. A <a href="/en-lb/beirut/product/colossal-red-roses-box">Colossal Red Roses Box</a> ($360) is the statement version — the kind of arrangement that doesn\'t need a card to explain the intent.',
        },
        {
          body: "Smaller and still meaningful. Not every relationship calls for the biggest box on the menu. A tighter arrangement of red roses covers the sentiment without the price tag of the showstopper.",
        },
        {
          heading: "Beyond Roses: Gifts With More Staying Power",
          body: "Fresh flowers are beautiful for a week. A few Valentine's categories last considerably longer, which matters if longevity is part of the message you're going for:",
        },
        {
          body: 'Preserved roses that don\'t wilt. A <a href="/en-lb/beirut/product/red-heart-shaped-eternal-rose">Red Heart-Shaped Eternal Rose</a> ($127) keeps its form for months rather than days — a genuinely different gifting proposition from a fresh bouquet, and one that reads as more deliberate.',
        },
        {
          body: 'Something soft and a little playful. Not every Valentine\'s gift needs to be serious. A <a href="/en-lb/beirut/product/love-bear">Love Bear</a> ($32) works well as an add-on gift, or as the whole gift for a newer relationship where a $300 rose box would read as too much, too soon.',
        },
        {
          heading: "Matching the Gift to the Relationship",
          body: "A genuinely useful way to think about it: how long have you been together, and how big is the moment supposed to feel this year? A first Valentine's Day rarely calls for the most expensive option in the catalogue — something warm but proportionate tends to land better than something that feels like it's trying too hard. Longer relationships, anniversaries that happen to fall near February 14, or a make-up-for-lost-time gift after a rough stretch are where the bigger, more considered pieces make sense.",
        },
        {
          heading: "Browse the Full Valentine's Day Collection",
          body: 'Rather than scrolling the entire catalogue, the curated collection is the fastest way to compare what\'s actually built for the day: <a href="/en-lb/metn/occasion/valentines-day">Valentine\'s Day Collection</a> — roses, preserved flowers, bears, and gift bundles, all in one place.',
        },
        {
          heading: "Order Early — February 14 Sells Out Fast",
          body: "This is the single most order-heavy day of the year for florists across Lebanon, and popular arrangements do sell through, sometimes days in advance. If you have a specific piece in mind, ordering a few days ahead and scheduling exact delivery for the 14th is the safest route. Same-day ordering on Valentine's Day itself is still possible, but selection narrows as the day goes on.",
        },
        {
          heading: "Ready to Order?",
          body: '<a href="/en-lb/metn/occasion/valentines-day">Shop Valentine\'s Day Gifts →</a>',
        },
        {
          body: "Presentail delivers across Lebanon, the UAE, and Cyprus, with same-day and scheduled delivery so your gift arrives exactly when it should.",
        },
      ],
    },
    get ar() { return this.en; },
    get fr() { return this.en; },
  },
  "best-cakes-lebanon": {
    en: {
      slug: "best-cakes-lebanon",
      eyebrow: "Gifting Guide",
      title: "The Best Cakes in Lebanon: Where to Order Online for Same-Day Delivery",
      description:
        "Looking for the best cakes in Lebanon? Order Hallab 1881, Sables Gourmets, and more with same-day delivery from Presentail.",
      datePublished: "2026-08-13",
      ogImage: { url: "/blog/best-cakes-lebanon.webp", width: 1408, height: 768 },
      ctaHref: "https://presentail.com/en-lb/beirut/category/cakes",
      ctaLabel: "Shop Cakes & Sweets",
      sections: [
        {
          body: "Finding a good cake in Lebanon isn't the hard part — the country has no shortage of bakeries. The hard part is finding one that (a) actually delivers, (b) shows up looking like the photo, and (c) doesn't require you to plan three days ahead. Here's where that search tends to land, and what's worth ordering.",
        },
        {
          heading: "Hallab 1881: The Name Everyone Already Knows",
          body: 'If you\'ve spent any time in Lebanon, you know the name. <a href="/en-lb/beirut/brand/hallab-1881">Hallab 1881</a> has been a fixture of Lebanese sweets since, unsurprisingly, 1881 — a heritage brand that\'s less "trendy bakery" and more "the sweets your grandmother trusted." Ordering Hallab through Presentail means the same recognizable quality, delivered same-day, without a trip to Tripoli or a Beirut branch.',
        },
        {
          heading: "Sablés Gourmets: For the French-Style Pick",
          body: 'For something a little different from traditional Lebanese sweets, <a href="/en-lb/beirut/brand/sables-gourmets">Sablés Gourmets</a> brings a French-inflected take on gifting sweets — refined, boxed, and built for gifting rather than just eating. It\'s the pick for someone who wants "elegant" over "traditional."',
        },
        {
          heading: "Our Favorite Cakes to Order Right Now",
          body: "A few specific picks worth calling out from the current catalogue:",
        },
        {
          body: 'Chocolate Rocher Cake ($48) — serves 8 to 10 people, built around the Ferrero Rocher flavor profile that\'s become something of a Lebanese celebration staple. <a href="/en-lb/beirut/product/chocolate-rocher-cake--899">Order it here</a>.',
        },
        {
          body: 'Classic Chocolate Box ($55) — not a cake in the traditional sense, but for gifting rather than serving at a table, a curated box of milk, dark, and white chocolates often does the job better than a full cake. <a href="/en-lb/beirut/product/classic-chocolate-box--881">See the box</a>.',
        },
        {
          heading: "What to Actually Check Before You Order",
          body: "A few things separate a good cake order from a disappointing one:",
        },
        {
          body: 'Serving size. Check how many people the cake actually serves before ordering — "cake" can mean anything from a personal-size dessert to a 20-person centerpiece, and the price difference is significant.',
        },
        {
          body: "Delivery timing. Cakes are more delicate in transit than flowers or balloons. Ordering with enough lead time (same-day is usually fine, but not last-minute-before-an-event) gives more room for things to go smoothly.",
        },
        {
          body: 'What it\'s actually for. A birthday cake, a congratulations cake, and a "just because" cake call for different things — a full serving cake for the first, something shareable and celebratory for the second, a smaller gesture like a chocolate box for the third.',
        },
        {
          heading: "Browse the Full Cake & Chocolate Selection",
          body: 'For the complete range beyond these picks — cakes, chocolate boxes, and Arabic sweets — the full category is here: <a href="/en-lb/beirut/category/cakes">Cakes</a> and <a href="/en-lb/beirut/category/chocolate">Chocolate</a>.',
        },
        {
          heading: "Same-Day Delivery Across Lebanon",
          body: "Presentail delivers cakes and sweets same-day across Beirut and the rest of Lebanon. Order before midday for same-afternoon delivery, or schedule ahead for an exact time if you're planning around a specific event.",
        },
        {
          heading: "Ready to Order?",
          body: '<a href="/en-lb/beirut/category/cakes">Shop Cakes & Sweets →</a>',
        },
        {
          body: "Presentail delivers across Lebanon, the UAE, and Cyprus, with same-day and scheduled delivery so your order arrives exactly when it should.",
        },
      ],
    },
    get ar() { return this.en; },
    get fr() { return this.en; },
  },
  "teddy-bear-gifts-lebanon": {
    en: {
      slug: "teddy-bear-gifts-lebanon",
      eyebrow: "Gifting Guide",
      title: "Teddy Bear Gifts in Lebanon: A Guide for Every Occasion",
      description:
        "From classic bears to life-size teddies, find the perfect teddy bear gift in Lebanon with same-day delivery from Presentail.",
      datePublished: "2026-08-13",
      ogImage: { url: "/blog/teddy-bear-gifts-lebanon.webp", width: 1408, height: 768 },
      ctaHref: "https://presentail.com/en-lb/beirut/category/stuffed-animals",
      ctaLabel: "Shop Teddy Bears",
      sections: [
        {
          body: 'A good teddy bear is one of the few gifts that works across almost every occasion without needing to be re-explained — birthdays, get-well visits, anniversaries, new babies, even a quiet "thinking of you." Here\'s how to pick the right one, and what\'s worth ordering in Lebanon right now.',
        },
        {
          heading: "Classic Bears for Everyday Occasions",
          body: 'For birthdays specifically, <a href="/en-lb/beirut/product/birthday-bear">Birthday Bear</a> ($32) is built for exactly that occasion — an easy, affordable pick that doesn\'t require overthinking.',
        },
        {
          body: 'For a slightly warmer, more textured option, <a href="/en-lb/beirut/product/marmalade-bear">Marmalade Bear</a> ($74) sits a step up in size and presentation, making it a better fit when the occasion calls for a bit more than the smallest option on the shelf.',
        },
        {
          heading: "When You Want to Make a Real Statement",
          body: 'Some occasions call for going bigger — literally. The <a href="/en-lb/beirut/product/life-size-teddy-bear">Life-Size Teddy Bear</a> ($382) is exactly what it sounds like, and it tends to be the gift people photograph and remember years later. It\'s a common pick for milestone birthdays, big anniversaries, or "I really want this to be memorable" moments.',
        },
        {
          heading: "Romantic Occasions: The Love Bear",
          body: 'For anniversaries or Valentine\'s Day specifically, <a href="/en-lb/beirut/product/love-bear">Love Bear</a> ($32) is designed with that occasion in mind — a softer, more romantic take than a generic bear, without the price tag of the life-size version.',
        },
        {
          heading: "Matching the Bear to the Moment",
          body: "A quick way to think about it:",
          items: [
            "New baby or children's occasion — softer colors and smaller sizes tend to suit the moment better than an oversized statement piece.",
            "Birthday — the classic bear categories (Birthday Bear, Marmalade Bear) are built specifically for this.",
            "Romance or anniversary — Love Bear, or pairing a bear with flowers, adds a layer that a bear alone doesn't cover.",
            '"I want this to be unforgettable" — the Life-Size Teddy Bear is the pick that gets remembered.',
          ],
        },
        {
          heading: "Pairing Bears With Other Gifts",
          body: "A teddy bear rarely needs to be the entire gift. Paired with a balloon bundle or a small box of chocolates, it becomes a fuller gift without much added cost — a common combination for birthdays and get-well-soon deliveries in particular.",
        },
        {
          heading: "Browse the Full Teddy Bear Collection",
          body: 'For the complete range of bears and stuffed animals, from classic to life-size: <a href="/en-lb/beirut/category/stuffed-animals">Teddy Bears & Stuffed Animals</a>.',
        },
        {
          heading: "Same-Day Delivery Across Lebanon",
          body: "Presentail delivers teddy bears same-day across Beirut and the rest of Lebanon — order before midday for same-afternoon delivery, or schedule ahead for an exact time.",
        },
        {
          heading: "Ready to Order?",
          body: '<a href="/en-lb/beirut/category/stuffed-animals">Shop Teddy Bears →</a>',
        },
        {
          body: "Presentail delivers across Lebanon, the UAE, and Cyprus, with same-day and scheduled delivery so your gift arrives exactly when it should.",
        },
      ],
    },
    get ar() { return this.en; },
    get fr() { return this.en; },
  },
};

// ---------------------------------------------------------------------------
// Editorial taxonomy + landing-page metadata
// ---------------------------------------------------------------------------

/**
 * The four editorial categories used by the blog landing page pills and the
 * crawlable blog index. Values are stable slugs — display labels are localized
 * by the consumers (Blog.tsx COPY / seo-inject).
 */
export const BLOG_CATEGORIES = /** @type {const} */ ([
  "flowers",
  "gifting-guides",
  "behind-the-scenes",
  "makers",
]);

/**
 * Locale-independent per-post metadata for the landing page. Kept in a single
 * slug-keyed map (instead of duplicating across the three language entries)
 * so category/featured/readingTime can never drift between locales.
 *
 * - `category`: one of BLOG_CATEGORIES.
 * - `featured`: editors flag exactly one post; getFeaturedBlogSlug falls back
 *   to the newest post when nothing is flagged.
 * - `readingTime`: optional explicit minutes override; when absent it is
 *   computed from the section body text (computeReadingTimeMinutes).
 */
export const BLOG_POST_META = {
  "inside-spring-sourcing-trip": { category: "behind-the-scenes", featured: true },
  "chocolatiers-behind-our-gift-boxes": { category: "makers" },
  "what-to-send-when-there-are-no-words": { category: "gifting-guides" },
  "flower-shop-in-achrafieh": { category: "flowers" },
  "send-roses-to-lebanon": { category: "flowers" },
  "balloon-delivery-beirut-lebanon": { category: "gifting-guides" },
  "baby-boy-balloons": { category: "gifting-guides" },
  "gift-shop-in-lebanon": { category: "gifting-guides" },
  "mothers-day-gifts-lebanon": { category: "gifting-guides" },
  "fathers-day-gifts-lebanon": { category: "gifting-guides" },
  "valentines-day-gifts-lebanon": { category: "gifting-guides" },
  "best-cakes-lebanon": { category: "gifting-guides" },
  "teddy-bear-gifts-lebanon": { category: "gifting-guides" },
};

/** Meta lookup with a safe default so a newly added post never crashes the page. */
export function getBlogPostMeta(slug) {
  return BLOG_POST_META[slug] ?? { category: "flowers" };
}

// Average adult reading speed. Arabic/French word counts via whitespace split
// are close enough for a "N min read" label.
const WORDS_PER_MINUTE = 200;

function countWords(text) {
  if (!text) return 0;
  return String(text).trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Compute reading time in whole minutes (min 1) from an article's sections
 * (body paragraphs, list items, and FAQ Q&A text). Used when a post has no
 * explicit `readingTime` in BLOG_POST_META.
 */
export function computeReadingTimeMinutes(sections) {
  let words = 0;
  for (const s of sections ?? []) {
    words += countWords(s.heading);
    words += countWords(s.body);
    for (const item of s.items ?? []) words += countWords(item);
    for (const f of s.faqItems ?? []) {
      words += countWords(f.q) + countWords(f.a);
    }
  }
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}

/** Reading time for a slug+lang: explicit meta override, else computed. */
export function getBlogPostReadingTime(slug, lang = "en") {
  const meta = getBlogPostMeta(slug);
  if (Number.isInteger(meta.readingTime) && meta.readingTime > 0) {
    return meta.readingTime;
  }
  const article = BLOG_POSTS[slug]?.[lang] ?? BLOG_POSTS[slug]?.en;
  return computeReadingTimeMinutes(article?.sections);
}

/**
 * Excerpt fallback chain: `description` → first section body (trimmed to
 * ~160 chars on a word boundary) → empty string.
 */
export function getBlogPostExcerpt(article) {
  if (!article) return "";
  const desc = (article.description ?? "").trim();
  if (desc) return desc;
  const firstBody = (article.sections ?? []).find((s) => s.body)?.body ?? "";
  const text = String(firstBody).trim();
  if (text.length <= 160) return text;
  const cut = text.slice(0, 160);
  return cut.slice(0, cut.lastIndexOf(" ") > 80 ? cut.lastIndexOf(" ") : 160) + "…";
}

/**
 * The featured post slug: the first slug flagged `featured: true` in
 * BLOG_POST_META, falling back to the newest post by datePublished (en).
 */
export function getFeaturedBlogSlug() {
  const flagged = Object.keys(BLOG_POSTS).find(
    (slug) => BLOG_POST_META[slug]?.featured === true,
  );
  if (flagged) return flagged;
  return Object.keys(BLOG_POSTS)
    .slice()
    .sort((a, b) => {
      const da = BLOG_POSTS[a]?.en?.datePublished ?? "";
      const db = BLOG_POSTS[b]?.en?.datePublished ?? "";
      return da < db ? 1 : da > db ? -1 : 0;
    })[0];
}

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
      ogImage: { url: "/blog/balloon-delivery-beirut-lebanon.webp", width: 1408, height: 768 },
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
          "address": {
            "@type": "PostalAddress",
            "streetAddress": "Abdel Wahab El Inglizi Street",
            "addressLocality": "Achrafieh",
            "addressRegion": "Beirut",
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
      eyebrow: "Beirut",
      title: "Flower Shop in Achrafieh | Presentail's Beirut Boutique",
      description:
        "Presentail's flower shop in Achrafieh sits steps from Hotel-Dieu de France on Abdel Wahab El Inglizi Street, with same-day and 90-minute delivery across Beirut.",
      datePublished: "2026-08-09",
      ogImage: { url: "/blog/balloon-delivery-beirut-lebanon.webp", width: 1408, height: 768 },
      ctaHref: "https://presentail.com/en-lb/beirut/category/flowers",
      ctaLabel: "Shop flowers now →",
      sections: [
        {
          body: "If you're searching for a flower shop in Achrafieh, Presentail's boutique on Abdel Wahab El Inglizi Street — just steps from Hotel-Dieu de France — is where Beirut comes to pick up fresh flowers in person or order them online for same-day delivery anywhere in the city.",
        },
        {
          heading: "Our Achrafieh Flower Boutique",
          body: "Our physical flower shop is located on Abdel Wahab El Inglizi Street, Achrafieh, Beirut, near Hotel-Dieu de France hospital. Open daily from 7 AM to 1 AM. Call ahead at 03 136 532 to check stock or place a phone order.",
        },
        {
          heading: "Same-Day Flower Delivery in Achrafieh and Beyond",
          body: "Order from our Achrafieh boutique and we'll deliver the same day across Beirut, including Achrafieh, Gemmayzeh, Mar Mikhael, Badaro, Verdun, Hamra, and Ras Beirut.",
        },
      ],
    },
    fr: {
      slug: "flower-shop-in-achrafieh",
      eyebrow: "Beirut",
      title: "Flower Shop in Achrafieh | Presentail's Beirut Boutique",
      description:
        "Presentail's flower shop in Achrafieh sits steps from Hotel-Dieu de France on Abdel Wahab El Inglizi Street, with same-day and 90-minute delivery across Beirut.",
      datePublished: "2026-08-09",
      ogImage: { url: "/blog/balloon-delivery-beirut-lebanon.webp", width: 1408, height: 768 },
      ctaHref: "https://presentail.com/en-lb/beirut/category/flowers",
      ctaLabel: "Shop flowers now →",
      sections: [
        {
          body: "If you're searching for a flower shop in Achrafieh, Presentail's boutique on Abdel Wahab El Inglizi Street — just steps from Hotel-Dieu de France — is where Beirut comes to pick up fresh flowers in person or order them online for same-day delivery anywhere in the city.",
        },
        {
          heading: "Our Achrafieh Flower Boutique",
          body: "Our physical flower shop is located on Abdel Wahab El Inglizi Street, Achrafieh, Beirut, near Hotel-Dieu de France hospital. Open daily from 7 AM to 1 AM. Call ahead at 03 136 532 to check stock or place a phone order.",
        },
        {
          heading: "Same-Day Flower Delivery in Achrafieh and Beyond",
          body: "Order from our Achrafieh boutique and we'll deliver the same day across Beirut, including Achrafieh, Gemmayzeh, Mar Mikhael, Badaro, Verdun, Hamra, and Ras Beirut.",
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
};

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
};

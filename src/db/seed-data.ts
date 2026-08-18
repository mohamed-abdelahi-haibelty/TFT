/**
 * Full test catalog: categories, products (with image counts varying 1-4),
 * and bundles ("boxes"). Image `publicId`s are deterministic
 * (`papeterie/<slug>` or `papeterie/<slug>-<n>`) and must already exist in
 * Cloudinary — see scripts/upload-catalog-images run before seeding.
 */

export type CategorySeed = {
  nameAr: string;
  nameFr: string;
  slug: string;
  sort: number;
};

export const categorySeeds: CategorySeed[] = [
  { nameAr: "حقائب", nameFr: "Sacs", slug: "bags", sort: 1 },
  { nameAr: "أقلام", nameFr: "Stylos", slug: "pens", sort: 2 },
  { nameAr: "دفاتر", nameFr: "Cahiers", slug: "notebooks", sort: 3 },
  { nameAr: "أقلام تحديد وتلوين", nameFr: "Marqueurs et surligneurs", slug: "markers", sort: 4 },
  { nameAr: "أدوات الرسم", nameFr: "Fournitures d'art", slug: "art-supplies", sort: 5 },
  { nameAr: "منظمات المكتب", nameFr: "Organiseurs de bureau", slug: "desk-organizers", sort: 6 },
  { nameAr: "لوازم مكتبية", nameFr: "Fournitures de bureau", slug: "office-supplies", sort: 7 },
  { nameAr: "آلات حاسبة", nameFr: "Calculatrices", slug: "calculators", sort: 8 },
  { nameAr: "الأوراق والملاحظات اللاصقة", nameFr: "Papier et notes autocollantes", slug: "paper-notes", sort: 9 },
  { nameAr: "أجندات وتقويمات", nameFr: "Agendas et calendriers", slug: "planners", sort: 10 },
  { nameAr: "بطاقات وتغليف الهدايا", nameFr: "Cartes et emballage cadeau", slug: "gift-cards", sort: 11 },
  { nameAr: "لوازم مدرسية", nameFr: "Fournitures scolaires", slug: "school-supplies", sort: 12 },
];

export type ProductSeed = {
  slug: string;
  sku: string;
  categorySlug: string;
  nameAr: string;
  nameFr: string;
  descriptionAr: string;
  descriptionFr: string;
  price: number;
  discountPrice?: number;
  stockQty: number;
  allowBackorder?: boolean;
  images: number;
};

export const productSeeds: ProductSeed[] = [
  // bags
  { slug: "school-backpack", sku: "P-000001", categorySlug: "bags", nameAr: "حقيبة ظهر مدرسية", nameFr: "Sac à dos scolaire", descriptionAr: "حقيبة ظهر متينة بحجرات متعددة، مناسبة للمدرسة.", descriptionFr: "Sac à dos robuste à plusieurs compartiments, idéal pour l'école.", price: 3500, stockQty: 40, images: 3 },
  { slug: "pencil-case", sku: "P-000002", categorySlug: "bags", nameAr: "حقيبة أقلام", nameFr: "Trousse", descriptionAr: "حقيبة أقلام صغيرة بسحاب.", descriptionFr: "Petite trousse à fermeture éclair.", price: 800, stockQty: 80, images: 2 },
  { slug: "laptop-backpack", sku: "P-000003", categorySlug: "bags", nameAr: "حقيبة ظهر للحاسوب المحمول", nameFr: "Sac à dos pour ordinateur portable", descriptionAr: "حقيبة ظهر أنيقة بحجرة مبطنة للحاسوب المحمول.", descriptionFr: "Sac à dos élégant avec compartiment matelassé pour ordinateur portable.", price: 5500, stockQty: 15, images: 3 },
  { slug: "tote-bag", sku: "P-000004", categorySlug: "bags", nameAr: "حقيبة يد قماشية", nameFr: "Sac tote en toile", descriptionAr: "حقيبة قماشية عملية للاستخدام اليومي.", descriptionFr: "Sac en toile pratique pour un usage quotidien.", price: 1800, stockQty: 25, images: 2 },

  // pens
  { slug: "ballpoint-pen-set", sku: "P-000005", categorySlug: "pens", nameAr: "طقم أقلام حبر جاف", nameFr: "Lot de stylos à bille", descriptionAr: "طقم أقلام حبر جاف سلسة الكتابة.", descriptionFr: "Lot de stylos à bille à écriture fluide.", price: 250, stockQty: 150, images: 2 },
  { slug: "gel-pen-set", sku: "P-000006", categorySlug: "pens", nameAr: "طقم أقلام جل ملونة", nameFr: "Lot de stylos gel colorés", descriptionAr: "أقلام جل بألوان زاهية للكتابة والتزيين.", descriptionFr: "Stylos gel aux couleurs vives pour écrire et décorer.", price: 350, stockQty: 120, images: 2 },
  { slug: "mechanical-pencil", sku: "P-000007", categorySlug: "pens", nameAr: "قلم رصاص ميكانيكي", nameFr: "Porte-mine", descriptionAr: "قلم رصاص ميكانيكي دقيق لا يحتاج للبري.", descriptionFr: "Porte-mine précis, sans besoin de taille-crayon.", price: 250, stockQty: 200, images: 1 },
  { slug: "fountain-pen", sku: "P-000008", categorySlug: "pens", nameAr: "قلم حبر سائل", nameFr: "Stylo plume", descriptionAr: "قلم حبر سائل أنيق للكتابة الفاخرة.", descriptionFr: "Stylo plume élégant pour une écriture soignée.", price: 900, stockQty: 30, images: 2 },

  // notebooks
  { slug: "notebook-100", sku: "P-000009", categorySlug: "notebooks", nameAr: "دفتر 100 ورقة", nameFr: "Cahier 100 pages", descriptionAr: "دفتر مسطر 100 ورقة.", descriptionFr: "Cahier ligné de 100 pages.", price: 300, stockQty: 200, images: 2 },
  { slug: "sketchbook", sku: "P-000010", categorySlug: "notebooks", nameAr: "دفتر رسم", nameFr: "Cahier de dessin", descriptionAr: "دفتر بصفحات بيضاء للرسم.", descriptionFr: "Cahier à pages blanches pour le dessin.", price: 450, stockQty: 100, images: 2 },
  { slug: "spiral-notebook", sku: "P-000011", categorySlug: "notebooks", nameAr: "دفتر بحلقات معدنية", nameFr: "Cahier à spirale", descriptionAr: "دفتر بحلقات معدنية سهل الفتح والطي.", descriptionFr: "Cahier à spirale, facile à ouvrir et à plier.", price: 400, stockQty: 150, images: 3 },
  { slug: "leather-journal", sku: "P-000012", categorySlug: "notebooks", nameAr: "مفكرة جلدية", nameFr: "Carnet en cuir", descriptionAr: "مفكرة أنيقة بغلاف جلدي، مثالية للهدايا.", descriptionFr: "Carnet élégant à couverture en cuir, idéal pour offrir.", price: 1200, discountPrice: 999, stockQty: 40, images: 2 },

  // markers
  { slug: "highlighter-set", sku: "P-000013", categorySlug: "markers", nameAr: "طقم أقلام تحديد", nameFr: "Lot de surligneurs", descriptionAr: "أقلام تحديد بألوان فسفورية زاهية.", descriptionFr: "Surligneurs aux couleurs fluorescentes vives.", price: 300, stockQty: 90, images: 3 },
  { slug: "marker-set-12", sku: "P-000014", categorySlug: "markers", nameAr: "طقم فلوماستر 12 لون", nameFr: "Lot de 12 feutres", descriptionAr: "طقم فلوماستر بـ12 لونًا للرسم والتلوين.", descriptionFr: "Lot de 12 feutres pour dessiner et colorier.", price: 600, stockQty: 60, images: 2 },
  { slug: "fineliner-set", sku: "P-000015", categorySlug: "markers", nameAr: "طقم أقلام رفيعة", nameFr: "Lot de feutres fins", descriptionAr: "أقلام رفيعة دقيقة للكتابة والرسم التفصيلي.", descriptionFr: "Feutres fins pour l'écriture et le dessin détaillé.", price: 500, stockQty: 70, images: 2 },
  { slug: "watercolor-brush-pen-set", sku: "P-000016", categorySlug: "markers", nameAr: "طقم أقلام فرشاة مائية", nameFr: "Lot de feutres pinceaux aquarelle", descriptionAr: "أقلام فرشاة بحبر مائي لتدرجات لونية ناعمة.", descriptionFr: "Feutres pinceaux à encre aquarelle pour des dégradés doux.", price: 750, stockQty: 35, images: 1 },

  // art-supplies
  { slug: "watercolor-paint-set", sku: "P-000017", categorySlug: "art-supplies", nameAr: "طقم ألوان مائية", nameFr: "Set de peinture aquarelle", descriptionAr: "طقم ألوان مائية بتشكيلة واسعة من الألوان.", descriptionFr: "Set de peinture aquarelle avec une large gamme de couleurs.", price: 650, stockQty: 45, images: 3 },
  { slug: "paintbrush-set", sku: "P-000018", categorySlug: "art-supplies", nameAr: "طقم فرش رسم", nameFr: "Lot de pinceaux", descriptionAr: "فرش رسم بمقاسات متنوعة للرسم الاحترافي.", descriptionFr: "Pinceaux de tailles variées pour la peinture professionnelle.", price: 400, stockQty: 55, images: 2 },
  { slug: "colored-pencils-set", sku: "P-000019", categorySlug: "art-supplies", nameAr: "طقم أقلام رصاص ملونة", nameFr: "Lot de crayons de couleur", descriptionAr: "أقلام رصاص ملونة بجودة عالية للرسم والتظليل.", descriptionFr: "Crayons de couleur de haute qualité pour le dessin et l'ombrage.", price: 550, stockQty: 65, images: 4 },
  { slug: "acrylic-paint-set", sku: "P-000020", categorySlug: "art-supplies", nameAr: "طقم ألوان أكريليك", nameFr: "Set de peinture acrylique", descriptionAr: "ألوان أكريليك كثيفة القوام لأعمال فنية متينة.", descriptionFr: "Peinture acrylique à texture épaisse pour des œuvres durables.", price: 900, stockQty: 20, images: 2 },

  // desk-organizers
  { slug: "desk-organizer-tray", sku: "P-000021", categorySlug: "desk-organizers", nameAr: "صينية تنظيم المكتب", nameFr: "Plateau organisateur de bureau", descriptionAr: "صينية بتقسيمات متعددة لترتيب أدوات المكتب.", descriptionFr: "Plateau à compartiments multiples pour ranger vos fournitures.", price: 700, stockQty: 30, images: 2 },
  { slug: "pen-holder-cup", sku: "P-000022", categorySlug: "desk-organizers", nameAr: "كوب حامل أقلام", nameFr: "Pot à crayons", descriptionAr: "كوب معدني أنيق لحفظ الأقلام على المكتب.", descriptionFr: "Pot métallique élégant pour ranger vos stylos sur le bureau.", price: 250, stockQty: 80, images: 1 },
  { slug: "file-organizer", sku: "P-000023", categorySlug: "desk-organizers", nameAr: "منظم ملفات", nameFr: "Range-documents", descriptionAr: "منظم ملفات عمودي لترتيب الأوراق والمستندات.", descriptionFr: "Range-documents vertical pour classer papiers et dossiers.", price: 850, stockQty: 25, images: 2 },
  { slug: "drawer-organizer", sku: "P-000024", categorySlug: "desk-organizers", nameAr: "منظم أدراج", nameFr: "Organiseur de tiroir", descriptionAr: "منظم أدراج بحواجز قابلة للتعديل.", descriptionFr: "Organiseur de tiroir à cloisons ajustables.", price: 600, stockQty: 35, images: 1 },

  // office-supplies
  { slug: "stapler-set", sku: "P-000025", categorySlug: "office-supplies", nameAr: "دباسة مكتبية", nameFr: "Agrafeuse de bureau", descriptionAr: "دباسة متينة مع علبة دبابيس إضافية.", descriptionFr: "Agrafeuse robuste avec boîte d'agrafes supplémentaire.", price: 300, stockQty: 70, images: 2 },
  { slug: "tape-dispenser", sku: "P-000026", categorySlug: "office-supplies", nameAr: "حامل شريط لاصق", nameFr: "Dévidoir de ruban adhésif", descriptionAr: "حامل شريط لاصق مع قاعدة ثابتة.", descriptionFr: "Dévidoir de ruban adhésif avec base stable.", price: 200, stockQty: 90, images: 1 },
  { slug: "hole-punch", sku: "P-000027", categorySlug: "office-supplies", nameAr: "خرامة أوراق", nameFr: "Perforatrice", descriptionAr: "خرامة أوراق مزدوجة الثقب دقيقة القياس.", descriptionFr: "Perforatrice à double trou, précise et fiable.", price: 350, stockQty: 40, images: 2 },
  { slug: "scissors-set", sku: "P-000028", categorySlug: "office-supplies", nameAr: "مقص مكتبي", nameFr: "Ciseaux de bureau", descriptionAr: "مقص مكتبي حاد بمقبض مريح.", descriptionFr: "Ciseaux de bureau tranchants à poignée confortable.", price: 150, stockQty: 100, images: 2 },

  // calculators
  { slug: "basic-calculator", sku: "P-000029", categorySlug: "calculators", nameAr: "آلة حاسبة أساسية", nameFr: "Calculatrice de base", descriptionAr: "آلة حاسبة بسيطة للعمليات اليومية.", descriptionFr: "Calculatrice simple pour les opérations quotidiennes.", price: 400, stockQty: 60, images: 1 },
  { slug: "scientific-calculator", sku: "P-000030", categorySlug: "calculators", nameAr: "آلة حاسبة علمية", nameFr: "Calculatrice scientifique", descriptionAr: "آلة حاسبة علمية بوظائف متقدمة للطلاب.", descriptionFr: "Calculatrice scientifique aux fonctions avancées pour étudiants.", price: 1200, stockQty: 30, images: 2 },
  { slug: "pocket-calculator", sku: "P-000031", categorySlug: "calculators", nameAr: "آلة حاسبة جيب", nameFr: "Calculatrice de poche", descriptionAr: "آلة حاسبة صغيرة سهلة الحمل.", descriptionFr: "Calculatrice compacte, facile à transporter.", price: 300, stockQty: 45, images: 1 },
  { slug: "desktop-calculator", sku: "P-000032", categorySlug: "calculators", nameAr: "آلة حاسبة مكتبية", nameFr: "Calculatrice de bureau", descriptionAr: "آلة حاسبة مكتبية بشاشة كبيرة وأزرار مريحة.", descriptionFr: "Calculatrice de bureau à grand écran et touches confortables.", price: 550, stockQty: 0, allowBackorder: true, images: 2 },

  // paper-notes
  { slug: "sticky-notes-pack", sku: "P-000033", categorySlug: "paper-notes", nameAr: "علبة ملاحظات لاصقة", nameFr: "Bloc de notes autocollantes", descriptionAr: "ملاحظات لاصقة ملونة لتنظيم المهام.", descriptionFr: "Notes autocollantes colorées pour organiser vos tâches.", price: 150, stockQty: 200, images: 2 },
  { slug: "printer-paper-ream", sku: "P-000034", categorySlug: "paper-notes", nameAr: "رزمة ورق طباعة", nameFr: "Rame de papier imprimante", descriptionAr: "رزمة ورق أبيض A4 عالي الجودة للطباعة.", descriptionFr: "Rame de papier blanc A4 de haute qualité pour l'impression.", price: 400, stockQty: 100, images: 1 },
  { slug: "index-cards", sku: "P-000035", categorySlug: "paper-notes", nameAr: "بطاقات فهرسة", nameFr: "Fiches bristol", descriptionAr: "بطاقات فهرسة مقواة للمراجعة والتلخيص.", descriptionFr: "Fiches bristol rigides pour la révision et les résumés.", price: 200, stockQty: 90, images: 1 },
  { slug: "memo-pad", sku: "P-000036", categorySlug: "paper-notes", nameAr: "كتيب ملاحظات", nameFr: "Bloc-notes mémo", descriptionAr: "كتيب صغير للملاحظات السريعة.", descriptionFr: "Petit bloc-notes pour des notes rapides.", price: 180, stockQty: 110, images: 3 },

  // planners
  { slug: "weekly-planner", sku: "P-000037", categorySlug: "planners", nameAr: "مفكرة أسبوعية", nameFr: "Agenda hebdomadaire", descriptionAr: "مفكرة أسبوعية لتنظيم المواعيد والمهام.", descriptionFr: "Agenda hebdomadaire pour organiser rendez-vous et tâches.", price: 700, discountPrice: 599, stockQty: 50, images: 2 },
  { slug: "desk-calendar", sku: "P-000038", categorySlug: "planners", nameAr: "تقويم مكتبي", nameFr: "Calendrier de bureau", descriptionAr: "تقويم مكتبي أنيق بتصميم بسيط.", descriptionFr: "Calendrier de bureau élégant au design épuré.", price: 450, stockQty: 60, images: 2 },
  { slug: "wall-calendar", sku: "P-000039", categorySlug: "planners", nameAr: "تقويم حائط", nameFr: "Calendrier mural", descriptionAr: "تقويم حائط كبير سهل القراءة.", descriptionFr: "Calendrier mural grand format, facile à lire.", price: 350, stockQty: 40, images: 1 },
  { slug: "daily-agenda", sku: "P-000040", categorySlug: "planners", nameAr: "أجندة يومية", nameFr: "Agenda journalier", descriptionAr: "أجندة يومية بصفحة لكل يوم.", descriptionFr: "Agenda journalier avec une page par jour.", price: 600, stockQty: 55, images: 2 },

  // gift-cards
  { slug: "greeting-card-set", sku: "P-000041", categorySlug: "gift-cards", nameAr: "طقم بطاقات معايدة", nameFr: "Lot de cartes de vœux", descriptionAr: "بطاقات معايدة أنيقة لمختلف المناسبات.", descriptionFr: "Cartes de vœux élégantes pour toutes les occasions.", price: 250, stockQty: 80, images: 2 },
  { slug: "gift-wrap-roll", sku: "P-000042", categorySlug: "gift-cards", nameAr: "لفة ورق تغليف هدايا", nameFr: "Rouleau de papier cadeau", descriptionAr: "ورق تغليف هدايا بنقوش زاهية.", descriptionFr: "Papier cadeau aux motifs colorés.", price: 300, stockQty: 70, images: 2 },
  { slug: "gift-box-set", sku: "P-000043", categorySlug: "gift-cards", nameAr: "طقم علب هدايا", nameFr: "Lot de boîtes cadeau", descriptionAr: "علب هدايا بمقاسات متعددة وألوان أنيقة.", descriptionFr: "Boîtes cadeau de tailles variées et couleurs élégantes.", price: 500, stockQty: 40, images: 2 },
  { slug: "ribbon-set", sku: "P-000044", categorySlug: "gift-cards", nameAr: "طقم شرائط زينة", nameFr: "Lot de rubans décoratifs", descriptionAr: "شرائط زينة ملونة لتزيين الهدايا.", descriptionFr: "Rubans décoratifs colorés pour décorer vos cadeaux.", price: 200, stockQty: 90, images: 1 },

  // school-supplies
  { slug: "crayon-box-24", sku: "P-000045", categorySlug: "school-supplies", nameAr: "علبة أقلام شمع 24 لون", nameFr: "Boîte de 24 crayons de cire", descriptionAr: "علبة أقلام شمع بـ24 لونًا زاهيًا للأطفال.", descriptionFr: "Boîte de 24 crayons de cire aux couleurs vives pour enfants.", price: 300, stockQty: 100, images: 3 },
  { slug: "glue-stick-pack", sku: "P-000046", categorySlug: "school-supplies", nameAr: "علبة أعواد صمغ", nameFr: "Lot de bâtons de colle", descriptionAr: "أعواد صمغ آمنة للاستخدام المدرسي.", descriptionFr: "Bâtons de colle sûrs pour un usage scolaire.", price: 80, stockQty: 150, images: 1 },
  { slug: "ruler-scissors-set", sku: "P-000047", categorySlug: "school-supplies", nameAr: "طقم مسطرة ومقص", nameFr: "Set règle et ciseaux", descriptionAr: "طقم مسطرة ومقص مدرسي آمن للأطفال.", descriptionFr: "Set règle et ciseaux scolaires, sûrs pour les enfants.", price: 250, stockQty: 75, images: 2 },
  { slug: "geometry-set", sku: "P-000048", categorySlug: "school-supplies", nameAr: "طقم هندسة", nameFr: "Set de géométrie", descriptionAr: "طقم هندسة كامل بالمسطرة والمنقلة والفرجار.", descriptionFr: "Set de géométrie complet avec règle, rapporteur et compas.", price: 400, stockQty: 60, images: 1 },
];

export type BundleSeed = {
  slug: string;
  sku: string;
  nameAr: string;
  nameFr: string;
  descriptionAr: string;
  descriptionFr: string;
  price: number;
  images: number;
  items: { productSlug: string; qty: number }[];
};

export const bundleSeeds: BundleSeed[] = [
  { slug: "back-to-school-box", sku: "B-000001", nameAr: "صندوق العودة المدرسية", nameFr: "Box de rentrée scolaire", descriptionAr: "حقيبة ظهر مع دفترين وطقم أقلام حبر جاف.", descriptionFr: "Un sac à dos avec deux cahiers et un lot de stylos à bille.", price: 3900, images: 1, items: [{ productSlug: "school-backpack", qty: 1 }, { productSlug: "notebook-100", qty: 2 }, { productSlug: "ballpoint-pen-set", qty: 1 }] },
  { slug: "office-starter-box", sku: "B-000002", nameAr: "صندوق بداية المكتب", nameFr: "Box de démarrage bureau", descriptionAr: "كل ما تحتاجه لتجهيز مكتب جديد.", descriptionFr: "Tout le nécessaire pour équiper un nouveau bureau.", price: 1400, images: 1, items: [{ productSlug: "desk-organizer-tray", qty: 1 }, { productSlug: "stapler-set", qty: 1 }, { productSlug: "tape-dispenser", qty: 1 }, { productSlug: "ballpoint-pen-set", qty: 1 }] },
  { slug: "art-lovers-box", sku: "B-000003", nameAr: "صندوق عشاق الفن", nameFr: "Box des passionnés d'art", descriptionAr: "مجموعة متكاملة لهواة الرسم والتلوين.", descriptionFr: "Une collection complète pour les amateurs de dessin et de peinture.", price: 1900, images: 1, items: [{ productSlug: "watercolor-paint-set", qty: 1 }, { productSlug: "paintbrush-set", qty: 1 }, { productSlug: "sketchbook", qty: 1 }, { productSlug: "colored-pencils-set", qty: 1 }] },
  { slug: "exam-season-box", sku: "B-000004", nameAr: "صندوق موسم الامتحانات", nameFr: "Box de la période d'examens", descriptionAr: "أدوات أساسية للمراجعة والتحضير للامتحانات.", descriptionFr: "Les essentiels pour réviser et se préparer aux examens.", price: 900, images: 1, items: [{ productSlug: "highlighter-set", qty: 1 }, { productSlug: "sticky-notes-pack", qty: 2 }, { productSlug: "index-cards", qty: 1 }, { productSlug: "basic-calculator", qty: 1 }] },
  { slug: "teacher-essentials-box", sku: "B-000005", nameAr: "صندوق أساسيات المعلم", nameFr: "Box essentiels enseignant", descriptionAr: "أدوات يومية يحتاجها كل معلم.", descriptionFr: "Les outils quotidiens dont chaque enseignant a besoin.", price: 2300, images: 1, items: [{ productSlug: "weekly-planner", qty: 1 }, { productSlug: "marker-set-12", qty: 1 }, { productSlug: "stapler-set", qty: 1 }, { productSlug: "file-organizer", qty: 1 }] },
  { slug: "university-starter-box", sku: "B-000006", nameAr: "صندوق بداية الجامعة", nameFr: "Box de rentrée universitaire", descriptionAr: "مجموعة متكاملة لطلاب الجامعة.", descriptionFr: "Une collection complète pour les étudiants universitaires.", price: 7500, images: 1, items: [{ productSlug: "laptop-backpack", qty: 1 }, { productSlug: "spiral-notebook", qty: 2 }, { productSlug: "gel-pen-set", qty: 1 }, { productSlug: "scientific-calculator", qty: 1 }] },
  { slug: "kids-creative-box", sku: "B-000007", nameAr: "صندوق إبداع الأطفال", nameFr: "Box créative pour enfants", descriptionAr: "أدوات ملونة تحفز إبداع الأطفال.", descriptionFr: "Des outils colorés pour stimuler la créativité des enfants.", price: 1100, images: 1, items: [{ productSlug: "crayon-box-24", qty: 1 }, { productSlug: "colored-pencils-set", qty: 1 }, { productSlug: "sketchbook", qty: 1 }, { productSlug: "glue-stick-pack", qty: 1 }] },
  { slug: "gift-wrapping-box", sku: "B-000008", nameAr: "صندوق تغليف الهدايا", nameFr: "Box d'emballage cadeau", descriptionAr: "كل ما يلزم لتغليف هدية أنيقة.", descriptionFr: "Tout le nécessaire pour emballer un cadeau élégant.", price: 1150, images: 1, items: [{ productSlug: "gift-wrap-roll", qty: 1 }, { productSlug: "ribbon-set", qty: 1 }, { productSlug: "greeting-card-set", qty: 1 }, { productSlug: "gift-box-set", qty: 1 }] },
  { slug: "desk-makeover-box", sku: "B-000009", nameAr: "صندوق تجديد المكتب", nameFr: "Box relooking bureau", descriptionAr: "أعد ترتيب مكتبك بأناقة.", descriptionFr: "Réorganisez votre bureau avec élégance.", price: 1900, images: 1, items: [{ productSlug: "desk-organizer-tray", qty: 1 }, { productSlug: "pen-holder-cup", qty: 1 }, { productSlug: "drawer-organizer", qty: 1 }, { productSlug: "desk-calendar", qty: 1 }] },
  { slug: "planner-lovers-box", sku: "B-000010", nameAr: "صندوق عشاق التخطيط", nameFr: "Box des amateurs de planning", descriptionAr: "مجموعة لتنظيم يومك بفعالية.", descriptionFr: "Une collection pour organiser efficacement votre journée.", price: 1400, images: 1, items: [{ productSlug: "weekly-planner", qty: 1 }, { productSlug: "sticky-notes-pack", qty: 1 }, { productSlug: "gel-pen-set", qty: 1 }, { productSlug: "highlighter-set", qty: 1 }] },
  { slug: "watercolor-artist-box", sku: "B-000011", nameAr: "صندوق فنان الألوان المائية", nameFr: "Box artiste aquarelle", descriptionAr: "مجموعة مخصصة لعشاق الألوان المائية.", descriptionFr: "Une collection dédiée aux amateurs d'aquarelle.", price: 1700, images: 1, items: [{ productSlug: "watercolor-paint-set", qty: 1 }, { productSlug: "paintbrush-set", qty: 2 }, { productSlug: "sketchbook", qty: 1 }] },
  { slug: "back-to-office-box", sku: "B-000012", nameAr: "صندوق العودة للمكتب", nameFr: "Box de retour au bureau", descriptionAr: "جهّز مكتبك بعد العطلة.", descriptionFr: "Préparez votre bureau après les vacances.", price: 2600, images: 1, items: [{ productSlug: "weekly-planner", qty: 1 }, { productSlug: "scientific-calculator", qty: 1 }, { productSlug: "stapler-set", qty: 1 }, { productSlug: "notebook-100", qty: 1 }] },
  { slug: "birthday-gift-box", sku: "B-000013", nameAr: "صندوق هدية عيد الميلاد", nameFr: "Box cadeau d'anniversaire", descriptionAr: "هدية جاهزة لعيد ميلاد مميز.", descriptionFr: "Un cadeau prêt pour un anniversaire mémorable.", price: 950, images: 1, items: [{ productSlug: "greeting-card-set", qty: 1 }, { productSlug: "gift-wrap-roll", qty: 1 }, { productSlug: "ribbon-set", qty: 1 }, { productSlug: "notebook-100", qty: 1 }] },
  { slug: "geometry-class-box", sku: "B-000014", nameAr: "صندوق حصة الهندسة", nameFr: "Box du cours de géométrie", descriptionAr: "أدوات الهندسة الأساسية للطلاب.", descriptionFr: "Les outils de géométrie essentiels pour les élèves.", price: 1200, images: 1, items: [{ productSlug: "geometry-set", qty: 1 }, { productSlug: "ruler-scissors-set", qty: 1 }, { productSlug: "pocket-calculator", qty: 1 }, { productSlug: "notebook-100", qty: 1 }] },
  { slug: "journaling-box", sku: "B-000015", nameAr: "صندوق كتابة اليوميات", nameFr: "Box de journaling", descriptionAr: "مجموعة أنيقة لكتابة اليوميات والأفكار.", descriptionFr: "Une collection élégante pour écrire son journal et ses idées.", price: 2400, images: 1, items: [{ productSlug: "leather-journal", qty: 1 }, { productSlug: "gel-pen-set", qty: 1 }, { productSlug: "fineliner-set", qty: 1 }, { productSlug: "sticky-notes-pack", qty: 1 }] },
  { slug: "new-semester-box", sku: "B-000016", nameAr: "صندوق الفصل الدراسي الجديد", nameFr: "Box du nouveau semestre", descriptionAr: "جهّز طفلك للفصل الدراسي الجديد.", descriptionFr: "Préparez votre enfant pour le nouveau semestre.", price: 5200, images: 1, items: [{ productSlug: "school-backpack", qty: 1 }, { productSlug: "spiral-notebook", qty: 2 }, { productSlug: "ballpoint-pen-set", qty: 1 }, { productSlug: "pencil-case", qty: 1 }] },
  { slug: "calligraphy-box", sku: "B-000017", nameAr: "صندوق الخط", nameFr: "Box de calligraphie", descriptionAr: "أدوات لممارسة فن الخط.", descriptionFr: "Des outils pour pratiquer l'art de la calligraphie.", price: 2000, images: 1, items: [{ productSlug: "fineliner-set", qty: 1 }, { productSlug: "leather-journal", qty: 1 }, { productSlug: "ruler-scissors-set", qty: 1 }] },
  { slug: "mini-office-box", sku: "B-000018", nameAr: "صندوق المكتب المصغر", nameFr: "Mini box de bureau", descriptionAr: "أساسيات مكتبية مصغرة لكل استخدام.", descriptionFr: "Les essentiels de bureau miniatures pour tout usage.", price: 1100, images: 1, items: [{ productSlug: "stapler-set", qty: 1 }, { productSlug: "tape-dispenser", qty: 1 }, { productSlug: "hole-punch", qty: 1 }, { productSlug: "scissors-set", qty: 1 }, { productSlug: "memo-pad", qty: 1 }] },
];

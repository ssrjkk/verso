export type BlockType =
  | "HERO"
  | "FEATURES"
  | "PRICING"
  | "FAQ"
  | "RICH_TEXT"
  | "GALLERY"
  | "CODE"
  | "CTA";

export const BLOCK_TYPES: BlockType[] = [
  "HERO",
  "FEATURES",
  "PRICING",
  "FAQ",
  "RICH_TEXT",
  "GALLERY",
  "CODE",
  "CTA",
];

export const BLOCK_TYPE_LABELS: Record<BlockType, string> = {
  HERO: "Шапка (Hero)",
  FEATURES: "Преимущества",
  PRICING: "Тарифы",
  FAQ: "Вопросы и ответы",
  RICH_TEXT: "Текст",
  GALLERY: "Галерея",
  CODE: "Код",
  CTA: "Призыв к действию",
};

export const DEFAULT_BLOCKS: Record<BlockType, object> = {
  HERO: {
    eyebrow: "Новый раздел",
    title: "Заголовок страницы",
    subtitle: "Короткое описание раздела: о чём эта страница и какую пользу получит читатель.",
    ctaLabel: "Подробнее",
    ctaHref: "#",
  },
  FEATURES: {
    title: "Наши преимущества",
    items: [
      { title: "Быстрый старт", text: "Запуск проекта за один день без сложной настройки." },
      { title: "Гибкие настройки", text: "Каждый блок адаптируется под задачи редакции." },
      { title: "SEO из коробки", text: "Мета-теги, канонические ссылки и редиректы." },
    ],
  },
  PRICING: {
    title: "Тарифы",
    plans: [
      {
        name: "Старт",
        price: "0 ₽",
        period: "навсегда",
        features: ["До 10 записей", "Базовые блоки", "Поддержка по email"],
        featured: false,
      },
      {
        name: "Про",
        price: "990 ₽/мес",
        period: "ежемесячно",
        features: ["Безлимит записей", "Все блоки", "Приоритетная поддержка"],
        featured: true,
      },
    ],
  },
  FAQ: {
    title: "Частые вопросы",
    items: [
      { q: "Что такое Corvid CMS?", a: "Блочная headless-CMS с визуальным конструктором страниц." },
      { q: "Как опубликовать запись?", a: "Заполните блоки, проверьте превью и нажмите «Опубликовать»." },
      { q: "Можно ли откатить изменения?", a: "Да, каждая правка сохраняется как ревизия, откат — в один клик." },
    ],
  },
  RICH_TEXT: {
    title: "О разделе",
    markdown:
      "Первый абзац текста. Здесь рассказывается о главном.\n\nВторой абзац: детали, факты и пояснения для читателя.",
  },
  GALLERY: {
    title: "Галерея",
    images: [
      { src: "https://picsum.photos/seed/corvid1/640/400", alt: "Изображение 1" },
      { src: "https://picsum.photos/seed/corvid2/640/400", alt: "Изображение 2" },
      { src: "https://picsum.photos/seed/corvid3/640/400", alt: "Изображение 3" },
    ],
  },
  CODE: {
    title: "Пример кода",
    language: "typescript",
    code: 'const hello = "Corvid CMS";\nconsole.log(hello);',
  },
  CTA: {
    title: "Готовы начать?",
    text: "Создайте первую запись и опубликуйте её за пару минут.",
    buttonLabel: "Создать запись",
    buttonHref: "#",
  },
};

export function defaultPropsJson(type: BlockType): string {
  return JSON.stringify(DEFAULT_BLOCKS[type], null, 2);
}

export function parseProps<T extends object>(propsJson: string, fallback: T): T {
  try {
    const parsed = JSON.parse(propsJson) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as T;
    return fallback;
  } catch {
    return fallback;
  }
}

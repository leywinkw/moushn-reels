/**
 * ВЕСЬ КОНТЕНТ САЙТА — ТОЛЬКО ЗДЕСЬ.
 *
 * Сейчас это каркас: всё в [квадратных скобках] — плейсхолдеры, все цифры — демо-значения.
 * Замените их своими данными и выставьте `demo: false` — лента «ДЕМО-КОНТЕНТ» исчезнет.
 * Ничего не выдумывайте: если пункта нет — оставьте массив пустым, сцена сама пропустится
 * (FAQ без ответов, кейсы без кейсов, витрина без файлов в public/proof).
 */

export type Link = { text: string; href: string };
export type Figure = { value: number; plus?: boolean; label: string };
export type Format = { name: string; value: number };
export type CaseItem = {
  title: string;
  tags: string; // «формат · задача»
  result: string; // одна фраза результата; цифры — только реальные
  image?: { src: string; width: number; height: number; alt: string }; // кадр из работы (ИИ)
};
export type Step = { title: string; text: string };
export type Faq = { q: string; a: string };

export const content = {
  /** true — показывать ленту «ДЕМО-КОНТЕНТ · замените в src/lib/content.ts» */
  demo: true,

  meta: {
    title: '[БРЕНД] — [оффер про ИИ-контент в одну строку]',
    description: '[Описание для поисковиков и соцсетей: какой ИИ-контент вы делаете и для кого]',
    url: 'https://example.com', // TODO: домен сайта
  },

  brand: {
    name: 'БРЕНД',
    /** микроярлык над рамкой вордмарка */
    label: 'MODEL v1.0',
  },

  slogan: '[Слоган в одну строку]',
  /** короткая версия слогана для строки `> prompt: "…"` */
  promptShort: '[короткая версия слогана]',

  cta: {
    text: '[Текст кнопки]',
    href: '#order',
    /** микрокопия под кнопкой: что будет после нажатия, условия или цена */
    note: '[что будет после нажатия · условия или цена]',
  },
  secondary: { text: '[Второстепенная ссылка]', href: '#faq' } as Link,

  offer: {
    caption: 'ЧТО МЫ ДЕЛАЕМ',
    /** заголовок; слова из `accent` подсвечиваются неоном */
    title: '[Какой ИИ-контент вы делаете и что получает клиент]',
    accent: ['[Какой', 'ИИ-контент'],
    subtitle: '[Подзаголовок оффера: формат работы, сроки, для кого]',
    main: { value: 120, plus: true, label: '[подпись главной цифры]' } as Figure, // ДЕМО
    extra: [
      { value: 40, label: '[доп. цифра 1]' },
      { value: 12, label: '[доп. цифра 2]' },
    ] as Figure[], // ДЕМО
  },

  pipeline: {
    caption: 'КАК РОЖДАЕТСЯ КОНТЕНТ',
    items: ['[Этап 1 — бриф]', '[Этап 2 — промпт-дизайн]', '[Этап 3 — генерация]', '[Этап 4 — отбор]', '[Этап 5 — сдача]'],
  },

  formats: {
    caption: 'ФОРМАТЫ',
    /** вторая цифра заголовка «N форматов · M …»; N считается из списка */
    second: { value: 6, words: ['[направление]', '[направления]', '[направлений]'] as [string, string, string] }, // ДЕМО
    items: [
      { name: '[Изображения]', value: 48 },
      { name: '[Видео]', value: 22 },
      { name: '[Тексты]', value: 35 },
      { name: '[Озвучка]', value: 14 },
      { name: '[Аватары]', value: 9 },
    ] as Format[], // ДЕМО
    link: { text: '[все работы — тут]', href: '#cases' } as Link,
  },

  cases: {
    caption: 'КЕЙСЫ',
    items: [
      { title: '[Кейс 01]', tags: '[формат · задача]', result: '[Одна фраза о результате. Цифры — только реальные.]' },
      { title: '[Кейс 02]', tags: '[формат · задача]', result: '[Одна фраза о результате. Цифры — только реальные.]' },
      { title: '[Кейс 03]', tags: '[формат · задача]', result: '[Одна фраза о результате. Цифры — только реальные.]' },
    ] as CaseItem[],
  },

  showcase: {
    caption: 'РАБОТЫ',
    /** alt для файлов из public/proof: имя файла → описание (пометка про ИИ добавится сама) */
    alts: {} as Record<string, string>,
  },

  /** какие инструменты и модели можно упоминать в логах генерации; пусто — не упоминать */
  tools: [] as string[],

  /** как маркируется ИИ-контент и кому принадлежат права (используется в FAQ/микрокопии) */
  rights: '[Как вы маркируете ИИ-контент и кому принадлежат права]',

  order: {
    caption: 'КАК ЗАКАЗАТЬ',
    steps: [
      { title: '[Шаг 1]', text: '[Что делает клиент на первом шаге — одна-две фразы.]' },
      { title: '[Шаг 2]', text: '[Что происходит дальше — одна-две фразы.]' },
      { title: '[Шаг 3]', text: '[Что клиент получает в конце — одна-две фразы.]' },
    ] as Step[],
  },

  faq: {
    caption: 'FAQ',
    /** только вопросы с ответами; пустой массив — сцены нет */
    items: [
      { q: '[Вопрос про права на контент?]', a: '[Ответ — только из ваших условий.]' },
      { q: '[Вопрос про маркировку ИИ?]', a: '[Ответ — только из ваших условий.]' },
      { q: '[Вопрос про правки и сроки?]', a: '[Ответ — только из ваших условий.]' },
    ] as Faq[],
  },

  final: {
    caption: 'ФИНАЛ',
    word: '[Слово-призыв]',
  },

  hud: {
    /** названия сцен в HUD (SCN 01/07 · NAME) */
    names: {
      hero: 'START',
      offer: 'OFFER',
      pipeline: 'PIPELINE',
      formats: 'FORMATS',
      cases: 'CASES',
      showcase: 'SHOWCASE',
      order: 'ORDER',
      faq: 'FAQ',
      final: 'FINAL',
    },
    /** текстовая навигация по разделам (десктоп) */
    nav: [
      { id: 'offer', text: 'Оффер' },
      { id: 'pipeline', text: 'Процесс' },
      { id: 'formats', text: 'Форматы' },
      { id: 'cases', text: 'Кейсы' },
      { id: 'order', text: 'Заказ' },
    ],
  },

  analytics: {
    /** 'none' | 'plausible' | 'umami' */
    provider: 'none' as 'none' | 'plausible' | 'umami',
    domain: '', // plausible: data-domain
    websiteId: '', // umami: data-website-id
    src: '', // URL скрипта аналитики
  },
};

export type Content = typeof content;

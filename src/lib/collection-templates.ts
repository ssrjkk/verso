import type { CollectionField, CollectionFieldType } from "@/lib/collection-schema";

export type CollectionTemplate = {
  id: string;
  name: string;
  description: string;
  icon: string;
  fields: CollectionField[];
};

function field(
  key: string,
  label: string,
  type: CollectionFieldType,
  extra: Partial<CollectionField> = {},
): CollectionField {
  return { key, label, type, required: false, ...extra };
}

/**
 * Отраслевые стартовые наборы полей.
 *
 * Шаблон — это не отдельная сущность в БД, а удобная заготовка: после
 * применения поля можно переименовать, удалить или дополнить. Поэтому
 * добавление новой отрасли не требует миграции.
 */
export const COLLECTION_TEMPLATES: CollectionTemplate[] = [
  {
    id: "blog",
    name: "Блог и новости",
    description: "Статьи, новости и экспертные материалы",
    icon: "Newspaper",
    fields: [
      field("author", "Автор", "text", {
        placeholder: "Имя и фамилия",
        help: "Кто подготовил материал",
      }),
      field("category", "Рубрика", "select", {
        options: ["Новости", "Гайд", "Кейс", "Мнение"],
        required: true,
      }),
      field("reading_minutes", "Время чтения, мин", "number", {
        placeholder: "5",
      }),
      field("cover_url", "Обложка", "url", {
        placeholder: "https://…",
      }),
      field("published_on", "Дата материала", "date"),
    ],
  },
  {
    id: "services",
    name: "Услуги",
    description: "Каталог услуг, консультаций и работ",
    icon: "LayoutGrid",
    fields: [
      field("price_from", "Цена от", "number", {
        placeholder: "15000",
        help: "В основной валюте компании",
      }),
      field("duration", "Срок", "text", {
        placeholder: "от 3 рабочих дней",
      }),
      field("format", "Формат", "select", {
        options: ["Онлайн", "Офлайн", "Гибрид"],
        required: true,
      }),
      field("includes", "Что входит", "textarea", {
        placeholder: "Каждый пункт с новой строки",
      }),
      field("booking_url", "Ссылка на запись", "url"),
    ],
  },
  {
    id: "products",
    name: "Товары",
    description: "Витрина товаров с ценой и остатками",
    icon: "ShoppingBag",
    fields: [
      field("sku", "Артикул", "text", { placeholder: "SKU-001" }),
      field("price", "Цена", "number", { required: true, placeholder: "2990" }),
      field("currency", "Валюта", "select", {
        options: ["RUB", "USD", "EUR"],
        required: true,
      }),
      field("stock", "На складе", "number", { placeholder: "0" }),
      field("image_url", "Фото товара", "url"),
      field("specs", "Характеристики", "textarea"),
    ],
  },
  {
    id: "real_estate",
    name: "Недвижимость",
    description: "Объекты продажи и аренды",
    icon: "Folder",
    fields: [
      field("address", "Адрес", "text", { required: true, placeholder: "Город, улица, дом" }),
      field("deal", "Тип сделки", "select", {
        options: ["Продажа", "Аренда"],
        required: true,
      }),
      field("price", "Цена", "number", { required: true }),
      field("area", "Площадь, м²", "number"),
      field("rooms", "Комнат", "number"),
      field("floor", "Этаж", "number"),
      field("listing_url", "Ссылка на объявление", "url"),
    ],
  },
  {
    id: "events",
    name: "Мероприятия",
    description: "Конференции, встречи и вебинары",
    icon: "LayoutGrid",
    fields: [
      field("starts_at", "Начало", "date", { required: true }),
      field("ends_at", "Окончание", "date"),
      field("venue", "Место", "text", { placeholder: "Адрес или ссылка на трансляцию" }),
      field("format", "Формат", "select", {
        options: ["Офлайн", "Онлайн", "Гибрид"],
        required: true,
      }),
      field("seats", "Количество мест", "number"),
      field("registration_url", "Регистрация", "url"),
      field("paid", "Платное участие", "checkbox"),
    ],
  },
  {
    id: "team",
    name: "Команда",
    description: "Сотрудники, роли и контакты",
    icon: "BookOpen",
    fields: [
      field("role", "Должность", "text", { required: true, placeholder: "Руководитель продукта" }),
      field("department", "Отдел", "select", {
        options: ["Продукт", "Разработка", "Дизайн", "Маркетинг", "Продажи", "Поддержка"],
        required: true,
      }),
      field("email", "Email", "email", { placeholder: "name@company.ru" }),
      field("bio", "О сотруднике", "textarea"),
      field("photo_url", "Фото", "url"),
      field("sort_order", "Порядок вывода", "number"),
    ],
  },
  {
    id: "docs",
    name: "Документы",
    description: "Регламенты, инструкции и договоры",
    icon: "FileText",
    fields: [
      field("doc_type", "Тип документа", "select", {
        options: ["Инструкция", "Политика", "Договор", "Отчёт"],
        required: true,
      }),
      field("version", "Версия", "text", { placeholder: "1.0" }),
      field("effective_date", "Действует с", "date"),
      field("file_url", "Файл", "url", { required: true }),
      field("confidential", "Конфиденциально", "checkbox"),
    ],
  },
  {
    id: "portfolio",
    name: "Портфолио",
    description: "Проекты, клиенты и результаты",
    icon: "LayoutGrid",
    fields: [
      field("client", "Клиент", "text", { required: true }),
      field("service", "Услуга", "select", {
        options: ["Сайт", "Приложение", "Брендинг", "Реклама", "Консалтинг"],
        required: true,
      }),
      field("year", "Год", "number", { placeholder: "2026" }),
      field("result", "Результат", "textarea", {
        placeholder: "Что изменилось у клиента",
      }),
      field("project_url", "Ссылка на проект", "url"),
      field("featured", "Показывать на главной", "checkbox"),
    ],
  },
];

export function getCollectionTemplate(id: string): CollectionTemplate | undefined {
  return COLLECTION_TEMPLATES.find((template) => template.id === id);
}

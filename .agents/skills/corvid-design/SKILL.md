# Corvid Design Skill

Фирменная «чернильная» дизайн-система линейки Corvid (CRM + CMS).

## Токены

- База тёмная: `ink-950 oklch(0.16 0.02 285)`, `ink-900 oklch(0.21 0.03 285)`
- Акцент: `#7c5cff` (hover `#6440f2`, light `#9d85ff`)
- Шрифты: Manrope (display/заголовки) + Inter (body)
- Радиусы: cards `rounded-2xl`, controls `rounded-xl/lg`
- Tailwind v4, CSS-first через `@theme` в `globals.css`, oklch-токены

## Паттерны

- Сайдбар 240px + контент max-w-6xl, палитра ⌘K с глобальным поиском
- Переключатель тем `next-themes`, `class`, default dark
- Канбан на dnd-kit: перенос = смена статуса
- Печать статей: скрывать `.no-print`, контент `.print-clean` без теней
- Графики на recharts, все mutation с инвалидацией TanStack Query

# Verso Design Skill

Редакционная дизайн-система Verso: швейцарская типографика, угольно-обсидиановая база, индустриальный оранжевый акцент.

## Токены

- База тёмная: `ink-950 oklch(0.14 0.005 260)`, `ink-900 oklch(0.19 0.01 260)`
- Акцент: `#f97316` (hover `#ea580c`, light `#fb923c`)
- Шрифты: Space Grotesk (display/заголовки, только латиница) + Inter (body, кириллица)
- Радиусы: cards `rounded-2xl`, controls `rounded-xl/lg`
- Tailwind v4, CSS-first через `@theme` в `globals.css`, oklch-токены

## Паттерны

- Сайдбар 240px + контент max-w-6xl, палитра ⌘K с глобальным поиском
- Переключатель тем `next-themes`, `class`, default dark
- Канбан на dnd-kit: перенос = смена статуса
- Печать статей: скрывать `.no-print`, контент `.print-clean` без теней
- Графики на recharts, все mutation с инвалидацией TanStack Query

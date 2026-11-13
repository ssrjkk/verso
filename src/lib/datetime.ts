/**
 * Конверсия между ISO-датой и значением `<input type="datetime-local">`.
 *
 * `datetime-local` не содержит offset: браузер трактует строку как локальное
 * время пользователя. На сервер всегда уходит ISO-8601 в UTC, поэтому
 * расписание не зависит от TZ сервера (раньше строка без offset парсилась
 * в часовом поясе процесса).
 */

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** ISO/Date → локальное значение для `datetime-local` (YYYY-MM-DDTHH:mm). */
export function toDateTimeLocalValue(value: string | Date | null | undefined): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return [
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  ].join("T");
}

/**
 * Значение `datetime-local` → ISO-8601 UTC. Пустая строка означает «снять
 * расписание» и даёт `null`. Некорректная дата — ошибка, а не тихая очистка:
 * иначе опечатка/битый ввод молча сбрасывал бы запланированную публикацию.
 */
export function dateTimeLocalToIso(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Некорректная дата");
  }
  return date.toISOString();
}

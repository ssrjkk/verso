import { unlink } from "node:fs/promises";
import path from "node:path";

/**
 * Физические файлы медиатеки живут только в `public/uploads`.
 * Путь нормализуется и сверяется с корнем: `/uploads/../../etc/passwd`
 * не должен удалить ничего за пределами каталога загрузок.
 */
export function managedUploadPath(url: string): string | null {
  const root = path.join(process.cwd(), "public", "uploads") + path.sep;
  const target = path.normalize(path.join(process.cwd(), "public", url));
  return target.startsWith(root) ? target : null;
}

/** Best-effort удаление: отсутствующий файл не должен ломать удаление строки. */
export async function removeManagedUpload(url: string): Promise<void> {
  const target = managedUploadPath(url);
  if (!target) return;
  await unlink(target).catch(() => undefined);
}

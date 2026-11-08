/**
 * Минимальный контракт БД, достаточный для политики ролей при регистрации.
 * Совместим с реальным PrismaClient (интеграционные тесты гоняют настоящую SQLite).
 */
export interface SignupRoleDb {
  $executeRawUnsafe(query: string, ...params: unknown[]): Promise<number>;
}

/**
 * Политика ролей для новой регистрации (вызывается из databaseHooks.user.create.after).
 *
 * - Если в системе ещё нет НИ ОДНОГО администратора, новый пользователь
 *   атомарно становится ADMIN (bootstrap пустой БД одним UPDATE ... WHERE NOT EXISTS).
 * - Иначе роль жёстко фиксируется на VIEWER — даже если клиент подсунул
 *   другое значение в теле signup-запроса (защита вглубь к input: false).
 *
 * Возвращает "promoted", если именно этот вызов назначил первого админа.
 */
export async function applySignupRolePolicy(
  db: SignupRoleDb,
  userId: string,
): Promise<"promoted" | "kept"> {
  const promoted = await db.$executeRawUnsafe(
    "UPDATE \"User\" SET role = 'ADMIN' WHERE id = ? AND NOT EXISTS (SELECT 1 FROM \"User\" WHERE role = 'ADMIN')",
    userId,
  );
  if (Number(promoted) === 1) return "promoted";
  await db.$executeRawUnsafe("UPDATE \"User\" SET role = 'VIEWER' WHERE id = ? AND role <> 'VIEWER'", userId);
  return "kept";
}

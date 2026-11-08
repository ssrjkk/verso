import "dotenv/config";
import { auth } from "../src/lib/auth";
import { prisma } from "../src/lib/prisma";

const USERS = [
  { name: "Test Admin", email: "test@corvid.dev", password: "password123", role: "ADMIN" },
  { name: "Editor", email: "editor@corvid.dev", password: "password123", role: "MANAGER" },
  { name: "Viewer", email: "viewer@corvid.dev", password: "password123", role: "VIEWER" },
];

const STAGES = [
  { id: "stage-draft", name: "Черновик", order: 0, color: "#8b8fa3", targetState: "DRAFT" },
  { id: "stage-review", name: "На ревью", order: 1, color: "#f5a524", targetState: "IN_REVIEW" },
  { id: "stage-published", name: "Опубликовано", order: 2, color: "#17c964", targetState: "PUBLISHED" },
  { id: "stage-archived", name: "Архив", order: 3, color: "#7c5cff", targetState: "ARCHIVED" },
];

const COLLECTIONS = [
  { name: "Страницы", slug: "pages", description: "Лендинги и страницы конструктора" },
  { name: "Статьи", slug: "posts", description: "Блог и новости" },
  { name: "Кейсы", slug: "cases", description: "Портфолио из проектов CRM" },
];

async function ensureUser(u: (typeof USERS)[number]) {
  try {
    await auth.api.signUpEmail({
      body: { name: u.name, email: u.email, password: u.password },
    });
    console.log(`created: ${u.email}`);
  } catch (e) {
    console.log(`exists (keep): ${u.email}`);
  }
  await prisma.user.update({
    where: { email: u.email },
    data: { name: u.name, role: u.role, emailVerified: true },
  });
}

async function main() {
  for (const u of USERS) {
    await ensureUser(u);
  }

  for (const s of STAGES) {
    await prisma.workflowStage.upsert({
      where: { id: s.id },
      create: s,
      update: { name: s.name, order: s.order, color: s.color, targetState: s.targetState },
    });
  }

  for (const c of COLLECTIONS) {
    await prisma.collection.upsert({
      where: { slug: c.slug },
      create: c,
      update: {},
    });
  }

  console.log("seed ok");
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });

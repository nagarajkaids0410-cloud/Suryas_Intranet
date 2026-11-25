/**
 * prisma/seed.ts
 * Seeds the initial admin and partner accounts.
 * Password for all accounts: Suryas@123
 *
 * Run with:  npm run db:seed
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const DEFAULT_PASSWORD = process.env.BOOTSTRAP_ADMIN_PASSWORD ?? 'Suryas@123';

async function main() {
  console.log('⏳ Seeding database...');

  // Ensure departments exist
  const execDept = await prisma.department.upsert({
    where: { name: 'Executive' },
    update: {},
    create: { name: 'Executive', description: 'Executive leadership' },
  });

  const opsDept = await prisma.department.upsert({
    where: { name: 'Operations' },
    update: {},
    create: { name: 'Operations', description: 'Operations & Business Development' },
  });

  const projectsDept = await prisma.department.upsert({
    where: { name: 'Projects' },
    update: {},
    create: { name: 'Projects', description: 'Projects & Administration' },
  });

  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);

  // Founder / System Admin
  const founder = await prisma.user.upsert({
    where: { employeeId: 'MIB01' },
    update: { passwordHash, status: 'ACTIVE' },
    create: {
      employeeId: 'MIB01',
      name: 'G K Bharath',
      email: 'bharath@suryas.in',
      phone: '+91-90000-00001',
      passwordHash,
      role: 'SYSTEM_ADMIN',
      departmentId: execDept.id,
      designation: 'Founder & Chief Executive Partner',
      status: 'ACTIVE',
    },
  });
  console.log(`✅ Upserted founder: ${founder.employeeId} (${founder.name})`);

  // Managing Partner – Operations
  const santhana = await prisma.user.upsert({
    where: { employeeId: 'MIB02' },
    update: { passwordHash, status: 'ACTIVE' },
    create: {
      employeeId: 'MIB02',
      name: 'Santhana Kumar V',
      email: 'santhana@suryas.in',
      phone: '+91-90000-00002',
      passwordHash,
      role: 'MANAGING_PARTNER',
      departmentId: opsDept.id,
      designation: 'Managing Partner – Operations & Business Development',
      status: 'ACTIVE',
    },
  });
  console.log(`✅ Upserted: ${santhana.employeeId} (${santhana.name})`);

  // Managing Partner – Projects
  const hareesh = await prisma.user.upsert({
    where: { employeeId: 'MIB03' },
    update: { passwordHash, status: 'ACTIVE' },
    create: {
      employeeId: 'MIB03',
      name: 'Hareesh V',
      email: 'hareesh@suryas.in',
      phone: '+91-90000-00003',
      passwordHash,
      role: 'MANAGING_PARTNER',
      departmentId: projectsDept.id,
      designation: 'Managing Partner – Projects & Administration',
      status: 'ACTIVE',
    },
  });
  console.log(`✅ Upserted: ${hareesh.employeeId} (${hareesh.name})`);

  console.log('\n🎉 Seed complete!');
  console.log('────────────────────────────────');
  console.log('  Employee ID │ Password');
  console.log('  ───────────┼─────────────');
  console.log(`  MIB01      │ ${DEFAULT_PASSWORD}`);
  console.log(`  MIB02      │ ${DEFAULT_PASSWORD}`);
  console.log(`  MIB03      │ ${DEFAULT_PASSWORD}`);
  console.log('────────────────────────────────');
}

main()
  .catch((error) => {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

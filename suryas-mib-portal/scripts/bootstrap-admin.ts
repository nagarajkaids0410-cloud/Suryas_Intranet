import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const pass = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  if (!pass) {
    console.warn('BOOTSTRAP_ADMIN_PASSWORD is not set. Skipping bootstrap.');
    return;
  }

  const department = await prisma.department.upsert({
    where: { name: 'Executive' },
    update: {},
    create: { name: 'Executive', description: 'Executive leadership' },
  });

  const existing = await prisma.user.findFirst({ where: { role: 'SYSTEM_ADMIN' } });
  if (existing) {
    console.log('Founder admin already exists.');
    return;
  }

  await prisma.user.create({
    data: {
      employeeId: 'MIB01',
      name: 'G K Bharath',
      email: 'bharath@suryas.in',
      phone: '+91-90000-00001',
      passwordHash: await bcrypt.hash(pass, 10),
      role: 'SYSTEM_ADMIN',
      departmentId: department.id,
      designation: 'Founder & Chief Executive Partner',
      status: 'ACTIVE',
    },
  });

  console.log('Founder created successfully.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

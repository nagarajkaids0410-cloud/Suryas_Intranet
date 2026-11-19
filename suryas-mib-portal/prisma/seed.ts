import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const founderPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  const operationsPartnerPassword = process.env.BOOTSTRAP_SANTHANA_PASSWORD;
  const projectsPartnerPassword = process.env.BOOTSTRAP_HAREESH_PASSWORD;
  if (!founderPassword || !operationsPartnerPassword || !projectsPartnerPassword) {
    throw new Error(
      'Set unique BOOTSTRAP_ADMIN_PASSWORD, BOOTSTRAP_SANTHANA_PASSWORD, and BOOTSTRAP_HAREESH_PASSWORD values before seeding accounts.'
    );
  }
  const founderHash = await bcrypt.hash(founderPassword, 10);

  const department = await prisma.department.upsert({
    where: { name: 'Operations' },
    update: {},
    create: { name: 'Operations', description: 'Core operations' },
  });

  await prisma.user.upsert({
    where: { employeeId: 'MIB01' },
    update: {},
    create: {
      employeeId: 'MIB01',
      name: 'G K Bharath',
      email: 'bharath@suryas.in',
      phone: '+91-90000-00001',
      passwordHash: founderHash,
      role: 'SYSTEM_ADMIN',
      departmentId: department.id,
      designation: 'Founder & Chief Executive Partner',
      status: 'ACTIVE',
    },
  });

  await prisma.user.upsert({
    where: { employeeId: 'MIB02' },
    update: {},
    create: {
      employeeId: 'MIB02',
      name: 'Santhana Kumar V',
      email: 'santhana@suryas.in',
      phone: '+91-90000-00002',
      passwordHash: await bcrypt.hash(operationsPartnerPassword, 10),
      role: 'MANAGING_PARTNER',
      departmentId: department.id,
      designation: 'Managing Partner – Operations & Business Development',
      status: 'ACTIVE',
    },
  });

  await prisma.user.upsert({
    where: { employeeId: 'MIB03' },
    update: {},
    create: {
      employeeId: 'MIB03',
      name: 'Hareesh V',
      email: 'hareesh@suryas.in',
      phone: '+91-90000-00003',
      passwordHash: await bcrypt.hash(projectsPartnerPassword, 10),
      role: 'MANAGING_PARTNER',
      departmentId: department.id,
      designation: 'Managing Partner – Projects & Administration',
      status: 'ACTIVE',
    },
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

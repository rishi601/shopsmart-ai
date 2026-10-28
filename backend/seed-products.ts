import dotenv from 'dotenv';
dotenv.config({ path: '.env' });

import { PrismaClient } from '@prisma/client';
import { randomBytes, scryptSync } from 'node:crypto';

const prisma = new PrismaClient({
  datasourceUrl: process.env.DATABASE_URL,
});

async function main() {
  const products = [
    {
      name: 'Wireless Headphones',
      category: 'Electronics',
      price: 1499,
      stock: 20,
      description: 'Wireless headphones for everyday listening',
    },
    {
      name: 'Smart Watch',
      category: 'Electronics',
      price: 2499,
      stock: 15,
      description: 'Smart watch for fitness and daily activities',
    },
    {
      name: 'Running Shoes',
      category: 'Fashion',
      price: 1999,
      stock: 12,
      description: 'Comfortable shoes for running and exercise',
    },
  ];

  for (const product of products) {
    const categorySlug = product.category.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const category = await prisma.category.upsert({
      where: { name: product.category },
      update: {},
      create: { name: product.category, slug: categorySlug },
    });
    await prisma.product.upsert({
      where: { name: product.name },
      update: { ...product, categoryId: category.id, active: true },
      create: { ...product, categoryId: category.id },
    });
  }

  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (adminEmail && adminPassword) {
    const salt = randomBytes(16).toString('hex');
    const passwordHash = `${salt}:${scryptSync(adminPassword, salt, 64).toString('hex')}`;
    await prisma.user.upsert({
      where: { email: adminEmail },
      update: {},
      create: {
        email: adminEmail,
        name: process.env.ADMIN_NAME?.trim() || 'ShopSmart Admin',
        passwordHash,
        role: 'ADMIN',
        cart: { create: {} },
        wishlist: { create: {} },
      },
    });
  }

  console.log('Sample products added successfully!');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

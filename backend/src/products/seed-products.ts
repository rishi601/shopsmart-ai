
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

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
    const slug = product.category.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const category = await prisma.category.upsert({ where: { name: product.category }, create: { name: product.category, slug }, update: {} });
    await prisma.product.upsert({
      where: { name: product.name },
      update: { ...product, categoryId: category.id, active: true },
      create: { ...product, categoryId: category.id },
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

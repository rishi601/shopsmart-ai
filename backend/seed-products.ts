
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });

import { PrismaClient } from '@prisma/client';
import { randomBytes, scryptSync } from 'node:crypto';

const prisma = new PrismaClient({
  datasourceUrl: process.env.DATABASE_URL,
});

// Illustrative product photographs from Unsplash.
// These are not verified official brand product photographs.
const imagePools: Record<string, string[]> = {
  Electronics: [
    'photo-1505740420928-5e560c06d30e',
    'photo-1523275335684-37898b6baf30',
    'photo-1511707171634-5f897ff02aa9',
    'photo-1517336714731-489689fd1ca8',
    'photo-1526170375885-4d8ecf77b99f',
    'photo-1592899677977-9c10ca588bbd',
    'photo-1546868871-7041f2a55e12',
  ],
  Fashion: [
    'photo-1542291026-7eec264c27ff',
    'photo-1521572163474-6864f9cf17ab',
    'photo-1551028719-00167b16eac5',
    'photo-1548036328-c9fa89d128fa',
    'photo-1515886657613-9f3515b0c78f',
    'photo-1529139574466-a303027c1d8b',
  ],
  'Fitness & Sports': [
    'photo-1517836357463-d25dfeac3438',
    'photo-1534438327276-14e5300c3a48',
    'photo-1571019613454-1cb2f99b2d8b',
    'photo-1583454110551-21f2fa2afe61',
    'photo-1544367567-0f2fcb009e0b',
  ],
  'Home & Kitchen': [
    'photo-1556911220-e15b29be8c8f',
    'photo-1555041469-a586c61ea9bc',
    'photo-1505693416388-ac5ce068fe85',
    'photo-1586023492125-27b2c045efd7',
    'photo-1493663284031-b7e3aefcae8e',
  ],
  'Beauty & Personal Care': [
    'photo-1608248543803-ba4f8c70ae0b',
    'photo-1596462502278-27bfdc403348',
    'photo-1556229010-6c3f2c9ca5f8',
    'photo-1601049541289-9b1b7bbbfe19',
  ],
  Accessories: [
    'photo-1526170375885-4d8ecf77b99f',
    'photo-1509631179647-0177331693ae',
    'photo-1549298916-b41d501d3772',
    'photo-1523381210434-271e8be1f52b',
  ],
};

function imageUrl(id: string): string {
  return `https://images.unsplash.com/${id}?auto=format&fit=crop&w=800&q=85`;
}

const products = [
  // ELECTRONICS - 12
  { name: 'Wireless Headphones', category: 'Electronics', brand: 'Sony', price: 4999, stock: 25, description: 'Premium wireless headphones for music, calls and everyday listening.' },
  { name: 'Smart Watch', category: 'Electronics', brand: 'Samsung', price: 3499, stock: 20, description: 'Smartwatch with fitness tracking and everyday activity monitoring.' },
  { name: 'Smartphone Pro', category: 'Electronics', brand: 'Apple', price: 79999, stock: 10, description: 'Premium smartphone with advanced camera and powerful performance.' },
  { name: 'Galaxy Smartphone', category: 'Electronics', brand: 'Samsung', price: 54999, stock: 15, description: 'Modern smartphone with an immersive display and excellent camera.' },
  { name: 'OnePlus Smartphone', category: 'Electronics', brand: 'OnePlus', price: 42999, stock: 12, description: 'Fast smartphone with a high refresh rate display.' },
  { name: 'MacBook Air', category: 'Electronics', brand: 'Apple', price: 99999, stock: 8, description: 'Lightweight laptop for productivity, creativity and everyday work.' },
  { name: 'HP Pavilion Laptop', category: 'Electronics', brand: 'HP', price: 62999, stock: 10, description: 'Versatile laptop for work, study and entertainment.' },
  { name: 'Bluetooth Headphones', category: 'Electronics', brand: 'JBL', price: 2999, stock: 30, description: 'Comfortable Bluetooth headphones with immersive sound.' },
  { name: 'Fitness Smart Band', category: 'Electronics', brand: 'boAt', price: 1999, stock: 25, description: 'Smart fitness band for tracking daily activity.' },
  { name: 'Digital Camera', category: 'Electronics', brand: 'Canon', price: 45999, stock: 6, description: 'Digital camera for photography and video creation.' },
  { name: 'Wireless Mouse', category: 'Electronics', brand: 'Logitech', price: 2499, stock: 35, description: 'Ergonomic wireless mouse for office and home use.' },
  { name: 'Portable Bluetooth Speaker', category: 'Electronics', brand: 'boAt', price: 1799, stock: 22, description: 'Portable speaker for music at home and outdoors.' },

  // FASHION - 10
  { name: 'Running Shoes', category: 'Fashion', brand: 'Nike', price: 3999, stock: 20, description: 'Comfortable running shoes for everyday training.' },
  { name: 'Men Cotton T-Shirt', category: 'Fashion', brand: 'Puma', price: 899, stock: 40, description: 'Comfortable cotton T-shirt for casual everyday wear.' },
  { name: 'Women Casual Kurta', category: 'Fashion', brand: 'Biba', price: 1499, stock: 25, description: 'Stylish casual kurta suitable for everyday occasions.' },
  { name: 'Denim Jacket', category: 'Fashion', brand: 'Levis', price: 2999, stock: 15, description: 'Classic denim jacket with a versatile casual style.' },
  { name: 'Women Sneakers', category: 'Fashion', brand: 'Adidas', price: 2799, stock: 18, description: 'Everyday sneakers combining comfort and modern style.' },
  { name: 'Slim Fit Jeans', category: 'Fashion', brand: 'Levis', price: 2199, stock: 20, description: 'Classic slim fit denim jeans for everyday outfits.' },
  { name: 'Women Summer Dress', category: 'Fashion', brand: 'Zara', price: 2499, stock: 12, description: 'Lightweight summer dress for casual outings.' },
  { name: 'Casual Hoodie', category: 'Fashion', brand: 'H&M', price: 1799, stock: 25, description: 'Soft casual hoodie for comfortable everyday styling.' },
  { name: 'Casual Sandals', category: 'Fashion', brand: 'Bata', price: 999, stock: 30, description: 'Comfortable sandals for daily use.' },
  { name: 'Women Handbag', category: 'Fashion', brand: 'Lavie', price: 1899, stock: 16, description: 'Stylish handbag for daily essentials and outings.' },

  // FITNESS & SPORTS - 8
  { name: 'Non Slip Yoga Mat', category: 'Fitness & Sports', brand: 'Boldfit', price: 799, stock: 30, description: 'Non-slip exercise mat for yoga and home workouts.' },
  { name: 'Adjustable Dumbbell Set', category: 'Fitness & Sports', brand: 'Amazon Basics', price: 2499, stock: 12, description: 'Adjustable dumbbell set for strength training.' },
  { name: 'Resistance Bands Set', category: 'Fitness & Sports', brand: 'Boldfit', price: 499, stock: 40, description: 'Resistance bands for stretching and strength workouts.' },
  { name: 'Home Treadmill', category: 'Fitness & Sports', brand: 'PowerMax', price: 22999, stock: 5, description: 'Home treadmill for walking and running workouts.' },
  { name: 'Sports Water Bottle', category: 'Fitness & Sports', brand: 'Milton', price: 599, stock: 35, description: 'Reusable water bottle for workouts and outdoor activities.' },
  { name: 'Skipping Rope', category: 'Fitness & Sports', brand: 'Strauss', price: 299, stock: 50, description: 'Lightweight skipping rope for cardio training.' },
  { name: 'Gym Training Gloves', category: 'Fitness & Sports', brand: 'Nivia', price: 449, stock: 25, description: 'Training gloves for better grip during workouts.' },
  { name: 'Foam Roller', category: 'Fitness & Sports', brand: 'Boldfit', price: 899, stock: 18, description: 'Foam roller for stretching and muscle recovery routines.' },

  // HOME & KITCHEN - 8
  { name: 'Digital Air Fryer', category: 'Home & Kitchen', brand: 'Philips', price: 6999, stock: 10, description: 'Air fryer for convenient everyday cooking.' },
  { name: 'Mixer Grinder', category: 'Home & Kitchen', brand: 'Prestige', price: 3299, stock: 15, description: 'Kitchen mixer grinder for blending and food preparation.' },
  { name: 'Electric Kettle', category: 'Home & Kitchen', brand: 'Havells', price: 1299, stock: 25, description: 'Electric kettle for quick water heating.' },
  { name: 'Premium Bedsheet Set', category: 'Home & Kitchen', brand: 'Spaces', price: 1599, stock: 20, description: 'Soft bedsheet set for a comfortable bedroom.' },
  { name: 'LED Desk Lamp', category: 'Home & Kitchen', brand: 'Wipro', price: 899, stock: 30, description: 'LED desk lamp for reading and working.' },
  { name: 'Kitchen Storage Rack', category: 'Home & Kitchen', brand: 'Cello', price: 1199, stock: 15, description: 'Practical storage rack for kitchen organization.' },
  { name: 'Non Stick Cookware Set', category: 'Home & Kitchen', brand: 'Wonderchef', price: 2499, stock: 12, description: 'Cookware set for everyday kitchen use.' },
  { name: 'Memory Foam Pillow', category: 'Home & Kitchen', brand: 'Wakefit', price: 999, stock: 20, description: 'Supportive memory foam pillow for comfortable sleep.' },

  // BEAUTY & PERSONAL CARE - 6
  { name: 'Gentle Face Wash', category: 'Beauty & Personal Care', brand: 'Cetaphil', price: 399, stock: 35, description: 'Gentle facial cleanser for everyday skincare routines.' },
  { name: 'Daily Moisturizer', category: 'Beauty & Personal Care', brand: 'Nivea', price: 299, stock: 40, description: 'Daily moisturizing cream for skin hydration.' },
  { name: 'Sunscreen SPF 50', category: 'Beauty & Personal Care', brand: 'Minimalist', price: 499, stock: 30, description: 'Daily sunscreen for sun protection.' },
  { name: 'Vitamin C Face Serum', category: 'Beauty & Personal Care', brand: 'Mamaearth', price: 599, stock: 25, description: 'Face serum for a regular skincare routine.' },
  { name: 'Matte Lipstick', category: 'Beauty & Personal Care', brand: 'Maybelline', price: 499, stock: 20, description: 'Matte lipstick for everyday makeup.' },
  { name: 'Hair Dryer', category: 'Beauty & Personal Care', brand: 'Philips', price: 1799, stock: 12, description: 'Hair dryer for convenient everyday hair styling.' },

  // ACCESSORIES - 6
  { name: 'Leather Wallet', category: 'Accessories', brand: 'WildHorn', price: 899, stock: 25, description: 'Compact wallet with practical everyday storage.' },
  { name: 'UV Protection Sunglasses', category: 'Accessories', brand: 'Fastrack', price: 1299, stock: 20, description: 'Stylish sunglasses for everyday outdoor use.' },
  { name: 'Classic Analog Watch', category: 'Accessories', brand: 'Titan', price: 2499, stock: 15, description: 'Classic analog wristwatch with a timeless design.' },
  { name: 'Travel Backpack', category: 'Accessories', brand: 'Skybags', price: 1599, stock: 18, description: 'Spacious backpack for travel and daily commuting.' },
  { name: 'Fast Charging Power Bank', category: 'Accessories', brand: 'Ambrane', price: 1499, stock: 22, description: 'Portable power bank for charging devices on the go.' },
  { name: 'Insulated Water Bottle', category: 'Accessories', brand: 'Milton', price: 799, stock: 30, description: 'Reusable insulated bottle for everyday hydration.' },
];

async function main() {
  console.log(`Starting catalogue update: ${products.length} products`);

  const categoryCounts = new Map<string, number>();

  for (const product of products) {
    const categorySlug = product.category
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    const category = await prisma.category.upsert({
      where: { name: product.category },
      update: {},
      create: {
        name: product.category,
        slug: categorySlug,
      },
    });

    const brand = await prisma.brand.upsert({
      where: { name: product.brand },
      update: {},
      create: { name: product.brand },
    });

    const productImageIndex = categoryCounts.get(product.category) ?? 0;
    categoryCounts.set(product.category, productImageIndex + 1);

    const pool = imagePools[product.category];

    const gallery = [
      pool[productImageIndex % pool.length],
      pool[(productImageIndex + 1) % pool.length],
    ].map(imageUrl);

    // Check whether this product already exists.
    const existingProduct = await prisma.product.findUnique({
      where: { name: product.name },
      select: { image: true },
    });

    const savedProduct = await prisma.product.upsert({
      where: { name: product.name },

      // Preserve existing prices, stock and descriptions.
      update: {
        category: product.category,
        categoryId: category.id,
        brandId: brand.id,
        image: existingProduct?.image ?? gallery[0],
        active: true,
      },

      create: {
        name: product.name,
        category: product.category,
        categoryId: category.id,
        brandId: brand.id,
        price: product.price,
        stock: product.stock,
        description: product.description,
        image: gallery[0],
      },
    });

    // Add gallery images without deleting existing images.
    for (let position = 0; position < gallery.length; position++) {
      const url = gallery[position];

      const existingImage = await prisma.productImage.findFirst({
        where: {
          productId: savedProduct.id,
          url,
        },
      });

      if (!existingImage) {
        await prisma.productImage.create({
          data: {
            productId: savedProduct.id,
            url,
            altText: `${product.name} product photo`,
            position,
          },
        });
      }
    }

    console.log(`Added/updated: ${product.name}`);
  }

  // Preserve existing admin account creation.
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (adminEmail && adminPassword) {
    const salt = randomBytes(16).toString('hex');

    const passwordHash =
      `${salt}:${scryptSync(adminPassword, salt, 64).toString('hex')}`;

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

  console.log('----------------------------------');
  console.log('ShopSmart AI catalogue updated!');
  console.log(`Products processed: ${products.length}`);
  console.log('Categories: 6');
  console.log('Product gallery images: up to 100');
  console.log('----------------------------------');
}

main()
  .catch((error) => {
    console.error('Catalogue update failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

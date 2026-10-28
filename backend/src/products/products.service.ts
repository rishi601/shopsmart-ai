
import { Injectable, NotFoundException } from '@nestjs/common';
import type { Product } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { RedisCacheService } from '../cache/redis-cache.service.js';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService, private readonly cache: RedisCacheService) {}

  async findAll() {
    const cached = await this.cache.get<Product[]>('products:all:v1');
    if (cached) return cached;
    const products = await this.prisma.product.findMany({
      where: { active: true },
      orderBy: { id: 'asc' },
    });
    const normalized = products.map((product) => ({ ...product, price: Number(product.price) }));
    await this.cache.set('products:all:v1', normalized);
    return normalized;
  }

  async findCatalog(input: {
    query?: string;
    category?: string;
    sort?: 'name' | 'price' | 'createdAt';
    order?: 'asc' | 'desc';
    page: number;
    limit: number;
  }) {
    const cacheKey = `products:catalog:v1:${JSON.stringify(input)}`;
    const cached = await this.cache.get<unknown>(cacheKey);
    if (cached) return cached;
    const where = {
      active: true,
      ...(input.query
        ? { name: { contains: input.query, mode: 'insensitive' as const } }
        : {}),
      ...(input.category && input.category !== 'All'
        ? { category: { equals: input.category, mode: 'insensitive' as const } }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        orderBy: input.sort === 'name'
          ? { name: input.order ?? 'asc' }
          : input.sort === 'price'
            ? { price: input.order ?? 'asc' }
            : input.sort === 'createdAt'
              ? { createdAt: input.order ?? 'asc' }
              : { id: input.order ?? 'asc' },
        skip: (input.page - 1) * input.limit,
        take: input.limit,
      }),
      this.prisma.product.count({ where }),
    ]);
    const response = {
      items,
      pagination: {
        page: input.page,
        limit: input.limit,
        total,
        pages: Math.ceil(total / input.limit),
      },
    };
    const normalized = { ...response, items: response.items.map((product) => ({ ...product, price: Number(product.price) })) };
    await this.cache.set(cacheKey, normalized, 30);
    return normalized;
  }

  async findOne(id: number) {
    const product = await this.prisma.product.findFirst({ where: { id, active: true }, include: { images: { orderBy: { position: 'asc' } }, variants: true, brand: true, categoryRef: true } });
    if (!product) throw new NotFoundException('Product not found.');
    return { ...product, price: Number(product.price), variants: product.variants.map((variant) => ({ ...variant, price: variant.price === null ? null : Number(variant.price) })) };
  }

  async trending() {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const events = await this.prisma.behaviorEvent.findMany({ where: { createdAt: { gte: since }, productId: { not: null } }, select: { productId: true, type: true }, take: 10000 });
    const scores = new Map<number, number>();
    for (const event of events) {
      if (event.productId === null) continue;
      const weight = event.type === 'PURCHASE' ? 5 : event.type === 'CART_ADD' ? 3 : event.type === 'WISHLIST_ADD' ? 2 : 1;
      scores.set(event.productId, (scores.get(event.productId) ?? 0) + weight);
    }
    const products = await this.prisma.product.findMany({ where: { active: true, stock: { gt: 0 } } });
    return products
      .sort((a, b) => (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0) || b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 8)
      .map((product) => ({ ...product, price: Number(product.price), reason: scores.has(product.id) ? 'Popular with shoppers this month' : 'A fresh pick from the catalog' }));
  }

  async frequentlyBoughtTogether(id: number) {
    const matchingOrders = await this.prisma.orderItem.findMany({ where: { productId: id, order: { status: { notIn: ['CANCELLED', 'REFUNDED'] } } }, select: { orderId: true }, take: 5000 });
    if (!matchingOrders.length) return [];
    const grouped = await this.prisma.orderItem.groupBy({ by: ['productId'], where: { orderId: { in: matchingOrders.map((order) => order.orderId) }, productId: { not: id }, product: { active: true, stock: { gt: 0 } } }, _count: { productId: true }, orderBy: { _count: { productId: 'desc' } }, take: 8 });
    const products = await this.prisma.product.findMany({ where: { id: { in: grouped.map((row) => row.productId) }, active: true, stock: { gt: 0 } } });
    const byId = new Map(products.map((product) => [product.id, product]));
    return grouped.flatMap((row) => {
      const product = byId.get(row.productId);
      return product ? [{ ...product, price: Number(product.price), reason: `Bought together in ${row._count.productId} orders` }] : [];
    });
  }

  async similar(id: number) {
    const product = await this.prisma.product.findFirst({ where: { id, active: true } });
    if (!product) return [];
    const similar = await this.prisma.product.findMany({ where: { id: { not: id }, active: true, stock: { gt: 0 }, OR: [{ categoryId: product.categoryId ?? -1 }, { category: { equals: product.category, mode: 'insensitive' } }] }, orderBy: { id: 'asc' }, take: 8 });
    return similar.map((item) => ({ ...item, price: Number(item.price), reason: `Similar to ${product.name} in ${product.category}` }));
  }

  async categories() {
    const categories = await this.prisma.product.findMany({ where: { active: true }, distinct: ['category'], select: { category: true }, orderBy: { category: 'asc' } });
    return categories.map(({ category }) => category);
  }

  async recommend(interest: string) {
    const products = await this.prisma.product.findMany({
      where: { active: true, stock: { gt: 0 } },
      orderBy: { id: 'asc' },
    });
    const scored = products.map((product) => {
      const text = `${product.name} ${product.category} ${product.description ?? ''}`.toLowerCase();
      const has = (terms: string[]) => terms.some((term) => text.includes(term));
      const score = interest === 'gadgets'
        ? (product.category.toLowerCase() === 'electronics' ? 3 : 0) + (has(['headphone', 'watch', 'gadget', 'technology']) ? 2 : 0)
        : interest === 'fitness'
          ? (has(['watch', 'running', 'fitness', 'sports', 'gym', 'exercise']) ? 3 : 0)
          : (product.category.toLowerCase() === 'fashion' ? 3 : 0) + (has(['shoe', 'clothing', 'fashion', 'style']) ? 2 : 0);
      return { product, score };
    });
    const matches = scored.filter(({ score }) => score > 0);
    const coldStart = matches.length === 0;
    const ranked = (coldStart ? scored : matches)
      .sort((a, b) => b.score - a.score || a.product.id - b.product.id)
      .slice(0, 8);
    return {
      interest,
      strategy: coldStart ? 'catalog-fallback' : 'content-based',
      items: ranked.map(({ product, score }) => ({
        ...product,
        price: Number(product.price),
        score,
        reason: coldStart ? 'Available in the catalog' : 'Matches your selected interests and product details',
      })),
    };
  }
}

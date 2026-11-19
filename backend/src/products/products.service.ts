
import { Injectable, NotFoundException } from '@nestjs/common';
import type { Product } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { RedisCacheService } from '../cache/redis-cache.service.js';

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: RedisCacheService,
  ) {}

  private withLocalImage<T extends { name: string }>(product: T) {
    const filename = product.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    return {
      ...product,
      image: `/products/${filename}.jpg`,
    };
  }

  async findAll() {
    const cached = await this.cache.get<Product[]>('products:all:v2');
    if (cached) {
      return cached;
    }

    const products = await this.prisma.product.findMany({
      where: { active: true },
      orderBy: { id: 'asc' },
    });

    const normalized = products.map((product) => ({
      ...this.withLocalImage(product),
      price: Number(product.price),
    }));

    await this.cache.set('products:all:v2', normalized);
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
    const cacheKey = `products:catalog:v2:${JSON.stringify(input)}`;

    const cached = await this.cache.get<{
      items: { price: number; image?: string | null }[];
      pagination: {
        page: number;
        limit: number;
        total: number;
        pages: number;
      };
    }>(cacheKey);

    if (cached) {
      return cached;
    }

    const where = {
      active: true,
      ...(input.query
        ? {
            name: {
              contains: input.query,
              mode: 'insensitive' as const,
            },
          }
        : {}),
      ...(input.category && input.category !== 'All'
        ? {
            category: {
              equals: input.category,
              mode: 'insensitive' as const,
            },
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        orderBy:
          input.sort === 'name'
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

    const normalized = {
      items: items.map((product) => ({
        ...this.withLocalImage(product),
        price: Number(product.price),
      })),
      pagination: {
        page: input.page,
        limit: input.limit,
        total,
        pages: Math.ceil(total / input.limit),
      },
    };

    await this.cache.set(cacheKey, normalized, 30);

    return normalized;
  }

  async findOne(id: number) {
    const product = await this.prisma.product.findFirst({
      where: { id, active: true },
      include: {
        images: { orderBy: { position: 'asc' } },
        variants: true,
        brand: true,
        categoryRef: true,
      },
    });

    if (!product) {
      throw new NotFoundException('Product not found.');
    }

    return {
      ...this.withLocalImage(product),
      price: Number(product.price),
      variants: product.variants.map((variant) => ({
        ...variant,
        price:
          variant.price === null ? null : Number(variant.price),
      })),
    };
  }

  async trending() {
    const since = new Date(
      Date.now() - 30 * 24 * 60 * 60 * 1000,
    );

    const events = await this.prisma.behaviorEvent.findMany({
      where: {
        createdAt: { gte: since },
        productId: { not: null },
      },
      select: { productId: true, type: true },
      take: 10000,
    });

    const scores = new Map<number, number>();

    for (const event of events) {
      const productId = event.productId;

      if (productId === null) {
        continue;
      }

      const weight =
        event.type === 'PURCHASE'
          ? 5
          : event.type === 'CART_ADD'
            ? 3
            : event.type === 'WISHLIST_ADD'
              ? 2
              : 1;

      scores.set(
        productId,
        (scores.get(productId) ?? 0) + weight,
      );
    }

    const products = await this.prisma.product.findMany({
      where: {
        active: true,
        stock: { gt: 0 },
      },
    });

    return products
      .sort(
        (a, b) =>
          (scores.get(b.id) ?? 0) -
            (scores.get(a.id) ?? 0) ||
          b.createdAt.getTime() - a.createdAt.getTime(),
      )
      .slice(0, 8)
      .map((product) => ({
        ...this.withLocalImage(product),
        price: Number(product.price),
        reason: scores.has(product.id)
          ? 'Popular with shoppers this month'
          : 'A fresh pick from the catalog',
      }));
  }

  async frequentlyBoughtTogether(id: number) {
    const matchingOrders = await this.prisma.orderItem.findMany({
      where: {
        productId: id,
        order: {
          status: {
            notIn: ['CANCELLED', 'REFUNDED'],
          },
        },
      },
      select: { orderId: true },
      take: 5000,
    });

    if (!matchingOrders.length) {
      return [];
    }

    const grouped = await this.prisma.orderItem.groupBy({
      by: ['productId'],
      where: {
        orderId: {
          in: matchingOrders.map((order) => order.orderId),
        },
        productId: { not: id },
        product: {
          active: true,
          stock: { gt: 0 },
        },
      },
      _count: { productId: true },
      orderBy: {
        _count: { productId: 'desc' },
      },
      take: 8,
    });

    const products = await this.prisma.product.findMany({
      where: {
        id: {
          in: grouped.map((row) => row.productId),
        },
        active: true,
        stock: { gt: 0 },
      },
    });

    const byId = new Map(
      products.map((product) => [product.id, product]),
    );

    return grouped.flatMap((row) => {
      const product = byId.get(row.productId);

      if (!product) {
        return [];
      }

      return [
        {
          ...this.withLocalImage(product),
          price: Number(product.price),
          reason: `Bought together in ${row._count.productId} orders`,
        },
      ];
    });
  }

  async similar(id: number) {
    const product = await this.prisma.product.findFirst({
      where: { id, active: true },
    });

    if (!product) {
      return [];
    }

    const similar = await this.prisma.product.findMany({
      where: {
        id: { not: id },
        active: true,
        stock: { gt: 0 },
        OR: [
          { categoryId: product.categoryId ?? -1 },
          {
            category: {
              equals: product.category,
              mode: 'insensitive',
            },
          },
        ],
      },
      orderBy: { id: 'asc' },
      take: 8,
    });

    return similar.map((item) => ({
      ...this.withLocalImage(item),
      price: Number(item.price),
      reason: `Similar to ${product.name} in ${product.category}`,
    }));
  }

  async categories() {
    const categories = await this.prisma.product.findMany({
      where: { active: true },
      distinct: ['category'],
      select: { category: true },
      orderBy: { category: 'asc' },
    });

    return categories.map(({ category }) => category);
  }

  async recommend(interest: string) {
    const products = await this.prisma.product.findMany({
      where: {
        active: true,
        stock: { gt: 0 },
      },
      orderBy: { id: 'asc' },
    });

    const rules: Record<
      string,
      { categories: string[]; keywords: string[] }
    > = {
      gadgets: {
        categories: ['electronics'],
        keywords: [
          'headphone', 'smartphone', 'phone', 'laptop',
          'camera', 'speaker', 'mouse', 'technology',
        ],
      },
      'gadgets & tech': {
        categories: ['electronics'],
        keywords: [
          'headphone', 'smartphone', 'phone', 'laptop',
          'camera', 'speaker', 'mouse', 'technology',
        ],
      },
      fitness: {
        categories: ['fitness & sports'],
        keywords: [
          'fitness', 'gym', 'yoga', 'exercise', 'sports',
          'dumbbell', 'resistance', 'treadmill', 'workout',
          'skipping', 'foam roller',
        ],
      },
      'fitness & sports': {
        categories: ['fitness & sports'],
        keywords: [
          'fitness', 'gym', 'yoga', 'exercise', 'sports',
          'dumbbell', 'resistance', 'treadmill', 'workout',
          'skipping', 'foam roller',
        ],
      },
      fashion: {
        categories: ['fashion'],
        keywords: [
          'shoe', 'sneaker', 'shirt', 'kurta', 'jacket',
          'jeans', 'dress', 'hoodie', 'sandals', 'handbag',
        ],
      },
      'home & kitchen': {
        categories: ['home & kitchen'],
        keywords: [
          'kitchen', 'air fryer', 'mixer', 'kettle',
          'bedsheet', 'lamp', 'storage', 'cookware', 'pillow',
        ],
      },
      home: {
        categories: ['home & kitchen'],
        keywords: [
          'kitchen', 'air fryer', 'mixer', 'kettle',
          'bedsheet', 'lamp', 'storage', 'cookware', 'pillow',
        ],
      },
      beauty: {
        categories: ['beauty & personal care'],
        keywords: [
          'face wash', 'moisturizer', 'sunscreen',
          'serum', 'lipstick', 'hair dryer',
        ],
      },
      'beauty & personal care': {
        categories: ['beauty & personal care'],
        keywords: [
          'face wash', 'moisturizer', 'sunscreen',
          'serum', 'lipstick', 'hair dryer',
        ],
      },
      accessories: {
        categories: ['accessories'],
        keywords: [
          'wallet', 'sunglasses', 'backpack',
          'power bank', 'water bottle', 'analog watch',
        ],
      },
    };

    const selectedInterest = interest.trim().toLowerCase();
    const rule = rules[selectedInterest];

    const scored = products.map((product) => {
      const category = product.category.toLowerCase();
      const text = `${product.name} ${product.description ?? ''}`.toLowerCase();

      let score = 0;

      if (rule) {
        if (rule.categories.includes(category)) {
          score += 10;
        }

        if (rule.keywords.some((keyword) => text.includes(keyword))) {
          score += 2;
        }
      }

      return { product, score };
    });

    const matches = scored.filter(({ score }) => score > 0);

    const ranked = (matches.length > 0 ? matches : scored)
      .sort(
        (a, b) =>
          b.score - a.score || a.product.id - b.product.id,
      )
      .slice(0, 8);

    return {
      interest,
      strategy:
        matches.length > 0 ? 'content-based' : 'catalog-fallback',
      items: ranked.map(({ product, score }) => ({
        ...this.withLocalImage(product),
        price: Number(product.price),
        score,
        reason:
          matches.length > 0
            ? `Recommended for ${interest}`
            : 'Available in the catalog',
      })),
    };
  }
}

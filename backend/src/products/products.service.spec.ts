import { Test, TestingModule } from '@nestjs/testing';
import { ProductsService } from './products.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RedisCacheService } from '../cache/redis-cache.service.js';

describe('ProductsService', () => {
  let service: ProductsService;
  const prisma = {
    product: { findMany: vi.fn(), count: vi.fn(), findFirst: vi.fn() },
    $transaction: vi.fn(),
  };
  const cache = { get: vi.fn(), set: vi.fn() };

  beforeEach(async () => {
    vi.clearAllMocks();
    cache.get.mockResolvedValue(undefined);
    cache.set.mockResolvedValue(undefined);
    prisma.product.findMany.mockResolvedValue([]);
    prisma.product.count.mockResolvedValue(0);
    prisma.$transaction.mockImplementation((queries: Promise<unknown>[]) => Promise.all(queries));
    const module: TestingModule = await Test.createTestingModule({
      providers: [ProductsService, { provide: PrismaService, useValue: prisma }, { provide: RedisCacheService, useValue: cache }],
    }).compile();

    service = module.get<ProductsService>(ProductsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('returns active products with numeric prices and caches the catalog', async () => {
    prisma.product.findMany.mockResolvedValue([{ id: 1, name: 'Headphones', category: 'Electronics', price: '25.00', stock: 2, active: true }]);
    const products = await service.findAll();
    expect(products[0].price).toBe(25);
    expect(prisma.product.findMany).toHaveBeenCalledWith({ where: { active: true }, orderBy: { id: 'asc' } });
    expect(cache.set).toHaveBeenCalledWith('products:all:v1', expect.any(Array));
  });

  it('returns paginated search results and the total count', async () => {
    prisma.product.findMany.mockResolvedValue([{ id: 2, name: 'Watch', category: 'Electronics', price: 50, stock: 3 }]);
    prisma.product.count.mockResolvedValue(13);
    const result = await service.findCatalog({ query: 'watch', category: 'Electronics', page: 2, limit: 10, sort: 'price', order: 'desc' });
    expect(result.pagination).toEqual({ page: 2, limit: 10, total: 13, pages: 2 });
    expect(result.items[0].price).toBe(50);
  });

  it('returns cold-start recommendations with reasons and stock filtering', async () => {
    prisma.product.findMany.mockResolvedValue([{ id: 3, name: 'Bottle', category: 'Outdoor', price: 9, stock: 5, description: null }]);
    const result = await service.recommend('gadgets');
    expect(result.strategy).toBe('catalog-fallback');
    expect(result.items[0].reason).toContain('catalog');
  });
});

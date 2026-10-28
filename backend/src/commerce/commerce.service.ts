import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { BehaviorType, Prisma, UserRole } from '@prisma/client';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class CommerceService {
  private readonly logger = new Logger(CommerceService.name);
  constructor(private readonly prisma: PrismaService) {}

  async profile(userId: string) {
    return this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, email: true, name: true, role: true, createdAt: true, addresses: true },
    });
  }

  async cart(userId: string) {
    const cart = await this.prisma.cart.upsert({ where: { userId }, create: { userId }, update: {} });
    const result = await this.prisma.cart.findUniqueOrThrow({
      where: { id: cart.id }, include: { items: { include: { product: true }, orderBy: { updatedAt: 'desc' } } },
    });
    return { ...result, subtotal: result.items.reduce((sum, item) => sum + Number(item.product.price) * item.quantity, 0) };
  }

  async addCartItem(userId: string, productId: number, quantity: number) {
    if (!Number.isInteger(productId) || productId < 1 || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
      throw new BadRequestException('A valid productId and quantity (1-99) are required.');
    }
    const product = await this.prisma.product.findFirst({ where: { id: productId, active: true } });
    if (!product) throw new NotFoundException('Product not found.');
    const cart = await this.prisma.cart.upsert({ where: { userId }, create: { userId }, update: {} });
    const existing = await this.prisma.cartItem.findUnique({ where: { cartId_productId: { cartId: cart.id, productId } } });
    const nextQuantity = (existing?.quantity ?? 0) + quantity;
    if (nextQuantity > product.stock) throw new BadRequestException('Requested quantity exceeds available stock.');
    await this.prisma.cartItem.upsert({
      where: { cartId_productId: { cartId: cart.id, productId } },
      create: { cartId: cart.id, productId, quantity },
      update: { quantity: nextQuantity },
    });
    await this.recordEvent(userId, productId, BehaviorType.CART_ADD);
    return this.cart(userId);
  }

  async updateCartItem(userId: string, productId: number, quantity: number) {
    if (!Number.isInteger(quantity) || quantity < 0 || quantity > 99) throw new BadRequestException('quantity must be between 0 and 99.');
    const cart = await this.prisma.cart.findUnique({ where: { userId } });
    if (!cart) throw new NotFoundException('Cart item not found.');
    if (quantity === 0) await this.prisma.cartItem.deleteMany({ where: { cartId: cart.id, productId } });
    else {
      const item = await this.prisma.cartItem.findUnique({ where: { cartId_productId: { cartId: cart.id, productId } }, include: { product: true } });
      if (!item) throw new NotFoundException('Cart item not found.');
      if (quantity > item.product.stock) throw new BadRequestException('Requested quantity exceeds available stock.');
      await this.prisma.cartItem.update({ where: { id: item.id }, data: { quantity } });
    }
    return this.cart(userId);
  }

  async wishlist(userId: string) {
    const list = await this.prisma.wishlist.upsert({ where: { userId }, create: { userId }, update: {} });
    return this.prisma.wishlist.findUniqueOrThrow({ where: { id: list.id }, include: { items: { include: { product: true } } } });
  }

  async addWishlist(userId: string, productId: number) {
    const [list, product] = await Promise.all([
      this.prisma.wishlist.upsert({ where: { userId }, create: { userId }, update: {} }),
      this.prisma.product.findFirst({ where: { id: productId, active: true } }),
    ]);
    if (!product) throw new NotFoundException('Product not found.');
    await this.prisma.wishlistItem.upsert({
      where: { wishlistId_productId: { wishlistId: list.id, productId } },
      create: { wishlistId: list.id, productId }, update: {},
    });
    await this.recordEvent(userId, productId, BehaviorType.WISHLIST_ADD);
    return this.wishlist(userId);
  }

  async removeWishlist(userId: string, productId: number) {
    const list = await this.prisma.wishlist.findUnique({ where: { userId } });
    if (list) await this.prisma.wishlistItem.deleteMany({ where: { wishlistId: list.id, productId } });
    return this.wishlist(userId);
  }

  async addresses(userId: string) { return this.prisma.address.findMany({ where: { userId }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }] }); }

  async addAddress(userId: string, body: Record<string, unknown>) {
    const required = ['recipient', 'line1', 'city', 'region', 'postalCode'];
    if (required.some((key) => typeof body[key] !== 'string' || !(body[key] as string).trim())) throw new BadRequestException('recipient, line1, city, region, and postalCode are required.');
    return this.prisma.$transaction(async (tx) => {
      const makeDefault = body.isDefault === true || !(await tx.address.count({ where: { userId } }));
      if (makeDefault) await tx.address.updateMany({ where: { userId }, data: { isDefault: false } });
      return tx.address.create({ data: {
        userId, recipient: String(body.recipient).trim(), line1: String(body.line1).trim(),
        city: String(body.city).trim(), region: String(body.region).trim(), postalCode: String(body.postalCode).trim(),
        line2: typeof body.line2 === 'string' ? body.line2 : undefined,
        label: typeof body.label === 'string' ? body.label : undefined,
        country: typeof body.country === 'string' ? body.country : 'IN',
        phone: typeof body.phone === 'string' ? body.phone : undefined,
        isDefault: makeDefault,
      } });
    });
  }

  async updateAddress(userId: string, id: string, body: Record<string, unknown>) {
    const current = await this.prisma.address.findFirst({ where: { id, userId } });
    if (!current) throw new NotFoundException('Address not found.');
    const textFields = ['recipient', 'line1', 'line2', 'city', 'region', 'postalCode', 'country', 'phone', 'label'] as const;
    const data: Record<string, unknown> = {};
    for (const field of textFields) {
      if (field in body) {
        if (field !== 'line2' && field !== 'phone' && field !== 'label' && (typeof body[field] !== 'string' || !String(body[field]).trim())) throw new BadRequestException(`${field} cannot be empty.`);
        data[field] = typeof body[field] === 'string' ? (body[field] as string).trim() : null;
      }
    }
    if (body.isDefault === true) {
      return this.prisma.$transaction(async (tx) => {
        await tx.address.updateMany({ where: { userId }, data: { isDefault: false } });
        return tx.address.update({ where: { id }, data: { ...data, isDefault: true } as Prisma.AddressUpdateInput });
      });
    }
    if (body.isDefault === false) data.isDefault = false;
    return this.prisma.address.update({ where: { id }, data: data as Prisma.AddressUpdateInput });
  }

  async deleteAddress(userId: string, id: string) {
    const address = await this.prisma.address.findFirst({ where: { id, userId } });
    if (!address) throw new NotFoundException('Address not found.');
    if (await this.prisma.order.count({ where: { addressId: id } })) throw new BadRequestException('This address is linked to an order and cannot be removed.');
    await this.prisma.address.delete({ where: { id } });
    if (address.isDefault) {
      const next = await this.prisma.address.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' } });
      if (next) await this.prisma.address.update({ where: { id: next.id }, data: { isDefault: true } });
    }
    return { success: true };
  }

  async checkout(userId: string, addressId: string, couponCode?: string) {
    if (!addressId) throw new BadRequestException('addressId is required.');
    return this.prisma.$transaction(async (tx) => {
      const address = await tx.address.findFirst({ where: { id: addressId, userId } });
      if (!address) throw new NotFoundException('Shipping address not found.');
      const cart = await tx.cart.findUnique({ where: { userId }, include: { items: { include: { product: true } } } });
      if (!cart || cart.items.length === 0) throw new BadRequestException('Your cart is empty.');
      let subtotal = new Prisma.Decimal(0);
      const orderItems: Prisma.OrderItemCreateWithoutOrderInput[] = [];
      for (const item of cart.items) {
        const changed = await tx.product.updateMany({ where: { id: item.productId, active: true, stock: { gte: item.quantity } }, data: { stock: { decrement: item.quantity } } });
        if (changed.count !== 1) throw new BadRequestException(`${item.product.name} no longer has enough stock.`);
        const unitPrice = new Prisma.Decimal(item.product.price);
        subtotal = subtotal.add(unitPrice.mul(item.quantity));
        orderItems.push({ product: { connect: { id: item.productId } }, name: item.product.name, unitPrice, quantity: item.quantity });
      }
      let coupon: { id: string; percentOff: number | null; amountOff: Prisma.Decimal | null } | null = null;
      let discount = new Prisma.Decimal(0);
      if (couponCode?.trim()) {
        coupon = await tx.coupon.findFirst({ where: { code: couponCode.trim().toUpperCase(), active: true, AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: new Date() } }] }, { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }] } });
        if (!coupon) throw new BadRequestException('Coupon is invalid or expired.');
        const fullCoupon = await tx.coupon.findUniqueOrThrow({ where: { id: coupon.id } });
        const [usageCount, ownUsage] = await Promise.all([
          tx.couponUsage.count({ where: { couponId: coupon.id } }),
          tx.couponUsage.count({ where: { couponId: coupon.id, userId } }),
        ]);
        if ((fullCoupon.maxUses !== null && usageCount >= fullCoupon.maxUses) || ownUsage > 0) throw new BadRequestException('This coupon has reached its usage limit.');
        if (fullCoupon.minimumSubtotal && subtotal.lessThan(fullCoupon.minimumSubtotal)) throw new BadRequestException('Your subtotal does not meet this coupon’s minimum.');
        discount = coupon.percentOff !== null
          ? subtotal.mul(coupon.percentOff).div(100).toDecimalPlaces(2)
          : coupon.amountOff ?? new Prisma.Decimal(0);
        if (discount.greaterThan(subtotal)) discount = subtotal;
      }
      const total = subtotal.sub(discount);
      const order = await tx.order.create({
        data: {
          userId, addressId, subtotal, discount, total, items: { create: orderItems },
          payment: { create: { provider: 'razorpay', amount: total, status: 'PENDING' } },
          ...(coupon ? { couponUsage: { create: { couponId: coupon.id, userId } } } : {}),
        },
        include: { items: true, payment: true, address: true },
      });
      await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
      for (const item of cart.items) {
        await tx.behaviorEvent.create({ data: { userId, productId: item.productId, type: BehaviorType.PURCHASE } });
        await tx.userProductInteraction.upsert({
          where: { userId_productId: { userId, productId: item.productId } },
          create: { userId, productId: item.productId, purchaseCount: item.quantity, score: item.quantity * 5 },
          update: { purchaseCount: { increment: item.quantity }, score: { increment: item.quantity * 5 } },
        });
      }
      return order;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async orders(userId: string, role: UserRole) {
    return this.prisma.order.findMany({
      where: role === 'ADMIN' ? {} : { userId },
      include: { items: true, payment: true, address: true, user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async order(userId: string, role: UserRole, id: string) {
    const order = await this.prisma.order.findUnique({ where: { id }, include: { items: true, payment: true, address: true, user: { select: { id: true, name: true, email: true } } } });
    if (!order) throw new NotFoundException('Order not found.');
    if (role !== 'ADMIN' && order.userId !== userId) throw new ForbiddenException();
    return order;
  }

  async setOrderStatus(id: string, status: string) {
    const allowed = ['CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED'];
    if (!allowed.includes(status)) throw new BadRequestException(`status must be one of: ${allowed.join(', ')}.`);
    const order = await this.prisma.order.findUnique({ where: { id }, include: { items: true } });
    if (!order) throw new NotFoundException('Order not found.');
    if (status === 'CANCELLED' && ['SHIPPED', 'DELIVERED', 'REFUNDED'].includes(order.status)) throw new BadRequestException('Shipped or completed orders cannot be cancelled from the admin panel.');
    return this.prisma.$transaction(async (tx) => {
      if (status === 'CANCELLED' && !['CANCELLED', 'REFUNDED'].includes(order.status)) {
        for (const item of order.items) await tx.product.update({ where: { id: item.productId }, data: { stock: { increment: item.quantity } } });
      }
      return tx.order.update({ where: { id }, data: { status: status as never }, include: { items: true, payment: true } });
    });
  }

  async review(userId: string, input: { productId: number; rating: number; title?: string; body?: string }) {
    if (!Number.isInteger(input.productId) || input.productId < 1 || !Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) throw new BadRequestException('A valid productId and rating from 1 to 5 are required.');
    const purchased = await this.prisma.orderItem.findFirst({ where: { productId: input.productId, order: { userId, status: 'DELIVERED' } } });
    if (!purchased) throw new ForbiddenException('Reviews are available after a delivered purchase.');
    return this.prisma.review.upsert({
      where: { userId_productId: { userId, productId: input.productId } },
      create: { userId, productId: input.productId, rating: input.rating, title: input.title, body: input.body },
      update: { rating: input.rating, title: input.title, body: input.body },
    });
  }

  async reviews(productId: number) {
    return this.prisma.review.findMany({ where: { productId, approved: true }, select: { id: true, rating: true, title: true, body: true, createdAt: true, user: { select: { name: true } } }, orderBy: { createdAt: 'desc' } });
  }

  async adminReviews(productId?: number) {
    return this.prisma.review.findMany({ where: productId ? { productId } : {}, include: { user: { select: { id: true, name: true, email: true } }, product: { select: { id: true, name: true } } }, orderBy: { createdAt: 'desc' } });
  }

  async adminProducts() {
    return this.prisma.product.findMany({ include: { categoryRef: true, brand: true }, orderBy: { id: 'asc' } });
  }

  async adminCustomers() {
    return this.prisma.user.findMany({ where: { role: 'CUSTOMER' }, select: { id: true, email: true, name: true, active: true, createdAt: true, _count: { select: { orders: true } } }, orderBy: { createdAt: 'desc' } });
  }

  async setCustomerActive(id: string, active: boolean) {
    return this.prisma.user.update({ where: { id, role: 'CUSTOMER' }, data: { active }, select: { id: true, email: true, name: true, active: true } });
  }

  async salesReport() {
    const [byStatus, paidPayments, ordersByDay] = await Promise.all([
      this.prisma.order.groupBy({ by: ['status'], _count: { _all: true }, _sum: { total: true } }),
      this.prisma.payment.aggregate({ where: { status: 'PAID' }, _sum: { amount: true }, _count: { _all: true } }),
      this.prisma.$queryRaw<Array<{ day: Date; orders: bigint; revenue: Prisma.Decimal }>>`SELECT date_trunc('day', "createdAt") AS day, COUNT(*) AS orders, COALESCE(SUM(total), 0) AS revenue FROM "Order" WHERE "createdAt" >= now() - interval '30 days' AND status NOT IN ('CANCELLED', 'REFUNDED') GROUP BY day ORDER BY day`,
    ]);
    return { byStatus, paidPayments: { amount: Number(paidPayments._sum.amount ?? 0), count: paidPayments._count._all }, ordersByDay: ordersByDay.map((entry) => ({ day: entry.day, orders: Number(entry.orders), revenue: Number(entry.revenue) })) };
  }

  async moderateReview(id: string, approved: boolean) {
    return this.prisma.review.update({ where: { id }, data: { approved } });
  }

  async recordEvent(userId: string | undefined, productId: number | undefined, type: BehaviorType, query?: string) {
    if (productId !== undefined && !await this.prisma.product.findUnique({ where: { id: productId }, select: { id: true } })) throw new NotFoundException('Product not found.');
    await this.prisma.behaviorEvent.create({ data: { userId, productId, type, query } });
    if (userId && productId) {
      setImmediate(() => {
        void this.refreshInteraction(userId, productId).catch((error: unknown) => {
          this.logger.warn(`Could not refresh recommendation profile: ${String(error)}`);
        });
      });
    }
    return { accepted: true };
  }

  private async refreshInteraction(userId: string, productId: number) {
    const events = await this.prisma.behaviorEvent.groupBy({ by: ['type'], where: { userId, productId }, _count: { _all: true } });
    const counts = new Map(events.map((event) => [event.type, event._count._all]));
    const viewCount = counts.get('VIEW') ?? 0;
    const cartCount = counts.get('CART_ADD') ?? 0;
    const wishlistCount = counts.get('WISHLIST_ADD') ?? 0;
    const purchaseCount = counts.get('PURCHASE') ?? 0;
    const score = viewCount + cartCount * 3 + wishlistCount * 4 + purchaseCount * 5;
    await this.prisma.userProductInteraction.upsert({
      where: { userId_productId: { userId, productId } },
      create: { userId, productId, viewCount, cartCount, wishlistCount, purchaseCount, score },
      update: { viewCount, cartCount, wishlistCount, purchaseCount, score },
    });
  }

  async recommend(userId: string | undefined, interest?: string) {
    const products = await this.prisma.product.findMany({ where: { active: true, stock: { gt: 0 } }, include: { categoryRef: true, brand: true }, take: 500 });
    const interactions = userId ? await this.prisma.userProductInteraction.findMany({ where: { userId }, include: { product: { select: { price: true } } }, orderBy: { updatedAt: 'desc' }, take: 50 }) : [];
    const likedIds = new Set(interactions.filter((item) => item.score > 0).map((item) => item.productId));
    const likedCategories = new Set(products.filter((product) => likedIds.has(product.id)).map((product) => product.categoryId ?? product.category.toLowerCase()));
    const boughtByMe = new Set(interactions.filter((item) => item.purchaseCount > 0).map((item) => item.productId));
    const allInteractions = likedIds.size ? await this.prisma.userProductInteraction.findMany({ where: { productId: { in: [...likedIds] }, userId: { not: userId } }, orderBy: { score: 'desc' }, take: 200 }) : [];
    const collaborativeUsers = new Set(allInteractions.map((item) => item.userId));
    const collaborativeProducts = allInteractions.length
      ? await this.prisma.userProductInteraction.findMany({ where: { userId: { in: [...collaborativeUsers] }, productId: { notIn: [...boughtByMe] } }, orderBy: { score: 'desc' }, take: 200 })
      : [];
    const collaborativeScores = new Map<number, number>();
    for (const item of collaborativeProducts) collaborativeScores.set(item.productId, (collaborativeScores.get(item.productId) ?? 0) + item.score);
    const priceSignals = interactions.filter((item) => item.score > 0);
    const preferredPrice = priceSignals.length
      ? priceSignals.reduce((sum, item) => sum + Number(item.product.price) * item.score, 0) / priceSignals.reduce((sum, item) => sum + item.score, 0)
      : 0;
    const text = interest?.toLowerCase() ?? '';
    const terms = text === 'gadgets' ? ['electronics', 'headphone', 'watch', 'gadget'] : text === 'fitness' ? ['fitness', 'running', 'sports', 'gym', 'exercise'] : text === 'fashion' ? ['fashion', 'shoe', 'clothing', 'style'] : [];
    const scored = products.filter((product) => !boughtByMe.has(product.id)).map((product) => {
      const productText = `${product.name} ${product.category} ${product.description ?? ''} ${product.brand?.name ?? ''}`.toLowerCase();
      const content = (likedCategories.has(product.categoryId ?? product.category.toLowerCase()) ? 3 : 0) + terms.filter((term) => productText.includes(term)).length;
      const collaborative = collaborativeScores.get(product.id) ?? 0;
      const price = Number(product.price);
      const priceFit = preferredPrice > 0 && price > 0 ? Math.max(0, 2 - Math.abs(Math.log(price / preferredPrice)) * 2) : 0;
      const score = content * 2 + Math.log1p(collaborative) * 3 + priceFit;
      const reason = collaborative > 0 ? 'Customers with similar interests also engaged with this product' : content > 0 ? (priceFit > 0 ? 'Matches your interests and typical price range' : 'Matches your interests and recent product activity') : 'Popular catalog pick for new shoppers';
      return { product, score, reason };
    }).sort((a, b) => b.score - a.score || a.product.id - b.product.id).slice(0, 12);
    const strategy = interactions.length ? 'hybrid-content-collaborative' : terms.length ? 'content-based-cold-start' : 'popular-catalog-cold-start';
    if (scored.length) {
      await this.prisma.recommendationRun.create({ data: { userId, interest, strategy, items: { create: scored.map((item, index) => ({ productId: item.product.id, rank: index + 1, score: item.score, reason: item.reason })) } } });
    }
    return { strategy, items: scored.map(({ product, score, reason }) => ({ ...product, price: Number(product.price), score, reason })) };
  }

  async adminDashboard() {
    const [orders, users, products, lowStock, revenue] = await Promise.all([
      this.prisma.order.count(), this.prisma.user.count({ where: { role: 'CUSTOMER' } }), this.prisma.product.count(),
      this.prisma.product.findMany({ where: { active: true, stock: { lte: 5 } }, orderBy: { stock: 'asc' }, take: 20 }),
      this.prisma.order.aggregate({ where: { status: { in: ['CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED'] } }, _sum: { total: true } }),
    ]);
    return { orders, customers: users, products, revenue: Number(revenue._sum.total ?? 0), lowStock };
  }

  async saveProduct(body: Record<string, unknown>, id?: number) {
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const category = typeof body.category === 'string' ? body.category.trim() : '';
    const price = Number(body.price);
    const stock = Number(body.stock ?? 0);
    if (!name || !category || !Number.isFinite(price) || price < 0 || !Number.isInteger(stock) || stock < 0) throw new BadRequestException('name, category, non-negative price, and non-negative stock are required.');
    const slug = category.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const categoryRecord = await this.prisma.category.upsert({ where: { name: category }, create: { name: category, slug }, update: {} });
    const brandName = typeof body.brand === 'string' ? body.brand.trim() : '';
    const brand = brandName ? await this.prisma.brand.upsert({ where: { name: brandName }, create: { name: brandName }, update: {} }) : null;
    const data = { name, category, categoryId: categoryRecord.id, brandId: brand?.id ?? null, price, stock, description: typeof body.description === 'string' ? body.description : null, image: typeof body.image === 'string' ? body.image : null, active: body.active !== false };
    const saved = id
      ? await this.prisma.product.update({ where: { id }, data })
      : await this.prisma.product.create({ data });
    const imageUrls = Array.isArray(body.images)
      ? body.images.filter((value): value is string => typeof value === 'string' && value.startsWith('http'))
      : typeof body.image === 'string' && body.image.startsWith('http') ? [body.image] : [];
    if (Array.isArray(body.images) || body.image !== undefined) {
      await this.prisma.productImage.deleteMany({ where: { productId: saved.id } });
      if (imageUrls.length) await this.prisma.productImage.createMany({ data: imageUrls.map((url, position) => ({ productId: saved.id, url, position })) });
    }
    if (Array.isArray(body.variants)) {
      await this.prisma.productVariant.deleteMany({ where: { productId: saved.id } });
      for (const candidate of body.variants) {
        if (!candidate || typeof candidate !== 'object') continue;
        const variant = candidate as Record<string, unknown>;
        if (typeof variant.sku !== 'string' || !variant.sku.trim() || typeof variant.name !== 'string' || !variant.name.trim()) continue;
        const variantStock = Number(variant.stock ?? 0);
        const variantPrice = variant.price === undefined || variant.price === null ? null : Number(variant.price);
        if (!Number.isInteger(variantStock) || variantStock < 0 || (variantPrice !== null && (!Number.isFinite(variantPrice) || variantPrice < 0))) continue;
        await this.prisma.productVariant.create({ data: { productId: saved.id, sku: variant.sku.trim(), name: variant.name.trim(), attributes: (variant.attributes && typeof variant.attributes === 'object' ? variant.attributes : {}) as Prisma.InputJsonValue, stock: variantStock, price: variantPrice } });
      }
    }
    return this.prisma.product.findUniqueOrThrow({ where: { id: saved.id }, include: { images: { orderBy: { position: 'asc' } }, variants: true, categoryRef: true, brand: true } });
  }

  async categories() { return this.prisma.category.findMany({ include: { _count: { select: { products: true } } }, orderBy: { name: 'asc' } }); }
  async brands() { return this.prisma.brand.findMany({ include: { _count: { select: { products: true } } }, orderBy: { name: 'asc' } }); }

  async createCategory(nameValue: string, parentId?: number) {
    const name = nameValue?.trim();
    if (!name) throw new BadRequestException('Category name is required.');
    const slug = name.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return this.prisma.category.create({ data: { name, slug, parentId } });
  }

  async createBrand(nameValue: string) {
    const name = nameValue?.trim();
    if (!name) throw new BadRequestException('Brand name is required.');
    return this.prisma.brand.create({ data: { name } });
  }

  async createRazorpayOrder(userId: string, orderId: string) {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) throw new ServiceUnavailableException('Payment provider is not configured. Set Razorpay credentials to enable checkout payments.');
    const order = await this.prisma.order.findFirst({ where: { id: orderId, userId }, include: { payment: true } });
    if (!order || !order.payment) throw new NotFoundException('Order or payment not found.');
    if (order.status !== 'PENDING' || order.payment.status !== 'PENDING') throw new BadRequestException('This order cannot start a payment.');
    const response = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: { Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: new Prisma.Decimal(order.total).mul(100).toNumber(), currency: order.currency, receipt: order.id }),
    });
    if (!response.ok) throw new ServiceUnavailableException('The payment provider could not create a payment order.');
    const providerOrder = await response.json() as { id: string };
    await this.prisma.payment.update({ where: { orderId }, data: { provider: 'razorpay', providerRef: providerOrder.id } });
    return { keyId, providerOrderId: providerOrder.id, amount: new Prisma.Decimal(order.total).mul(100).toNumber(), currency: order.currency };
  }

  async verifyRazorpayPayment(userId: string, body: { orderId: string; razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) {
    const secret = process.env.RAZORPAY_KEY_SECRET;
    if (!secret) throw new ServiceUnavailableException('Payment provider is not configured.');
    const order = await this.prisma.order.findFirst({ where: { id: body.orderId, userId }, include: { payment: true } });
    if (!order?.payment || order.payment.providerRef !== body.razorpay_order_id) throw new BadRequestException('Payment order does not match the checkout order.');
    const expected = Buffer.from(createHmac('sha256', secret).update(`${body.razorpay_order_id}|${body.razorpay_payment_id}`).digest('hex'), 'utf8');
    const supplied = Buffer.from(body.razorpay_signature ?? '', 'utf8');
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) throw new BadRequestException('Payment signature is invalid.');
    return this.prisma.$transaction(async (tx) => {
      await tx.payment.update({ where: { orderId: body.orderId }, data: { providerRef: body.razorpay_payment_id, status: 'PAID' } });
      return tx.order.update({ where: { id: body.orderId }, data: { status: 'CONFIRMED' }, include: { items: true, payment: true } });
    });
  }

  async createCoupon(body: Record<string, unknown>) {
    const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : '';
    const percentOff = body.percentOff === undefined ? undefined : Number(body.percentOff);
    const amountOff = body.amountOff === undefined ? undefined : Number(body.amountOff);
    if (!code || ((percentOff === undefined) === (amountOff === undefined)) || (percentOff !== undefined && (!Number.isInteger(percentOff) || percentOff < 1 || percentOff > 100)) || (amountOff !== undefined && (!Number.isFinite(amountOff) || amountOff <= 0))) throw new BadRequestException('Provide a code and exactly one valid discount value.');
    return this.prisma.coupon.create({ data: { code, percentOff, amountOff, minimumSubtotal: body.minimumSubtotal === undefined ? undefined : Number(body.minimumSubtotal), maxUses: body.maxUses === undefined ? undefined : Number(body.maxUses) } });
  }
}

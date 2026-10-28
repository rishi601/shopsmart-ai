import {
  BadRequestException, Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post,
  Query, Req, UseGuards,
} from '@nestjs/common';
import { BehaviorType } from '@prisma/client';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard.js';
import { AdminGuard } from '../auth/admin.guard.js';
import { AuthService } from '../auth/auth.service.js';
import { CommerceService } from './commerce.service.js';

type AuthRequest = { user: { id: string; role: 'ADMIN' | 'CUSTOMER' } };

@Controller()
export class CommerceController {
  constructor(private readonly commerce: CommerceService, private readonly auth: AuthService) {}

  @Get('recommendations')
  publicRecommendations(@Query('interest') interest?: string) {
    return this.commerce.recommend(undefined, interest);
  }

  @Get('products/:id/reviews')
  reviews(@Param('id', ParseIntPipe) id: number) { return this.commerce.reviews(id); }

  @Post('events')
  async event(@Body() body: { productId?: number; type?: string; query?: string }, @Req() req: { headers: Record<string, string | undefined> }) {
    let userId: string | undefined;
    const bearer = req.headers.authorization;
    if (bearer?.startsWith('Bearer ')) {
      try { userId = this.auth.verifyAccessToken(bearer.slice(7)).sub; } catch { /* anonymous behavior is still useful */ }
    }
    if (body.productId !== undefined && (!Number.isInteger(body.productId) || body.productId < 1)) throw new BadRequestException('productId must be a positive integer.');
    if (body.query !== undefined && (typeof body.query !== 'string' || body.query.length > 200)) throw new BadRequestException('query must be a string of at most 200 characters.');
    if (!['VIEW', 'SEARCH'].includes(body.type ?? '')) throw new BadRequestException('Public event type must be VIEW or SEARCH.');
    return this.commerce.recordEvent(userId, body.productId, body.type as BehaviorType, body.query);
  }
}

@Controller()
@ApiTags('Customer')
@ApiBearerAuth()
@UseGuards(AuthGuard)
export class CustomerController {
  constructor(private readonly commerce: CommerceService, private readonly auth: AuthService) {}

  @Get('users/me')
  profile(@Req() req: AuthRequest) { return this.commerce.profile(req.user.id); }

  @Patch('users/me')
  updateProfile(@Req() req: AuthRequest, @Body() body: { name?: string; email?: string; currentPassword?: string; newPassword?: string }) {
    return this.auth.updateProfile(req.user.id, body);
  }

  @Get('cart')
  cart(@Req() req: AuthRequest) { return this.commerce.cart(req.user.id); }

  @Post('cart/items')
  addCart(@Req() req: AuthRequest, @Body() body: { productId?: number; quantity?: number }) {
    return this.commerce.addCartItem(req.user.id, Number(body.productId), Number(body.quantity ?? 1));
  }

  @Patch('cart/items/:productId')
  updateCart(@Req() req: AuthRequest, @Param('productId', ParseIntPipe) productId: number, @Body() body: { quantity?: number }) {
    return this.commerce.updateCartItem(req.user.id, productId, Number(body.quantity));
  }

  @Delete('cart/items/:productId')
  removeCart(@Req() req: AuthRequest, @Param('productId', ParseIntPipe) productId: number) {
    return this.commerce.updateCartItem(req.user.id, productId, 0);
  }

  @Get('wishlist')
  wishlist(@Req() req: AuthRequest) { return this.commerce.wishlist(req.user.id); }

  @Post('wishlist/items')
  addWishlist(@Req() req: AuthRequest, @Body() body: { productId?: number }) {
    return this.commerce.addWishlist(req.user.id, Number(body.productId));
  }

  @Delete('wishlist/items/:productId')
  removeWishlist(@Req() req: AuthRequest, @Param('productId', ParseIntPipe) productId: number) {
    return this.commerce.removeWishlist(req.user.id, productId);
  }

  @Get('addresses')
  addresses(@Req() req: AuthRequest) { return this.commerce.addresses(req.user.id); }

  @Post('addresses')
  addAddress(@Req() req: AuthRequest, @Body() body: Record<string, unknown>) {
    return this.commerce.addAddress(req.user.id, body);
  }

  @Patch('addresses/:id')
  updateAddress(@Req() req: AuthRequest, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.commerce.updateAddress(req.user.id, id, body);
  }

  @Delete('addresses/:id')
  deleteAddress(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.commerce.deleteAddress(req.user.id, id);
  }

  @Post('orders')
  checkout(@Req() req: AuthRequest, @Body() body: { addressId?: string; couponCode?: string }) {
    return this.commerce.checkout(req.user.id, body.addressId ?? '', body.couponCode);
  }

  @Get('orders')
  orders(@Req() req: AuthRequest) { return this.commerce.orders(req.user.id, req.user.role); }

  @Get('orders/:id')
  order(@Req() req: AuthRequest, @Param('id') id: string) { return this.commerce.order(req.user.id, req.user.role, id); }

  @Post('payments/orders/:orderId')
  createPayment(@Req() req: AuthRequest, @Param('orderId') orderId: string) { return this.commerce.createRazorpayOrder(req.user.id, orderId); }

  @Post('payments/verify')
  verifyPayment(@Req() req: AuthRequest, @Body() body: { orderId?: string; razorpay_order_id?: string; razorpay_payment_id?: string; razorpay_signature?: string }) {
    if (!body.orderId || !body.razorpay_order_id || !body.razorpay_payment_id || !body.razorpay_signature) throw new BadRequestException('All payment verification fields are required.');
    return this.commerce.verifyRazorpayPayment(req.user.id, { orderId: body.orderId, razorpay_order_id: body.razorpay_order_id, razorpay_payment_id: body.razorpay_payment_id, razorpay_signature: body.razorpay_signature });
  }

  @Post('reviews')
  review(@Req() req: AuthRequest, @Body() body: { productId?: number; rating?: number; title?: string; body?: string }) {
    return this.commerce.review(req.user.id, { productId: Number(body.productId), rating: Number(body.rating), title: body.title, body: body.body });
  }

  @Get('recommendations/me')
  recommendations(@Req() req: AuthRequest, @Query('interest') interest?: string) {
    return this.commerce.recommend(req.user.id, interest);
  }
}

@Controller('admin')
@ApiTags('Admin')
@ApiBearerAuth()
@UseGuards(AuthGuard, AdminGuard)
export class AdminController {
  constructor(private readonly commerce: CommerceService) {}

  @Get('dashboard')
  dashboard() { return this.commerce.adminDashboard(); }

  @Get('orders')
  orders() { return this.commerce.orders('', 'ADMIN'); }

  @Get('reports/sales')
  salesReport() { return this.commerce.salesReport(); }

  @Get('products')
  products() { return this.commerce.adminProducts(); }

  @Patch('orders/:id/status')
  setOrderStatus(@Param('id') id: string, @Body() body: { status?: string }) {
    return this.commerce.setOrderStatus(id, body.status ?? '');
  }

  @Post('products')
  createProduct(@Body() body: Record<string, unknown>) { return this.commerce.saveProduct(body); }

  @Patch('products/:id')
  updateProduct(@Param('id', ParseIntPipe) id: number, @Body() body: Record<string, unknown>) { return this.commerce.saveProduct(body, id); }

  @Get('categories')
  categories() { return this.commerce.categories(); }

  @Post('categories')
  createCategory(@Body() body: { name?: string; parentId?: number }) { return this.commerce.createCategory(body.name ?? '', body.parentId); }

  @Get('brands')
  brands() { return this.commerce.brands(); }

  @Post('brands')
  createBrand(@Body() body: { name?: string }) { return this.commerce.createBrand(body.name ?? ''); }

  @Get('customers')
  customers() { return this.commerce.adminCustomers(); }

  @Patch('customers/:id')
  setCustomerActive(@Param('id') id: string, @Body() body: { active?: boolean }) { return this.commerce.setCustomerActive(id, body.active === true); }

  @Get('reviews')
  reviews(@Query('productId') productId?: string) {
    if (productId && (!Number.isInteger(Number(productId)) || Number(productId) < 1)) throw new BadRequestException('productId must be a positive integer.');
    return this.commerce.adminReviews(productId ? Number(productId) : undefined);
  }

  @Patch('reviews/:id/moderation')
  moderateReview(@Param('id') id: string, @Body() body: { approved?: boolean }) {
    return this.commerce.moderateReview(id, body.approved === true);
  }

  @Post('coupons')
  createCoupon(@Body() body: Record<string, unknown>) { return this.commerce.createCoupon(body); }
}

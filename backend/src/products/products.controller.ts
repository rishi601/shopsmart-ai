
import { BadRequestException, Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ProductsService } from './products.service.js';

@Controller('products')
@ApiTags('Products')
export class ProductsController {
  constructor(
    private readonly productsService: ProductsService,
  ) {}

  @Get()
  findAll() {
    return this.productsService.findAll();
  }

  @Get('catalog')
  findCatalog(
    @Query('q') query?: string,
    @Query('category') category?: string,
    @Query('sort') sort?: string,
    @Query('order') order?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pageNumber = Number(page ?? 1);
    const pageSize = Number(limit ?? 12);
    if (!Number.isInteger(pageNumber) || pageNumber < 1) {
      throw new BadRequestException('page must be a positive integer.');
    }
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
      throw new BadRequestException('limit must be an integer between 1 and 100.');
    }
    if (sort && !['name', 'price', 'createdAt'].includes(sort)) {
      throw new BadRequestException('sort must be name, price, or createdAt.');
    }
    if (order && !['asc', 'desc'].includes(order)) {
      throw new BadRequestException('order must be asc or desc.');
    }
    return this.productsService.findCatalog({
      query: query?.trim(),
      category: category?.trim(),
      sort: sort as 'name' | 'price' | 'createdAt' | undefined,
      order: order as 'asc' | 'desc' | undefined,
      page: pageNumber,
      limit: pageSize,
    });
  }

  @Get('recommendations')
  recommendations(@Query('interest') interest?: string) {
    if (interest && !['gadgets', 'fitness', 'fashion'].includes(interest)) {
      throw new BadRequestException('interest must be gadgets, fitness, or fashion.');
    }
    return this.productsService.recommend(interest ?? 'gadgets');
  }

  @Get('categories')
  categories() {
    return this.productsService.categories();
  }

  @Get('trending')
  trending() {
    return this.productsService.trending();
  }

  @Get(':id/frequently-bought-together')
  frequentlyBoughtTogether(@Param('id', ParseIntPipe) id: number) {
    return this.productsService.frequentlyBoughtTogether(id);
  }

  @Get(':id/similar')
  similar(@Param('id', ParseIntPipe) id: number) {
    return this.productsService.similar(id);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    if (id < 1) throw new BadRequestException('A valid product id is required.');
    return this.productsService.findOne(id);
  }
}

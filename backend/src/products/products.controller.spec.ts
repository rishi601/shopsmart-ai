import { Test, TestingModule } from '@nestjs/testing';
import { ProductsController } from './products.controller.js';
import { ProductsService } from './products.service.js';

describe('ProductsController', () => {
  let controller: ProductsController;

  beforeEach(async () => {
    const productsService = { findAll: vi.fn(), findCatalog: vi.fn(), recommend: vi.fn(), categories: vi.fn(), findOne: vi.fn(), trending: vi.fn(), similar: vi.fn(), frequentlyBoughtTogether: vi.fn() };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProductsController],
      providers: [{ provide: ProductsService, useValue: productsService }],
    }).compile();

    controller = module.get<ProductsController>(ProductsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});

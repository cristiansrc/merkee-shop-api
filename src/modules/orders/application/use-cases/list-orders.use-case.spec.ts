import { ListOrdersUseCaseImpl, ListOrdersQuery } from './list-orders.use-case';
import { OrderRepositoryPort, OrderPage, OrderListItem } from '../../domain/ports/order-repository.port';
import { DomainErrorCode } from '../../../../shared/domain/domain-error';

describe('ListOrdersUseCase', () => {
  let useCase: ListOrdersUseCaseImpl;
  let orderRepo: jest.Mocked<OrderRepositoryPort>;

  beforeEach(() => {
    orderRepo = {
      findById: jest.fn(),
      listByOwner: jest.fn(),
    };

    useCase = new ListOrdersUseCaseImpl(orderRepo);
  });

  describe('Ownership', () => {
    it('only returns orders belonging to the owner', async () => {
      const mockOrders: OrderListItem[] = [
        {
          id: 'order-1',
          orderNumber: 'ORD-001',
          status: 'PENDING_PAYMENT',
          totalCop: 26420n,
          createdAt: new Date('2026-08-17T10:00:00Z'),
        },
      ];

      orderRepo.listByOwner.mockResolvedValue({
        items: mockOrders,
        page: 1,
        size: 20,
        total: 1,
      });

      const query: ListOrdersQuery = {
        ownerId: 'user-1',
        page: 1,
        size: 20,
      };

      const result = await useCase.execute(query);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.items).toHaveLength(1);
        expect(result.value.items[0].id).toBe('order-1');
      }

      expect(orderRepo.listByOwner).toHaveBeenCalledWith('user-1', 1, 20);
    });

    it('returns empty list when owner has no orders', async () => {
      orderRepo.listByOwner.mockResolvedValue({
        items: [],
        page: 1,
        size: 20,
        total: 0,
      });

      const query: ListOrdersQuery = {
        ownerId: 'user-1',
        page: 1,
        size: 20,
      };

      const result = await useCase.execute(query);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.items).toHaveLength(0);
        expect(result.value.total).toBe(0);
      }
    });
  });

  describe('Pagination', () => {
    it('returns correct pagination metadata', async () => {
      orderRepo.listByOwner.mockResolvedValue({
        items: [],
        page: 2,
        size: 10,
        total: 25,
      });

      const query: ListOrdersQuery = {
        ownerId: 'user-1',
        page: 2,
        size: 10,
      };

      const result = await useCase.execute(query);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.page).toBe(2);
        expect(result.value.size).toBe(10);
        expect(result.value.total).toBe(25);
      }
    });

    it('rejects invalid page (< 1)', async () => {
      const query: ListOrdersQuery = {
        ownerId: 'user-1',
        page: 0,
        size: 20,
      };

      const result = await useCase.execute(query);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(DomainErrorCode.RESOURCE_NOT_FOUND);
      }
    });

    it('rejects invalid size (< 1)', async () => {
      const query: ListOrdersQuery = {
        ownerId: 'user-1',
        page: 1,
        size: 0,
      };

      const result = await useCase.execute(query);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(DomainErrorCode.RESOURCE_NOT_FOUND);
      }
    });

    it('rejects size > 100', async () => {
      const query: ListOrdersQuery = {
        ownerId: 'user-1',
        page: 1,
        size: 101,
      };

      const result = await useCase.execute(query);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(DomainErrorCode.RESOURCE_NOT_FOUND);
      }
    });
  });
});

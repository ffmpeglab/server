import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { RolesService } from './roles.service';
import { Role } from '../model/roles.entity';
import { Item } from '../model/item.entity';
import { Render } from '../model/render.entity';
import { Permission } from '../types';

const mockRolesRepo = {
  findBy: jest.fn(),
  findOneBy: jest.fn(),
  insert: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
};

const mockItemsRepo = {
  findOneBy: jest.fn(),
};

const mockRendersRepo = {
  findOneBy: jest.fn(),
};

describe('RolesService', () => {
  let service: RolesService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        RolesService,
        { provide: getRepositoryToken(Role), useValue: mockRolesRepo },
        { provide: getRepositoryToken(Item), useValue: mockItemsRepo },
        { provide: getRepositoryToken(Render), useValue: mockRendersRepo },
      ],
    }).compile();
    service = moduleRef.get(RolesService);
  });

  // ------------------------------------------------------------------
  // unchanged methods
  // ------------------------------------------------------------------

  describe('findAllAssignedRoles', () => {
    it('filters by user_id', async () => {
      const rows = [{ id: 'r1', user_id: 'u1' }];
      mockRolesRepo.findBy.mockResolvedValue(rows);
      expect(await service.findAllAssignedRoles('u1')).toBe(rows);
      expect(mockRolesRepo.findBy).toHaveBeenCalledWith({ user_id: 'u1' });
    });

    it('returns [] when there are no roles', async () => {
      mockRolesRepo.findBy.mockResolvedValue([]);
      expect(await service.findAllAssignedRoles('u1')).toEqual([]);
    });
  });

  describe('findOne', () => {
    it('scopes lookup by id AND user_id (tenant isolation)', async () => {
      mockRolesRepo.findOneBy.mockResolvedValue(null);
      await service.findOne('r1', 'u1');
      expect(mockRolesRepo.findOneBy).toHaveBeenCalledWith({
        id: 'r1',
        user_id: 'u1',
      });
    });

    it('returns null when not found', async () => {
      mockRolesRepo.findOneBy.mockResolvedValue(null);
      expect(await service.findOne('missing', 'u1')).toBeNull();
    });
  });

  describe('findByFolder', () => {
    it('filters by user_id and item (= folder id)', async () => {
      const rows = [{ id: 'r1', item: 'folder-1' }];
      mockRolesRepo.findBy.mockResolvedValue(rows);
      expect(await service.findByFolder('folder-1', 'u1')).toBe(rows);
      expect(mockRolesRepo.findBy).toHaveBeenCalledWith({
        user_id: 'u1',
        item: 'folder-1',
      });
    });
  });

  describe('update', () => {
    it('updates scoped to (id, user_id) whitelisting title + permission only', async () => {
      mockRolesRepo.findOneBy.mockResolvedValue({ id: 'r1' });

      await service.update(
        { id: 'r1', title: 'T2', permission: Permission.rw },
        'u1',
      );

      expect(mockRolesRepo.update).toHaveBeenCalledWith(
        { id: 'r1', user_id: 'u1' },
        { title: 'T2', permission: Permission.rw },
      );
      const patch = mockRolesRepo.update.mock.calls[0][1];
      expect(patch).not.toHaveProperty('user_id');
      expect(patch).not.toHaveProperty('owner');
    });
  });

  describe('deleteOne', () => {
    it('deletes scoped to (id, user_id)', async () => {
      mockRolesRepo.delete.mockResolvedValue({ affected: 1, raw: {} });
      const result = await service.deleteOne('r1', 'u1');
      expect(mockRolesRepo.delete).toHaveBeenCalledWith({
        id: 'r1',
        user_id: 'u1',
      });
      expect(result).toEqual({ affected: 1, raw: {} });
    });

    it('returns affected:0 when nothing matched', async () => {
      mockRolesRepo.delete.mockResolvedValue({ affected: 0, raw: {} });
      expect(await service.deleteOne('x', 'u1')).toEqual({
        affected: 0,
        raw: {},
      });
    });
  });

  // ------------------------------------------------------------------
  // create — XOR on item/render + ownership check
  // ------------------------------------------------------------------

  describe('create', () => {
    const grantor = 'alice';
    const grantee = 'bob';

    const dto = (overrides: Record<string, unknown> = {}) => ({
      title: 'Shared',
      permission: Permission.r,
      user_id: grantee,
      ...overrides,
    });

    beforeEach(() => {
      mockRolesRepo.insert.mockResolvedValue({
        identifiers: [{ id: 'role-1' }],
      });
      mockRolesRepo.findOneBy.mockResolvedValue({
        id: 'role-1',
        owner: grantor,
        user_id: grantee,
      });
    });

    // --- input validation (XOR on item/render) -------------------------

    describe('input validation', () => {
      it('rejects when both item and render are set', async () => {
        await expect(
          service.create(dto({ item: 'i1', render: 'r1' }), grantor),
        ).rejects.toThrow('invalid_input');
        expect(mockItemsRepo.findOneBy).not.toHaveBeenCalled();
        expect(mockRendersRepo.findOneBy).not.toHaveBeenCalled();
        expect(mockRolesRepo.insert).not.toHaveBeenCalled();
      });

      it('rejects when neither item nor render is set', async () => {
        await expect(service.create(dto(), grantor)).rejects.toThrow(
          'invalid_input',
        );
        expect(mockItemsRepo.findOneBy).not.toHaveBeenCalled();
        expect(mockRendersRepo.findOneBy).not.toHaveBeenCalled();
        expect(mockRolesRepo.insert).not.toHaveBeenCalled();
      });
    });

    // --- item grants ---------------------------------------------------

    describe('item grants', () => {
      it('verifies ownership by (item id, caller id), inserts with owner=caller, re-reads by (id, owner)', async () => {
        mockItemsRepo.findOneBy.mockResolvedValue({
          id: 'i1',
          user_id: grantor,
        });

        const result = await service.create(dto({ item: 'i1' }), grantor);

        expect(mockItemsRepo.findOneBy).toHaveBeenCalledWith({
          id: 'i1',
          user_id: grantor,
        });
        expect(mockRolesRepo.insert).toHaveBeenCalledWith({
          title: 'Shared',
          permission: Permission.r,
          user_id: grantee,
          item: 'i1',
          owner: grantor,
        });
        expect(mockRolesRepo.findOneBy).toHaveBeenCalledWith({
          id: 'role-1',
          owner: grantor,
        });
        expect(result).toEqual({
          id: 'role-1',
          owner: grantor,
          user_id: grantee,
        });
      });

      it('rejects when caller does not own the item', async () => {
        mockItemsRepo.findOneBy.mockResolvedValue(null);
        await expect(
          service.create(dto({ item: 'i1' }), grantor),
        ).rejects.toThrow('not_found');
        expect(mockRolesRepo.insert).not.toHaveBeenCalled();
      });

      it('does not touch the renders repo when granting on an item', async () => {
        mockItemsRepo.findOneBy.mockResolvedValue({
          id: 'i1',
          user_id: grantor,
        });
        await service.create(dto({ item: 'i1' }), grantor);
        expect(mockRendersRepo.findOneBy).not.toHaveBeenCalled();
      });
    });

    // --- render grants -------------------------------------------------

    describe('render grants', () => {
      it('verifies ownership against the render id, not "any render"', async () => {
        // Discriminating mock — a flat mockResolvedValue would also let a
        // hypothetical regression that drops `id` from the where-clause
        // pass. The caller owns r-alice but NOT r-bob.
        mockRendersRepo.findOneBy.mockImplementation(async ({ id }) =>
          id === 'r-alice' ? { id: 'r-alice', user_id: grantor } : null,
        );

        await expect(
          service.create(dto({ render: 'r-bob' }), grantor),
        ).rejects.toThrow('not_found');

        expect(mockRendersRepo.findOneBy).toHaveBeenCalledWith({
          id: 'r-bob',
          user_id: grantor,
        });
        expect(mockRolesRepo.insert).not.toHaveBeenCalled();
      });

      it('inserts with owner=caller and re-reads by (id, owner) on success', async () => {
        mockRendersRepo.findOneBy.mockResolvedValue({
          id: 'r-alice',
          user_id: grantor,
        });

        const result = await service.create(
          dto({ render: 'r-alice', permission: Permission.rw }),
          grantor,
        );

        expect(mockRendersRepo.findOneBy).toHaveBeenCalledWith({
          id: 'r-alice',
          user_id: grantor,
        });
        expect(mockRolesRepo.insert).toHaveBeenCalledWith({
          title: 'Shared',
          permission: Permission.rw,
          user_id: grantee,
          render: 'r-alice',
          owner: grantor,
        });
        expect(mockRolesRepo.findOneBy).toHaveBeenCalledWith({
          id: 'role-1',
          owner: grantor,
        });
        expect(result).not.toBeNull();
      });

      //   it('does not touch the items repo when granting on a render', async () => {
      //     mockRendersRepo.findOneBy.mockResolvedValue({ id: 'r-alice' });
      //     await service.create(dto({ render: 'r-alice' }), grantor);
      //     expect(mockItemsRepo.findOneBy).not.toHaveBeenCalled();
      //   });
    });
  });
});

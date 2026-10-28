import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ItemsService } from './items.service';
import { Item } from '../model/item.entity';
import { Role } from '../model/roles.entity';
import { Permission } from '../types';

const mockItemsRepo = {
  findBy: jest.fn(),
  findOneBy: jest.fn(),
  findOne: jest.fn(),
  insert: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
};

const mockRolesRepo = {
  findOneBy: jest.fn(),
};

describe('ItemsService', () => {
  let service: ItemsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        ItemsService,
        { provide: getRepositoryToken(Item), useValue: mockItemsRepo },
        { provide: getRepositoryToken(Role), useValue: mockRolesRepo },
      ],
    }).compile();
    service = moduleRef.get(ItemsService);
  });

  describe('findAllFolders', () => {
    it('filters by (user_id, isFolder=true)', async () => {
      const rows = [{ id: 'f1' }];
      mockItemsRepo.findBy.mockResolvedValue(rows);
      expect(await service.findAllFolders('u1')).toBe(rows);
      expect(mockItemsRepo.findBy).toHaveBeenCalledWith({
        user_id: 'u1',
        isFolder: true,
      });
    });
  });

  describe('findOne', () => {
    it('scopes by (id, user_id)', async () => {
      mockItemsRepo.findOneBy.mockResolvedValue(null);
      await service.findOne('i1', 'u1');
      expect(mockItemsRepo.findOneBy).toHaveBeenCalledWith({
        id: 'i1',
        user_id: 'u1',
      });
    });
  });

  describe('findOnePublic', () => {
    it('filters by (id, public=true) — no user scope', async () => {
      mockItemsRepo.findOneBy.mockResolvedValue({ id: 'i1' });
      await service.findOnePublic('i1');
      expect(mockItemsRepo.findOneBy).toHaveBeenCalledWith({
        id: 'i1',
        public: true,
      });
    });
  });

  describe('findByFolderPublic', () => {
    it('returns children when the parent folder is public + is a folder', async () => {
      mockItemsRepo.findOneBy.mockResolvedValue({ id: 'f1', isFolder: true });
      const children = [{ id: 'c1' }, { id: 'c2' }];
      mockItemsRepo.findBy.mockResolvedValue(children);

      expect(await service.findByFolderPublic('f1')).toBe(children);
      expect(mockItemsRepo.findOneBy).toHaveBeenCalledWith({
        id: 'f1',
        public: true,
        isFolder: true,
      });
      expect(mockItemsRepo.findBy).toHaveBeenCalledWith({ folder: 'f1' });
    });

    it("throws 'no_public_folder_found' when the parent is missing/private/non-folder", async () => {
      mockItemsRepo.findOneBy.mockResolvedValue(null);
      await expect(service.findByFolderPublic('f1')).rejects.toThrow(
        'no_public_folder_found',
      );
      expect(mockItemsRepo.findBy).not.toHaveBeenCalled();
    });
  });

  describe('findOneByPermission', () => {
    it('returns the item when permission is r (unscoped read)', async () => {
      mockRolesRepo.findOneBy.mockResolvedValue({
        item: 'i1',
        user_id: 'u1',
        permission: Permission.r,
      });
      mockItemsRepo.findOne.mockResolvedValue({ id: 'i1' });

      expect(await service.findOneByPermission('i1', 'u1')).toEqual({
        id: 'i1',
      });
      // Reads are intentionally unscoped — roles grant cross-user read access.
      expect(mockItemsRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'i1' },
      });
    });

    it('returns the item when permission is rw', async () => {
      mockRolesRepo.findOneBy.mockResolvedValue({ permission: Permission.rw });
      mockItemsRepo.findOne.mockResolvedValue({ id: 'i1' });
      expect(await service.findOneByPermission('i1', 'u1')).toEqual({
        id: 'i1',
      });
    });

    it("throws 'no_permission_found' when permission is w-only", async () => {
      mockRolesRepo.findOneBy.mockResolvedValue({ permission: Permission.w });
      await expect(service.findOneByPermission('i1', 'u1')).rejects.toThrow(
        'no_permission_found',
      );
      expect(mockItemsRepo.findOne).not.toHaveBeenCalled();
    });

    it("throws 'no_permission_found' when no role row exists", async () => {
      mockRolesRepo.findOneBy.mockResolvedValue(null);
      await expect(service.findOneByPermission('i1', 'u1')).rejects.toThrow(
        'no_permission_found',
      );
    });

    it('scopes the role lookup to (item, user_id)', async () => {
      mockRolesRepo.findOneBy.mockResolvedValue(null);
      await expect(service.findOneByPermission('i1', 'u1')).rejects.toThrow(
        'no_permission_found',
      );
      expect(mockRolesRepo.findOneBy).toHaveBeenCalledWith({
        item: 'i1',
        user_id: 'u1',
      });
    });
  });

  // -----------------------------------------------------------------
  // updateByRole — update predicate is (id, permission.owner),
  // re-read is findOne(id, permission.owner). Caller is *not* the owner.
  // -----------------------------------------------------------------
  describe('updateByRole', () => {
    const dto = { id: 'i1', title: 'new-title' } as any;
    const caller = 'bob';
    const owner = 'alice';

    it('scopes the role lookup to (item, caller)', async () => {
      mockRolesRepo.findOneBy.mockResolvedValue(null);
      await expect(service.updateByRole(dto, caller)).rejects.toThrow(
        'no_permission_found',
      );
      expect(mockRolesRepo.findOneBy).toHaveBeenCalledWith({
        item: 'i1',
        user_id: caller,
      });
    });

    it('updates by (id, permission.owner) and re-reads by (id, owner) — rw', async () => {
      mockRolesRepo.findOneBy.mockResolvedValue({
        permission: Permission.rw,
        owner,
      });
      mockItemsRepo.update.mockResolvedValue(undefined);
      mockItemsRepo.findOneBy.mockResolvedValue({
        id: 'i1',
        title: 'new-title',
      });

      const result = await service.updateByRole(dto, caller);

      expect(mockItemsRepo.update).toHaveBeenCalledWith(
        { id: 'i1', user_id: owner }, // owner, not caller
        { title: 'new-title' },
      );
      expect(mockItemsRepo.findOneBy).toHaveBeenCalledWith({
        id: 'i1',
        user_id: owner, // re-read scoped to owner, not caller
      });
      expect(result).toEqual({ id: 'i1', title: 'new-title' });
    });

    it('allows update when permission is w', async () => {
      mockRolesRepo.findOneBy.mockResolvedValue({
        permission: Permission.w,
        owner,
      });
      mockItemsRepo.update.mockResolvedValue(undefined);
      mockItemsRepo.findOneBy.mockResolvedValue({ id: 'i1' });

      await service.updateByRole(dto, caller);

      expect(mockItemsRepo.update).toHaveBeenCalledWith(
        { id: 'i1', user_id: owner },
        { title: 'new-title' },
      );
    });

    it("throws 'no_permission_found' for r-only permission", async () => {
      mockRolesRepo.findOneBy.mockResolvedValue({
        permission: Permission.r,
        owner,
      });
      await expect(service.updateByRole(dto, caller)).rejects.toThrow(
        'no_permission_found',
      );
      expect(mockItemsRepo.update).not.toHaveBeenCalled();
    });

    it("throws 'no_permission_found' when no role row exists", async () => {
      mockRolesRepo.findOneBy.mockResolvedValue(null);
      await expect(service.updateByRole(dto, caller)).rejects.toThrow(
        'no_permission_found',
      );
    });

    it('regression: shared (cross-user) roles now mutate the item (caller ≠ owner)', async () => {
      mockRolesRepo.findOneBy.mockResolvedValue({
        permission: Permission.w,
        owner,
      });
      mockItemsRepo.update.mockResolvedValue(undefined);
      mockItemsRepo.findOneBy.mockResolvedValue({
        id: 'i1',
        title: 'new-title',
        user_id: owner,
      });

      const result = await service.updateByRole(dto, caller);

      expect(mockItemsRepo.update).toHaveBeenCalledWith(
        { id: 'i1', user_id: owner }, // <- owner, not caller
        { title: 'new-title' },
      );
      expect(result).not.toBeNull();
      expect(result).toEqual({
        id: 'i1',
        title: 'new-title',
        user_id: owner,
      });
    });
  });

  describe('findByFolder', () => {
    it('filters by (user_id, folder)', async () => {
      mockItemsRepo.findBy.mockResolvedValue([]);
      await service.findByFolder('f1', 'u1');
      expect(mockItemsRepo.findBy).toHaveBeenCalledWith({
        user_id: 'u1',
        folder: 'f1',
      });
    });
  });

  describe('create', () => {
    it('inserts with user_id=userId + created timestamp, then re-reads', async () => {
      mockItemsRepo.insert.mockResolvedValue({
        identifiers: [{ id: 'new-id' }],
      });
      mockItemsRepo.findOneBy.mockResolvedValue({ id: 'new-id' });

      const before = Date.now();
      const result = await service.create(
        {
          title: 'item',
          folder: 'f1',
          isFolder: false,
          public: false,
          order: 0,
          item: {},
        },
        'u1',
      );

      const inserted = mockItemsRepo.insert.mock.calls[0][0];
      expect(inserted).toMatchObject({
        title: 'item',
        folder: 'f1',
        user_id: 'u1',
      });
      expect(new Date(inserted.created).getTime()).toBeGreaterThanOrEqual(
        before,
      );
      expect(mockItemsRepo.findOneBy).toHaveBeenCalledWith({
        id: 'new-id',
        user_id: 'u1',
      });
      expect(result).toEqual({ id: 'new-id' });
    });
  });

  describe('update', () => {
    it('updates scoped to (id, user_id) and only whitelists title', async () => {
      mockItemsRepo.update.mockResolvedValue(undefined);
      mockItemsRepo.findOneBy.mockResolvedValue({ id: 'i1' });

      await service.update({ id: 'i1', title: 'T2' } as any, 'u1');

      expect(mockItemsRepo.update).toHaveBeenCalledWith(
        { id: 'i1', user_id: 'u1' },
        { title: 'T2' },
      );
      expect(mockItemsRepo.update.mock.calls[0][1]).not.toHaveProperty(
        'user_id',
      );
    });
  });

  describe('deleteOne', () => {
    it('deletes scoped to (id, user_id)', async () => {
      mockItemsRepo.delete.mockResolvedValue({ affected: 1 });
      await service.deleteOne('i1', 'u1');
      expect(mockItemsRepo.delete).toHaveBeenCalledWith({
        id: 'i1',
        user_id: 'u1',
      });
    });
  });
});

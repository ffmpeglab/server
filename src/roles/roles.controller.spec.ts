import { RolesController } from './roles.controller';
import { Permission } from '../types';

describe('RolesController', () => {
  const service = {
    findAllAssignedRoles: jest.fn(),
    findByFolder: jest.fn(),
    deleteOne: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  };
  const ctrl = new RolesController(service as any);
  const req = { user: 'user-1' };

  beforeEach(() => jest.clearAllMocks());

  it('findAllAssignedRoles delegates with req.user', async () => {
    service.findAllAssignedRoles.mockResolvedValue([{ id: 'r1' }]);
    expect(await ctrl.findAllAssignedRoles(req)).toEqual([{ id: 'r1' }]);
    expect(service.findAllAssignedRoles).toHaveBeenCalledWith('user-1');
  });

  it('findByProject passes folderId + req.user', async () => {
    service.findByFolder.mockResolvedValue([]);
    await ctrl.findByProject({ folderId: 'f1' }, req);
    expect(service.findByFolder).toHaveBeenCalledWith('f1', 'user-1');
  });

  it('deleteOne passes params.id + req.user', async () => {
    service.deleteOne.mockResolvedValue({ affected: 1 });
    await ctrl.deleteOne({ id: 'r1' }, req);
    expect(service.deleteOne).toHaveBeenCalledWith('r1', 'user-1');
  });

  it('findOne passes params.id + req.user', async () => {
    service.findOne.mockResolvedValue({ id: 'r1' });
    await ctrl.findOne({ id: 'r1' }, req);
    expect(service.findOne).toHaveBeenCalledWith('r1', 'user-1');
  });

  it('create passes body + req.user', async () => {
    const dto = {
      title: 'Shared',
      permission: Permission.r,
      user_id: 'u2',
      item: 'i1',
    };
    await ctrl.create(dto, req);
    expect(service.create).toHaveBeenCalledWith(dto, 'user-1');
  });

  it('update passes body + req.user', async () => {
    const dto = {
      id: 'r1',
      title: 'T2',
      permission: Permission.rw,
    };
    await ctrl.update(dto, req);
    expect(service.update).toHaveBeenCalledWith(dto, 'user-1');
  });
});

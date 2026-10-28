import { ItemsController } from './items.controller';

describe('ItemsController', () => {
  const service = {
    findAllFolders: jest.fn(),
    findByFolder: jest.fn(),
    deleteOne: jest.fn(),
    findOne: jest.fn(),
    findOneByPermission: jest.fn(),
    updateByRole: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  };
  const ctrl = new ItemsController(service as any);
  const req = { user: 'user-1' };

  beforeEach(() => jest.clearAllMocks());

  it('findAllFolders delegates with req.user', async () => {
    service.findAllFolders.mockResolvedValue([]);
    await ctrl.findAllFolders(req);
    expect(service.findAllFolders).toHaveBeenCalledWith('user-1');
  });

  it('findByProject passes folderId + req.user', async () => {
    service.findByFolder.mockResolvedValue([]);
    await ctrl.findByProject({ folderId: 'f1' }, req);
    expect(service.findByFolder).toHaveBeenCalledWith('f1', 'user-1');
  });

  it('deleteOne passes params.id + req.user', async () => {
    service.deleteOne.mockResolvedValue({ affected: 1 });
    await ctrl.deleteOne({ id: 'i1' }, req);
    expect(service.deleteOne).toHaveBeenCalledWith('i1', 'user-1');
  });

  it('findOne passes params.id + req.user', async () => {
    service.findOne.mockResolvedValue({ id: 'i1' });
    await ctrl.findOne({ id: 'i1' }, req);
    expect(service.findOne).toHaveBeenCalledWith('i1', 'user-1');
  });

  it('findOneByRole passes params.id + req.user (delegates to findOneByPermission)', async () => {
    service.findOneByPermission.mockResolvedValue({ id: 'i1' });
    await ctrl.findOneByRole({ id: 'i1' }, req);
    expect(service.findOneByPermission).toHaveBeenCalledWith('i1', 'user-1');
  });

  it('updateOneByRole passes body + req.user (delegates to updateByRole)', async () => {
    const dto = { id: 'i1', title: 'T2' } as any;
    await ctrl.updateOneByRole(dto, req);
    expect(service.updateByRole).toHaveBeenCalledWith(dto, 'user-1');
  });

  it('create passes body + req.user', async () => {
    const dto = {
      title: 'i',
      folder: 'f',
      isFolder: false,
      public: false,
      order: 0,
      item: {},
    };
    await ctrl.create(dto, req);
    expect(service.create).toHaveBeenCalledWith(dto, 'user-1');
  });

  it('update passes body + req.user', async () => {
    const dto = { id: 'i1', title: 'T2' } as any;
    await ctrl.update(dto, req);
    expect(service.update).toHaveBeenCalledWith(dto, 'user-1');
  });
});

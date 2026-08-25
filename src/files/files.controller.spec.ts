// src/files/files.controller.spec.ts
import { FilesController } from './files.controller';

describe('FilesController', () => {
  const filesService = {
    uploadFile: jest.fn(),
    listFiles: jest.fn(),
    getFile: jest.fn(),
  };
  const tusService = { handleRequest: jest.fn() };
  const ctrl = new FilesController(filesService as any, tusService as any);
  const req = { user: 'user-1' };

  beforeEach(() => jest.clearAllMocks());

  it('upload passes user, originalname, buffer to the service', async () => {
    filesService.uploadFile.mockResolvedValue({ ok: true });
    const file = { originalname: 'a.mp4', buffer: Buffer.from('x') };

    expect(await ctrl.upload(file, req)).toEqual({ ok: true });
    expect(filesService.uploadFile).toHaveBeenCalledWith(
      'user-1',
      'a.mp4',
      file.buffer,
    );
  });

  it('list delegates to the service with req.user', async () => {
    filesService.listFiles.mockResolvedValue({ list: [] });
    await ctrl.list(req);
    expect(filesService.listFiles).toHaveBeenCalledWith('user-1');
  });

  it('file passes params.id and req.user', async () => {
    filesService.getFile.mockResolvedValue({ link: 'x' });
    await ctrl.file({ id: '/user-1/v.mp4' }, req);
    expect(filesService.getFile).toHaveBeenCalledWith(
      '/user-1/v.mp4',
      'user-1',
    );
  });
});

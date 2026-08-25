// src/pipelines/pipelines.controller.spec.ts
import { PipelinesController } from './pipelines.controller';

describe('PipelinesController', () => {
  const pipelineService = {
    findAll: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    transpile: jest.fn(),
  };
  const ctrl = new PipelinesController(pipelineService as any);
  const req = { user: 'user-1' };

  beforeEach(() => jest.clearAllMocks());

  it('findAll delegates to the service with req.user', async () => {
    pipelineService.findAll.mockResolvedValue([{ id: 'p1' }]);
    expect(await ctrl.findAll(req)).toEqual([{ id: 'p1' }]);
    expect(pipelineService.findAll).toHaveBeenCalledWith('user-1');
  });

  it('findOne passes params.id and req.user', async () => {
    pipelineService.findOne.mockResolvedValue({ id: 'p9' });
    expect(await ctrl.findOne({ id: 'p9' }, req)).toEqual({ id: 'p9' });
    expect(pipelineService.findOne).toHaveBeenCalledWith('p9', 'user-1');
  });

  it('create delegates body + user', async () => {
    const dto = { title: 't', upsql: '', downsql: '', yml: '' };
    await ctrl.create(dto, req);
    expect(pipelineService.create).toHaveBeenCalledWith(dto, 'user-1');
  });

  it('update delegates body + user', async () => {
    const dto = {
      id: 'p1',
      title: 't',
      status: 's',
      upsql: '',
      downsql: '',
      yml: '',
    };
    await ctrl.update(dto, req);
    expect(pipelineService.update).toHaveBeenCalledWith(dto, 'user-1');
  });

  it('transpile does NOT pass user (public endpoint by design)', async () => {
    const dto = { yml: 'key: value' };
    await ctrl.transpile(dto);
    expect(pipelineService.transpile).toHaveBeenCalledWith(dto);
    expect(pipelineService.transpile).toHaveBeenCalledTimes(1);
  });
});

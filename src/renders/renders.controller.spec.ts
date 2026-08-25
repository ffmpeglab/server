import { Test } from '@nestjs/testing';
import { MockRendersModule, mockAuthService } from './renders.module.mock';
import { RendersService } from './renders.service';
import { RendersController } from './renders.controller';

describe('RendersController', () => {
  let controller: RendersController;
  let service: RendersService;

  const mockService = {
    findAll: jest.fn(),
    findOne: jest.fn(),
    findAllRendersForProject: jest.fn(),
    getRenderLogs: jest.fn(),
    writeRender: jest.fn(),
    enqueRender: jest.fn(),
  };

  const req = { user: 'user-1' } as any;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Re-apply default resolved values after clearAllMocks wipes implementations
    mockAuthService.validateUser.mockResolvedValue({ id: 'user-1' });

    const moduleRef = await Test.createTestingModule({
      imports: [MockRendersModule],
    })
      .overrideProvider(RendersService)
      .useValue(mockService)
      .compile();

    controller = moduleRef.get(RendersController);
    service = moduleRef.get(RendersService);
  });

  it('GET /renders delegates to findAll with request user', async () => {
    mockService.findAll.mockResolvedValue([]);
    await controller.findAll(req);
    expect(mockService.findAll).toHaveBeenCalledWith('user-1');
  });

  it('GET /renders/:id passes params.id and user', async () => {
    mockService.findOne.mockResolvedValue({ id: 'r1' });
    await controller.findOne({ id: 'r1' }, req);
    expect(mockService.findOne).toHaveBeenCalledWith('r1', 'user-1');
  });

  it('GET /renders/project/:id passes project id and user', async () => {
    mockService.findAllRendersForProject.mockResolvedValue([]);
    await controller.findAllRendersForProject({ id: 'p1' }, req);
    expect(mockService.findAllRendersForProject).toHaveBeenCalledWith(
      'p1',
      'user-1',
    );
  });

  it('GET /renders/logs/:id passes query params', async () => {
    mockService.getRenderLogs.mockResolvedValue({ logs: [] });
    await controller.renderLogs(
      { id: 'r1' },
      { from: '2024-01-01T00:00:00Z', direction: 'ASC' },
      req,
    );
    expect(mockService.getRenderLogs).toHaveBeenCalledWith(
      'r1',
      'user-1',
      '2024-01-01T00:00:00Z',
      'ASC',
    );
  });

  it('POST /renders creates a render', async () => {
    const dto = { project: {}, layers: [] } as any;
    mockService.writeRender.mockResolvedValue({ id: 'new' });
    await controller.create(dto, req);
    expect(mockService.writeRender).toHaveBeenCalledWith(dto, 'user-1');
  });

  it('PUT /renders/run enqueues the render by id only', async () => {
    mockService.enqueRender.mockResolvedValue({});
    await controller.runRender({ id: 'r1' }, req);
    expect(mockService.enqueRender).toHaveBeenCalledWith('r1', 'user-1');
  });
});

import { Test } from '@nestjs/testing';
import { RendersTools } from './renders.tools';
import { RendersService } from './renders.service';
import { RenderStatus } from '../types';
import { zRenderData } from './renders.schemas';

describe('RendersTools', () => {
  let tools: RendersTools;
  const renders = {
    findAll: jest.fn(),
    findOne: jest.fn(),
    findAllRendersForProject: jest.fn(),
    findAllRendersForStatus: jest.fn(),
    writeRender: jest.fn(),
    enqueRender: jest.fn(),
    deleteOne: jest.fn(),
    getRenderLogs: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [RendersTools, { provide: RendersService, useValue: renders }],
    }).compile();
    tools = moduleRef.get(RendersTools);
  });

  const ctx = (userId = 'u1') => ({ request: { user: userId } }) as any;

  it('scopes listRenders to the authenticated user', async () => {
    renders.findAll.mockResolvedValue([{ id: 'r1' }]);
    await tools.listRenders({}, ctx('u1'));
    expect(renders.findAll).toHaveBeenCalledWith('u1');
  });

  it('throws NotFoundException for a missing render', async () => {
    renders.findOne.mockResolvedValue(null);
    await expect(tools.getRender({ id: 'r1' }, ctx('u1'))).rejects.toThrow(
      'render r1 not found',
    );
  });

  it('passes userId from context into enqueRender', async () => {
    renders.enqueRender.mockResolvedValue({ msgId: 1 });
    await tools.runRender({ id: 'r1' }, ctx('u2'));
    expect(renders.enqueRender).toHaveBeenCalledWith('r1', 'u2');
  });

  it('forwards status filter', async () => {
    renders.findAllRendersForStatus.mockResolvedValue([]);
    await tools.listByStatus({ status: RenderStatus.done }, ctx('u3'));
    expect(renders.findAllRendersForStatus).toHaveBeenCalledWith(
      RenderStatus.done,
      'u3',
    );
  });

  it('defaults log direction to ASC', async () => {
    renders.getRenderLogs.mockResolvedValue({ logs: [] });
    await tools.getLogs({ id: 'r1', from: '2024-01-01T00:00:00Z' }, ctx('u1'));
    expect(renders.getRenderLogs).toHaveBeenCalledWith(
      'r1',
      'u1',
      '2024-01-01T00:00:00Z',
      'ASC',
    );
  });

  describe('create_render', () => {
    const input = {
      project: {
        id: 'p1',
        title: 'My project',
        editor: {
          length: 10,
          width: 1280,
          height: 720,
          lastUpdated: 0,
          compressionLevel: 3,
          preset: 'medium',
          output: 'mp4',
        },
      },
      layers: [
        {
          id: 'l1',
          title: 'Layer 1',
          editor: { muted: false },
          media: [],
        },
      ],
    };

    it('passes the schema through to writeRender with userId injected', async () => {
      renders.writeRender.mockResolvedValue({ id: 'new' });
      await tools.createRender(input as any, ctx('u9'));

      const [arg, userId] = renders.writeRender.mock.calls[0];
      expect(userId).toBe('u9');
      expect(arg.project).toEqual(
        expect.objectContaining({ id: 'p1', userId: 'u9' }),
      );
      expect(arg.layers[0].media).toEqual([]);
    });

    it('rejects input missing required project.editor fields', () => {
      const bad = {
        project: { id: 'p1', title: 'x' }, // no editor
        layers: [],
      };
      expect(zRenderData.safeParse(bad).success).toBe(false);
    });

    it('fills a missing layers[].media with [] via .default([])', () => {
      const parsed = zRenderData.parse({
        ...input,
        layers: [{ id: 'l1', title: 'L', editor: {} }],
      });
      expect(parsed.layers[0].media).toEqual([]);
    });
  });
});

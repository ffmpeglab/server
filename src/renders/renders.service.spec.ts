import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PgmqQueue } from 'nestjs-pgmq';
import { MoreThan, Repository } from 'typeorm';
import { RendersService } from './renders.service';
import { Render } from '../model/render.entity';
import { LogPiece } from '../model/logpiece.entity';
import { MockRendersModule } from './renders.module.mock';

const mockRender = {
  id: 'render-id',
  title: 'Test Render',
  project: 'project-id',
  status: 'created',
  public: false,
  user_id: 'user-1',
  progress: 0,
  logs: '',
  data: {},
  result: {},
  date: new Date(),
};

describe('RendersService', () => {
  let service: RendersService;
  let rendersRepo: jest.Mocked<Repository<Render>>;
  let logRepo: jest.Mocked<Repository<LogPiece>>;
  let queue: jest.Mocked<PgmqQueue>;

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleRef = await Test.createTestingModule({
      imports: [MockRendersModule],
    }).compile();

    service = moduleRef.get(RendersService);
    rendersRepo = moduleRef.get(getRepositoryToken(Render));
    logRepo = moduleRef.get(getRepositoryToken(LogPiece));
    queue = moduleRef.get('PGMQ_QUEUE_render');
  });

  describe('findAll', () => {
    it('returns all renders for the user and strips data', async () => {
      rendersRepo.findBy.mockResolvedValue([
        { ...mockRender, data: { x: 1 } },
      ] as any);

      const result = await service.findAll('user-1');

      expect(rendersRepo.findBy).toHaveBeenCalledWith({ user_id: 'user-1' });
      expect(result[0].data).toEqual({});
    });
  });

  describe('findOne', () => {
    it('finds render by id + user', async () => {
      rendersRepo.findOneBy.mockResolvedValue(mockRender as any);

      const result = await service.findOne('render-id', 'user-1');

      expect(result).toEqual(mockRender);
      expect(rendersRepo.findOneBy).toHaveBeenCalledWith({
        id: 'render-id',
        user_id: 'user-1',
      });
    });

    it('returns null when not found', async () => {
      rendersRepo.findOneBy.mockResolvedValue(null);
      expect(await service.findOne('nope', 'user-1')).toBeNull();
    });

    it('does NOT leak other users renders (tenant isolation)', async () => {
      rendersRepo.findOneBy.mockResolvedValue(null);
      await service.findOne('render-id', 'user-attacker');
      expect(rendersRepo.findOneBy).toHaveBeenCalledWith(
        expect.objectContaining({ user_id: 'user-attacker' }),
      );
    });
  });

  describe('writeRender', () => {
    const renderDto = {
      project: { id: 'project-1', title: 'My Project' },
      layers: [],
    };

    it('inserts a new render with defaults and returns it', async () => {
      rendersRepo.insert.mockResolvedValue({
        identifiers: [{ id: 'new-id' }],
      } as any);
      rendersRepo.findOneBy.mockResolvedValue(mockRender as any);

      const result = await service.writeRender(renderDto as any, 'user-1');

      expect(rendersRepo.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'My Project',
          project: 'project-1',
          status: 'created',
          public: false,
          user_id: 'user-1',
          progress: 0,
        }),
      );
      expect(result).toEqual(mockRender);
    });
  });

  describe('updateMediaResult', () => {
    it('updates result column', async () => {
      const media = { id: 'm1', userId: 'user-1' };
      rendersRepo.update.mockResolvedValue(undefined as any);
      rendersRepo.findOneBy.mockResolvedValue(mockRender as any);

      await service.updateMediaResult('render-id', media as any);

      expect(rendersRepo.update).toHaveBeenCalledWith(
        { id: 'render-id' },
        { result: media },
      );
    });
  });

  describe('updateRenderStatus', () => {
    it('sets the given status', async () => {
      rendersRepo.update.mockResolvedValue(undefined as any);
      rendersRepo.findOneBy.mockResolvedValue({
        ...mockRender,
        status: 'done',
      } as any);

      const result = await service.updateRenderStatus('render-id', 'done');

      expect(rendersRepo.update).toHaveBeenCalledWith(
        { id: 'render-id' },
        { status: 'done' },
      );
      expect(result.status).toBe('done');
    });
  });

  describe('enqueRender', () => {
    it('adds job to queue then marks as queued', async () => {
      queue.add.mockResolvedValue({ msgId: 1 } as any);
      rendersRepo.update.mockResolvedValue(undefined as any);
      rendersRepo.findOneBy.mockResolvedValue(mockRender as any);

      await service.enqueRender('render-id', 'user-1', 'my-bucket');

      expect(queue.add).toHaveBeenCalledWith(
        'render',
        expect.objectContaining({
          renderId: 'render-id',
          userId: 'user-1',
          bucket: 'my-bucket',
        }),
        { headers: { retryCount: 1 } },
      );
      // status update happens after enqueue
      expect(rendersRepo.update).toHaveBeenCalledWith(
        { id: 'render-id' },
        { status: 'queue' },
      );
    });
  });

  describe('appendLogs', () => {
    it('inserts a log piece', async () => {
      logRepo.insert.mockResolvedValue([] as any);
      await service.appendLogs(
        'render-id',
        'some log line',
        'user-1',
        '2024-01-01T00:00:00Z',
      );
      expect(logRepo.insert).toHaveBeenCalledWith({
        logs: 'some log line',
        render: 'render-id',
        user_id: 'user-1',
        date: '2024-01-01T00:00:00Z',
      });
    });
  });

  describe('getRenderLogs', () => {
    it('filters by date and respects direction', async () => {
      logRepo.find.mockResolvedValue([{ id: 'l1' }] as any);
      const from = new Date('2024-01-01T00:00:00Z').toISOString();

      const result = await service.getRenderLogs(
        'render-id',
        'user-1',
        from,
        'DESC',
      );

      expect(logRepo.find).toHaveBeenCalledWith({
        where: {
          render: 'render-id',
          user_id: 'user-1',
          date: MoreThan(new Date(from)),
        },
        order: { date: { direction: 'DESC' } },
      });
      expect(result).toEqual({ logs: [{ id: 'l1' }] });
    });

    it('defaults to ASC when direction missing', async () => {
      logRepo.find.mockResolvedValue([]);
      await service.getRenderLogs(
        'r',
        'u',
        new Date().toISOString(),
        undefined as any,
      );
      expect(logRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ order: { date: { direction: 'ASC' } } }),
      );
    });
  });
});

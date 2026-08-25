import { Test } from '@nestjs/testing';
import { LogsProcessor } from './logs.processor';
import { RendersService } from './renders.service';

const makeJob = (data: any) => ({ message: { data } }) as any;

describe('LogsProcessor', () => {
  let processor: LogsProcessor;
  const renderService = { appendLogs: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});

    const moduleRef = await Test.createTestingModule({
      providers: [
        LogsProcessor,
        { provide: RendersService, useValue: renderService },
      ],
    }).compile();
    processor = moduleRef.get(LogsProcessor);
  });

  afterEach(() => jest.restoreAllMocks());

  it('appends logs when renderId and logs present', async () => {
    renderService.appendLogs.mockResolvedValue([]);
    const date = new Date().toISOString();
    await processor.handleLogs(
      makeJob({ renderId: 'r1', logs: 'line', userId: 'u1', date }),
    );

    expect(renderService.appendLogs).toHaveBeenCalledWith(
      'r1',
      'line',
      'u1',
      date,
    );
  });

  it('skips appending when logs are empty/missing', async () => {
    await processor.handleLogs(
      makeJob({ renderId: 'r1', logs: '', userId: 'u1' }),
    );
    expect(renderService.appendLogs).not.toHaveBeenCalled();
  });

  it('skips when no renderId at all', async () => {
    await processor.handleLogs(makeJob({ logs: 'line', userId: 'u1' }));
    expect(renderService.appendLogs).not.toHaveBeenCalled();
  });

  it('swallows errors from appendLogs so worker does not crash', async () => {
    renderService.appendLogs.mockRejectedValue(new Error('insert failed'));
    await expect(
      processor.handleLogs(
        makeJob({ renderId: 'r1', logs: 'x', userId: 'u1' }),
      ),
    ).resolves.not.toThrow();
    expect(console.error).toHaveBeenCalled();
  });
});

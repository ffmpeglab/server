// src/pipelines/pipelines.service.spec.ts
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PipelinesService } from './pipelines.service';
import { Pipeline } from '../model/pipeline.entity';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';
jest.mock('node:child_process', () => ({ spawn: jest.fn() }));

jest.mock('node:crypto', () => ({
  ...jest.requireActual('node:crypto'),
  randomUUID: jest.fn(),
}));

const mockRepo = {
  findBy: jest.fn(),
  findOneBy: jest.fn(),
  insert: jest.fn(),
  update: jest.fn(),
};

jest.mock('node:fs', () => ({
  existsSync: jest.fn(),
  mkdir: jest.fn(),
  writeFile: jest.fn(),
  readFile: jest.fn(),
  readdir: jest.fn(),
  unlink: jest.fn(),
}));

import fs from 'node:fs';

const mockExistsSync = fs.existsSync as unknown as jest.Mock;
const mockMkdir = fs.mkdir as unknown as jest.Mock;
const mockWriteFile = fs.writeFile as unknown as jest.Mock;
const mockReadFile = fs.readFile as unknown as jest.Mock;
const mockReaddir = fs.readdir as unknown as jest.Mock;
const mockUnlink = fs.unlink as unknown as jest.Mock;
const mockRandomUUID = randomUUID as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockRandomUUID.mockReturnValue('fixed-id');
});

describe('PipelinesService — repository methods', () => {
  let service: PipelinesService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        PipelinesService,
        { provide: getRepositoryToken(Pipeline), useValue: mockRepo },
      ],
    }).compile();
    service = moduleRef.get(PipelinesService);
  });

  describe('findAll', () => {
    it('filters by user_id', async () => {
      const rows = [{ id: 'p1', user_id: 'u1' }];
      mockRepo.findBy.mockResolvedValue(rows);

      expect(await service.findAll('u1')).toBe(rows);
      expect(mockRepo.findBy).toHaveBeenCalledWith({ user_id: 'u1' });
    });
  });

  describe('findOne', () => {
    it('scopes lookup to BOTH id and user_id (tenant isolation)', async () => {
      mockRepo.findOneBy.mockResolvedValue(null);
      await service.findOne('p1', 'u1');
      expect(mockRepo.findOneBy).toHaveBeenCalledWith({
        id: 'p1',
        user_id: 'u1',
      });
    });
  });

  describe('create', () => {
    it('inserts with status=created, user_id and ISO date, then re-reads', async () => {
      mockRepo.insert.mockResolvedValue({ identifiers: [{ id: 'new-id' }] });
      mockRepo.findOneBy.mockResolvedValue({ id: 'new-id' });

      const before = Date.now();
      const result = await service.create(
        { title: 'T', upsql: 'U', downsql: 'D', yml: 'Y' },
        'u1',
      );

      const inserted = mockRepo.insert.mock.calls[0][0];
      expect(inserted).toMatchObject({
        title: 'T',
        upsql: 'U',
        downsql: 'D',
        yml: 'Y',
        status: 'created',
        user_id: 'u1',
      });
      expect(new Date(inserted.date).getTime()).toBeGreaterThanOrEqual(before);
      // re-read is scoped to the owner
      expect(mockRepo.findOneBy).toHaveBeenCalledWith({
        id: 'new-id',
        user_id: 'u1',
      });
      expect(result).toEqual({ id: 'new-id' });
    });

    it('returns null when the follow-up read finds nothing', async () => {
      mockRepo.insert.mockResolvedValue({ identifiers: [{ id: 'x' }] });
      mockRepo.findOneBy.mockResolvedValue(null);
      expect(await service.create({} as any, 'u1')).toBeNull();
    });
  });

  describe('update', () => {
    it('updates scoped to id AND user_id, whitelisting mutable fields only', async () => {
      mockRepo.findOneBy.mockResolvedValue({ id: 'p1' });

      await service.update(
        {
          id: 'p1',
          title: 'T2',
          status: 'ready',
          upsql: 'u2',
          downsql: 'd2',
          yml: 'y2',
        },
        'u1',
      );

      expect(mockRepo.update).toHaveBeenCalledWith(
        { id: 'p1', user_id: 'u1' },
        { status: 'ready', downsql: 'd2', upsql: 'u2', title: 'T2', yml: 'y2' },
      );
      expect(mockRepo.update.mock.calls[0][1]).not.toHaveProperty('user_id');
    });
  });
});

// ------------------------------------------------ transpile

describe('PipelinesService — transpile', () => {
  let service: PipelinesService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        PipelinesService,
        { provide: getRepositoryToken(Pipeline), useValue: mockRepo },
      ],
    }).compile();
    service = moduleRef.get(PipelinesService);
  });

  /** Wire the callback-style fs mocks for one full successful transpile */
  const setupHappyFs = (generatedFiles: Record<string, string>) => {
    mockExistsSync.mockReturnValue(false); // yml dir missing -> created
    mockMkdir.mockImplementation((_p, cb) => cb?.(null));
    mockWriteFile.mockImplementation((_p, _data, cb) => cb?.(null));
    mockReaddir.mockImplementation((_p, cb) =>
      cb?.(null, Object.keys(generatedFiles)),
    );
    mockReadFile.mockImplementation((p, _enc, cb) =>
      cb?.(null, generatedFiles[p.split('/').pop()!]),
    );
    mockUnlink.mockImplementation((_p, cb) => cb?.());
  };

  /** Spawn a fake deno process; returns it so tests can emit 'close' */
  const installFakeDeno = () => {
    const proc = new EventEmitter() as any;
    proc.stdout = new EventEmitter();
    proc.stderr = new EventEmitter();
    (spawn as jest.Mock).mockImplementation(() => {
      process.nextTick(() => proc.emit('close', 0));
      return proc;
    });
    return proc;
  };

  it('writes the yml, runs deno transpiler, collects and deletes generated sql files', async () => {
    setupHappyFs({
      'schema.sql': 'CREATE TABLE a;',
      'seed.sql': 'INSERT INTO a;',
    });
    const proc = installFakeDeno();

    const result = await service.transpile({ yml: 'tables: []' });

    // yml written under documentDir/yml/fixed-id.yml
    expect(mockWriteFile).toHaveBeenCalledWith(
      expect.stringContaining('/yml/fixed-id.yml'),
      'tables: []',
      expect.any(Function),
    );
    // deno invoked with -A, transpiler path, yml path, sql path, --svg
    expect(spawn).toHaveBeenCalledWith(
      'deno',
      expect.arrayContaining([
        '-A',
        expect.stringContaining('transpiler.ts'),
        expect.stringContaining('/yml/fixed-id.yml'),
        expect.stringContaining('/sql/fixed-id'),
        '--svg',
      ]),
    );
    expect(proc).toBeDefined();
    // both files collected by name
    expect(result.files).toEqual({
      'schema.sql': 'CREATE TABLE a;',
      'seed.sql': 'INSERT INTO a;',
    });
    // workspace cleaned: temp yml + generated sql removed
    const unlinkedPaths = mockUnlink.mock.calls.map((c) => c[0]);
    expect(
      unlinkedPaths.some((p) => String(p).includes('yml/fixed-id.yml')),
    ).toBe(true);
    expect(
      unlinkedPaths.filter((p) => String(p).endsWith('.sql')),
    ).toHaveLength(2);
  });

  it('skips creating the yml dir when it already exists', async () => {
    setupHappyFs({});
    mockExistsSync.mockReturnValue(true); // dir already there

    await service.transpile({ yml: '' });

    expect(mockMkdir).toHaveBeenCalledTimes(1); // only sqlPath, not ymlDir
    expect(mockMkdir.mock.calls[0][0]).toContain('/sql/');
  });

  it('rejects when writing the yml fails (and never spawns deno)', async () => {
    mockExistsSync.mockReturnValue(false);
    mockMkdir.mockImplementation((_p, cb) => cb?.(null));
    mockWriteFile.mockImplementation((_p, _d, cb) => cb?.(new Error('ENOSPC')));

    await expect(service.transpile({ yml: '' })).rejects.toThrow('ENOSPC');
    expect(spawn).not.toHaveBeenCalled();
  });

  it('rejects when the transpiler output dir cannot be read (deno produced nothing)', async () => {
    setupHappyFs({});
    mockReaddir.mockImplementation((_p, cb) => cb?.(new Error('ENOENT')));

    await expect(service.transpile({ yml: '' })).rejects.toThrow('ENOENT');
  });

  it('propagates read errors on individual generated files', async () => {
    setupHappyFs({ 'schema.sql': '' });
    mockReadFile.mockImplementation((_p, _enc, cb) => cb?.(new Error('EIO')));

    await expect(service.transpile({ yml: '' })).rejects.toThrow('EIO');
  });
});

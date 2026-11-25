import { Injectable, NotFoundException } from '@nestjs/common';
import { Tool, type McpContext } from '@nestjs/mcp';
import * as z from 'zod';
import { RendersService } from './renders.service';
import { RenderStatus } from '../types';
import { zRenderData, type RenderDataInput } from './renders.schemas';

type GuardedMCPContext = McpContext<{ user: string }>;

const toRenderData = (input: RenderDataInput, userId: string) => ({
  project: { ...input.project, userId },
  layers: input.layers,
  public: input.public,
});

@Injectable()
export class RendersTools {
  constructor(private readonly renders: RendersService) {}

  @Tool({
    name: 'list_renders',
    description: 'List every render owned by the authenticated user.',
    inputSchema: z.object({}),
    annotations: { readOnlyHint: true },
  })
  async listRenders(_input: null, ctx: GuardedMCPContext) {
    return this.renders.findAll(ctx.request!.user);
  }

  @Tool({
    name: 'get_render',
    description: 'Fetch a single render by its id.',
    inputSchema: z.object({
      id: z.string().describe('Render id, e.g. ren_123'),
    }),
    annotations: { readOnlyHint: true },
  })
  async getRender({ id }: { id: string }, ctx: GuardedMCPContext) {
    const render = await this.renders.findOne(id, ctx.request!.user);
    if (!render) throw new NotFoundException(`render ${id} not found`);
    return render;
  }

  @Tool({
    name: 'list_renders_for_project',
    description: 'List all renders for a specific project id.',
    inputSchema: z.object({
      projectId: z.string().describe('Project id'),
    }),
    annotations: { readOnlyHint: true },
  })
  async listForProject(
    { projectId }: { projectId: string },
    ctx: GuardedMCPContext,
  ) {
    return this.renders.findAllRendersForProject(projectId, ctx.request!.user);
  }

  @Tool({
    name: 'list_renders_by_status',
    description: 'List renders filtered by status.',
    inputSchema: z.object({ status: z.nativeEnum(RenderStatus) }),
    annotations: { readOnlyHint: true },
  })
  async listByStatus(
    { status }: { status: RenderStatus },
    ctx: GuardedMCPContext,
  ) {
    return this.renders.findAllRendersForStatus(status, ctx.request!.user);
  }

  @Tool({
    name: 'create_render',
    description:
      'Persist a new render from an EditorProject and its EditorLayer timeline. ' +
      'Does NOT queue it — call run_render afterwards.',
    inputSchema: zRenderData,
  })
  async createRender(input: RenderDataInput, ctx: GuardedMCPContext) {
    const userId = ctx.request!.user;
    return this.renders.writeRender(toRenderData(input, userId), userId);
  }

  @Tool({
    name: 'run_render',
    description: 'Queue an existing render for execution.',
    inputSchema: z.object({
      id: z.string(),
      bucket: z.string().optional(),
      taskId: z.string().optional(),
    }),
  })
  async runRender({ id }: { id: string }, ctx: GuardedMCPContext) {
    return this.renders.enqueRender(id, ctx.request!.user);
  }

  @Tool({
    name: 'delete_render',
    description: 'Delete a render that finished (done or error).',
    inputSchema: z.object({ id: z.string() }),
  })
  async deleteRender({ id }: { id: string }, ctx: GuardedMCPContext) {
    return this.renders.deleteOne(id, ctx.request!.user);
  }

  @Tool({
    name: 'get_render_logs',
    description: 'Fetch render logs since an ISO timestamp.',
    inputSchema: z.object({
      id: z.string(),
      from: z.string().describe('ISO timestamp — logs after this moment'),
      direction: z.enum(['ASC', 'DESC']).optional(),
    }),
    annotations: { readOnlyHint: true },
  })
  async getLogs(
    {
      id,
      from,
      direction,
    }: { id: string; from: string; direction?: 'ASC' | 'DESC' },
    ctx: GuardedMCPContext,
  ) {
    return this.renders.getRenderLogs(
      id,
      ctx.request!.user,
      from,
      direction ?? 'ASC',
    );
  }
}

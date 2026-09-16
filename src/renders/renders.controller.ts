import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';

import { RendersService } from './renders.service';
import { LogsResponse, RenderDto, RunDto } from './renders.dto';
import {
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
  ApiResponse,
} from '@nestjs/swagger';
import { RenderResponse } from '../types';
import { AuthGuard } from '../auth/auth.guard';

@UseGuards(AuthGuard)
@Controller('renders')
@ApiBearerAuth()
export class RendersController {
  constructor(private readonly renderService: RendersService) {}

  @Get('')
  @ApiResponse({ type: [RenderResponse] })
  async findAll(@Request() req: Request & { user: string }) {
    return await this.renderService.findAll(req.user);
  }

  @Get(':id')
  @ApiResponse({ type: RenderResponse })
  @ApiParam({
    name: 'id',
    description: 'The ID of the render',
    required: true,
    type: String,
  })
  async findOne(
    @Param() params: { id: string },
    @Request() req: Request & { user: string },
  ) {
    return await this.renderService.findOne(params.id, req.user);
  }

  @Delete(':id')
  @ApiResponse({ type: RenderResponse })
  @ApiParam({
    name: 'id',
    description: 'The ID of the render',
    required: true,
    type: String,
  })
  async deleteOne(
    @Param() params: { id: string },
    @Request() req: Request & { user: string },
  ) {
    return await this.renderService.deleteOne(params.id, req.user);
  }

  @Get('project/:id')
  @ApiResponse({ type: RenderResponse, isArray: true })
  @ApiParam({
    name: 'id',
    description: 'The ID of the render',
    required: true,
    type: String,
  })
  async findAllRendersForProject(
    @Param() params: { id: string },
    @Request() req: Request & { user: string },
  ) {
    return await this.renderService.findAllRendersForProject(
      params.id,
      req.user,
    );
  }

  @Get('marketplace/catalogue')
  @ApiQuery({
    name: 'offset',
    description: 'offset',
    required: false,
    type: String,
  })
  @ApiQuery({
    name: 'limit',
    description: 'limit',
    required: false,
    type: String,
  })
  @ApiQuery({
    name: 'search',
    description: 'search query',
    required: false,
    type: String,
  })
  @ApiQuery({
    name: 'userId',
    description: 'user id',
    required: false,
    type: String,
  })
  @ApiResponse({ type: [RenderResponse] })
  async getPublic(
    @Query() query: { offset: string; limit: 'ASC' | 'DESC'; search?: string },
    @Request() req: Request & { user: string },
  ) {
    return await this.renderService.getPublicRenders(query);
  }

  @Get('logs/:id')
  @ApiResponse({ type: LogsResponse })
  @ApiParam({
    name: 'id',
    description: 'The ID of the render',
    required: true,
    type: String,
  })
  @ApiQuery({
    name: 'from',
    description: 'The date from which to start filtering the logs',
    required: true,
    type: String,
  })
  @ApiQuery({
    name: 'direction',
    description: 'Order by direction',
    required: true,
    enum: ['ASC', 'DESC'],
  })
  async renderLogs(
    @Param() params: { id: string },
    @Query() query: { from: string; direction: 'ASC' | 'DESC' },
    @Request() req: Request & { user: string },
  ) {
    return await this.renderService.getRenderLogs(
      params.id,
      req.user,
      query.from,
      query.direction,
    );
  }

  @Post()
  @ApiResponse({ type: RenderResponse })
  async create(
    @Body() createRender: RenderDto,
    @Request() req: Request & { user: string },
  ) {
    return await this.renderService.writeRender(createRender, req.user);
  }

  @Put('run')
  async runRender(
    @Body() runRender: RunDto,
    @Request() req: Request & { user: string },
  ) {
    return await this.renderService.enqueRender(runRender.id, req.user);
  }
}

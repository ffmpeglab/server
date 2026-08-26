import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Request,
  UseGuards,
} from '@nestjs/common';

import { ApiBearerAuth, ApiParam, ApiResponse } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { PipelinesService } from './pipelines.service';
import { Pipeline } from '../model/pipeline.entity';
import {
  CreatePipelineDto,
  TranspilerRequest,
  TranspilerResponse,
  UpdatePipelineDto,
} from './pipelines.dto';

@UseGuards(AuthGuard)
@Controller('pipeline')
@ApiBearerAuth()
export class PipelinesController {
  constructor(private readonly pipelineService: PipelinesService) {}
  @Get('')
  @ApiResponse({ type: [Pipeline] })
  async findAll(@Request() req: Request & { user: string }) {
    return await this.pipelineService.findAll(req.user);
  }

  @Get(':id')
  @ApiResponse({ type: Pipeline })
  @ApiParam({
    name: 'id',
    description: 'The ID of the pipeline',
    required: true,
    type: String,
  })
  async findOne(
    @Param() params: { id: string },
    @Request() req: Request & { user: string },
  ) {
    return await this.pipelineService.findOne(params.id, req.user);
  }

  @Post()
  @ApiResponse({ type: Pipeline })
  async create(
    @Body() createPipe: CreatePipelineDto,
    @Request() req: Request & { user: string },
  ) {
    return await this.pipelineService.create(createPipe, req.user);
  }

  @Put()
  @ApiResponse({ type: Pipeline })
  async update(
    @Body() updatePipe: UpdatePipelineDto,
    @Request() req: Request & { user: string },
  ) {
    return await this.pipelineService.update(updatePipe, req.user);
  }

  @Post('/transpile')
  @ApiResponse({ type: TranspilerResponse })
  async transpile(@Body() createPipe: TranspilerRequest) {
    return await this.pipelineService.transpile(createPipe);
  }
}

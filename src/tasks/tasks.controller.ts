import { Body, Controller, Put, Request, UseGuards } from '@nestjs/common';

import { ApiBearerAuth, ApiParam, ApiResponse } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { TasksService } from './tasks.service';
import { RunTaskDto } from './tasks.dto';

@UseGuards(AuthGuard)
@Controller('tasks')
@ApiBearerAuth()
export class TasksController {
  constructor(private readonly service: TasksService) {}

  @Put('run')
  async runTask(
    @Body() runDto: RunTaskDto,
    @Request() req: Request & { user: string },
  ) {
    return await this.service.runTask(runDto.id, req.user);
  }
}

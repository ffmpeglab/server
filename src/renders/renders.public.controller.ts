import { Controller, Get, Param, Request } from '@nestjs/common';

import { RendersService } from './renders.service';
import { ApiParam, ApiResponse } from '@nestjs/swagger';
import { RenderResponse } from '../types';

@Controller('renders/public')
export class RendersPublicController {
  constructor(private readonly renderService: RendersService) {}

  @Get(':id')
  @ApiResponse({ type: RenderResponse })
  @ApiParam({
    name: 'id',
    description: 'The ID of the public render',
    required: true,
    type: String,
  })
  async getPublicRender(@Param() params: { id: string }) {
    return await this.renderService.getPublicRender(params.id);
  }
}

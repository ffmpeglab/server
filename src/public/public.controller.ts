import { Controller, Get, Param } from '@nestjs/common';

import { RendersService } from '../renders/renders.service';
import { ApiParam, ApiResponse } from '@nestjs/swagger';
import { RenderResponse } from '../types';
import { ItemsService } from '../items/items.service';

@Controller('public')
export class PublicController {
  constructor(
    private readonly renderService: RendersService,
    private readonly itemsService: ItemsService,
  ) {}

  @Get('renders/:id')
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

  @Get('item/:id')
  @ApiResponse({ type: RenderResponse })
  @ApiParam({
    name: 'id',
    description: 'The ID of the public render',
    required: true,
    type: String,
  })
  async getPublicItem(@Param() params: { id: string }) {
    return await this.itemsService.findOnePublic(params.id);
  }

  @Get('folder/:id')
  @ApiResponse({ type: RenderResponse })
  @ApiParam({
    name: 'id',
    description: 'The ID of the public render',
    required: true,
    type: String,
  })
  async getPublicFolder(@Param() params: { id: string }) {
    return await this.itemsService.findByFolderPublic(params.id);
  }
}

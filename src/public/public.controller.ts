import { Controller, Get, Param, Query } from '@nestjs/common';

import { RendersService } from '../renders/renders.service';
import { ApiParam, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { RenderResponse } from '../types';
import { ItemsService } from '../items/items.service';
import { Item } from '../model/item.entity';

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
  @ApiResponse({ type: Item })
  @ApiParam({
    name: 'id',
    description: 'The ID of the public item',
    required: true,
    type: String,
  })
  async getPublicItem(@Param() params: { id: string }) {
    return await this.itemsService.findOnePublic(params.id);
  }

  @Get('folder/:id')
  @ApiResponse({ type: [Item] })
  @ApiParam({
    name: 'id',
    description: 'The ID of the public folder',
    required: true,
    type: String,
  })
  async findByFolderPublic(@Param() params: { id: string }) {
    return await this.itemsService.findByFolderPublic(params.id);
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
  ) {
    return await this.renderService.getPublicRenders(query);
  }
}

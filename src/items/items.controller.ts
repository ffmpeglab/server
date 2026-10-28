import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Request,
  UseGuards,
} from '@nestjs/common';

import { ApiBearerAuth, ApiParam, ApiResponse } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { ItemsService } from './items.service';
import { Item } from '../model/item.entity';
import { CreateItemDto, UpdateItemDto } from './items.dto';

@UseGuards(AuthGuard)
@Controller('item')
@ApiBearerAuth()
export class ItemsController {
  constructor(private readonly service: ItemsService) {}

  @Get('/folder/')
  @ApiResponse({ type: [Item] })
  async findAllFolders(@Request() req: Request & { user: string }) {
    return await this.service.findAllFolders(req.user);
  }

  @Get('/folder/:folderId')
  @ApiParam({
    name: 'folderId',
    description: 'The folderId for the folder content to be selected',
    required: true,
    type: String,
  })
  @ApiResponse({ type: [Item] })
  async findByProject(
    @Param() params: { folderId: string },
    @Request() req: Request & { user: string },
  ) {
    return await this.service.findByFolder(params.folderId, req.user);
  }

  @Delete(':id')
  @ApiParam({
    name: 'id',
    description: 'The ID of the pipeline',
    required: true,
    type: String,
  })
  async deleteOne(
    @Param() params: { id: string },
    @Request() req: Request & { user: string },
  ) {
    return await this.service.deleteOne(params.id, req.user);
  }

  @Get(':id')
  @ApiResponse({ type: Item })
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
    return await this.service.findOne(params.id, req.user);
  }

  @Post()
  @ApiResponse({ type: Item })
  async create(
    @Body() createDto: CreateItemDto,
    @Request() req: Request & { user: string },
  ) {
    return await this.service.create(createDto, req.user);
  }

  @Put()
  @ApiResponse({ type: Item })
  async update(
    @Body() update: UpdateItemDto,
    @Request() req: Request & { user: string },
  ) {
    return await this.service.update(update, req.user);
  }
}

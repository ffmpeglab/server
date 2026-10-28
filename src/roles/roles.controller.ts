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
import { RolesService } from './roles.service';
import { CreateItemDto, UpdateItemDto } from './roles.dto';
import { Role } from '../model/roles.entity';

@UseGuards(AuthGuard)
@Controller('role')
@ApiBearerAuth()
export class RolesController {
  constructor(private readonly service: RolesService) {}

  @Get('/')
  @ApiResponse({ type: [Role] })
  async findAllFolders(@Request() req: Request & { user: string }) {
    return await this.service.findAllRoles(req.user);
  }

  @Get('/folder/:folderId')
  @ApiParam({
    name: 'folderId',
    description: 'The folderId for the folder content to be selected',
    required: true,
    type: String,
  })
  @ApiResponse({ type: [Role] })
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
  @ApiResponse({ type: Role })
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
  @ApiResponse({ type: Role })
  async create(
    @Body() createDto: CreateItemDto,
    @Request() req: Request & { user: string },
  ) {
    return await this.service.create(createDto, req.user);
  }

  @Put()
  @ApiResponse({ type: Role })
  async update(
    @Body() update: UpdateItemDto,
    @Request() req: Request & { user: string },
  ) {
    return await this.service.update(update, req.user);
  }
}

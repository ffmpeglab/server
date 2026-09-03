import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';

import { ApiBearerAuth, ApiParam, ApiResponse } from '@nestjs/swagger';
import { ApiKeyService } from './apikey.service';
import { ApiKey } from '../model/apikey.entity';

import { withSupabase, SupabaseCtx } from '@supabase/server/adapters/nestjs';
import type { SupabaseContext } from '@supabase/server';
import { config } from '../config';

@Controller('apikey')
@UseGuards(
  withSupabase({
    auth: 'user',
    env: {
      url: config.supabaseHost,
      publishableKeys: {
        default: config.supabaseAnonKey,
      },
      secretKeys: { default: config.supabaseSecretKey },
      jwks: new URL(config.supabaseJWKUrl),
    },
  }),
)
@ApiBearerAuth()
export class ApiKeyController {
  constructor(private readonly apikeyService: ApiKeyService) {}
  @Get('')
  @ApiResponse({ type: [ApiKey] })
  async findAll(
    @SupabaseCtx('userClaims') user: SupabaseContext['userClaims'],
  ) {
    return (await this.apikeyService.findAll(user!.id)).map((i) => ({
      ...i,
      apikey: undefined,
    }));
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
    @SupabaseCtx('userClaims') user: SupabaseContext['userClaims'],
  ) {
    return await this.apikeyService.deleteOne(params.id, user!.id);
  }

  @Post()
  @ApiResponse({ type: ApiKey })
  async create(@SupabaseCtx('userClaims') user: SupabaseContext['userClaims']) {
    return await this.apikeyService.create(user!.id);
  }
}
